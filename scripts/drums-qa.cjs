const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  packagedExecutable,
  preparePage,
  cleanupProfile,
} = require('./desktop-test.cjs');

(async () => {
  const root = path.resolve(__dirname, '..');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tempo-drums-'));
  const packaged = process.env.TEMPO_PACKAGED === '1';
  const app = await electron.launch({
    executablePath: packaged
      ? packagedExecutable(root)
      : process.env.TEMPO_ELECTRON || require('electron'),
    args: packaged ? [] : [root],
    env: { ...process.env, TEMPO_TEST_PROFILE: profile },
    timeout: 30000,
  });
  const checks = [],
    errors = [];
  const pass = (text) => {
    checks.push(text);
    console.log('PASS ' + text);
  };
  let page;
  try {
    page = await app.firstWindow();
    await preparePage(page);
    if (packaged) {
      assert.equal(await app.evaluate(({ app }) => app.isPackaged), true);
      const version = require('../package.json').version;
      assert.equal(await app.evaluate(({ app }) => app.getVersion()), version);
      pass(`The packaged version ${version} starts successfully`);
    }
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.waitForSelector('.beat-button');
    await page.evaluate(() =>
      localStorage.setItem(
        'tempo-studio-v1',
        JSON.stringify({
          settings: {
            bpm: 94,
            meter: '3/4',
            subdivision: 3,
            sound: 'soft',
            volume: 33,
            accents: [2, 1, 1],
          },
          presets: [
            {
              id: 'legacy',
              name: '旧版练习',
              custom: true,
              bpm: 84,
              meter: '3/4',
              subdivision: 1,
              sound: 'wood',
              accents: [2, 1, 1],
            },
          ],
        }),
      ),
    );
    await page.reload();
    await page.waitForSelector('.beat-button');
    assert.equal(await page.locator('#bpmInput').inputValue(), '94');
    assert.equal(
      await page
        .locator('[data-mode="metronome"]')
        .getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(await page.locator('[data-preset="legacy"]').count(), 1);
    pass(
      'Version 1.0 preferences and custom presets migrate without losing settings',
    );

    const setBpm = async (bpm) => {
      await page.locator('#bpmInput').fill(String(bpm));
      await page.locator('#bpmInput').press('Enter');
    };
    await page.locator('[data-mode="drums"]').click();
    await setBpm(120);
    assert.equal(await page.locator('.drum-pattern-button').count(), 6);
    assert.equal(await page.locator('.sound-options').isVisible(), false);
    assert.equal(await page.locator('#meterSelect').isVisible(), false);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight,
      ),
      'drum mode fits the default window',
    );
    for (const pattern of [
      'rock',
      'pop',
      'funk',
      'disco',
      'shuffle',
      'halftime',
    ]) {
      await page.locator(`[data-drum-pattern="${pattern}"]`).click();
      assert.equal(await page.locator('#bpmInput').inputValue(), '120');
      assert.equal(
        await page.locator('#drumGrid').getAttribute('data-pattern'),
        pattern,
      );
      assert.equal(
        await page.locator('.drum-step').count(),
        pattern === 'shuffle' ? 36 : 48,
      );
    }
    pass('All six drum grooves are selectable and preserve the shared BPM');

    await page.locator('[data-drum-pattern="rock"]').click();
    await page.evaluate(() => {
      window.__drumTicks = [];
      const Base = window.AudioWorkletNode;
      window.AudioWorkletNode = class extends Base {
        constructor(context, ...args) {
          super(context, ...args);
          const analyser = context.createAnalyser();
          analyser.fftSize = 2048;
          this.connect(analyser);
          window.__drumAnalyser = analyser;
          this.port.addEventListener('message', (e) => {
            if (e.data.type === 'tick') window.__drumTicks.push(e.data);
          });
        }
      };
    });
    await page.locator('#playButton').click();
    await page.waitForFunction(() => window.__drumTicks.length >= 3);
    await page.waitForFunction(() => {
      const a = new Float32Array(2048);
      window.__drumAnalyser.getFloatTimeDomainData(a);
      return a.some((v) => Math.abs(v) > 0.001);
    });
    await page.evaluate(() => {
      const until = performance.now() + 450;
      while (performance.now() < until) {}
    });
    await page.waitForTimeout(200);
    const ticks = await page.evaluate(() => window.__drumTicks);
    assert.ok(
      ticks.every(
        (t) => t.mode === 'drums' && t.beats === 4 && t.subdivision === 4,
      ),
    );
    for (let i = 1; i < ticks.length; i++)
      assert.ok(
        Math.abs(ticks[i].audioTime - ticks[i - 1].audioTime - 0.125) < 0.00004,
      );
    pass(
      'Real drum output is audible and stays at 120 BPM while the UI thread is busy',
    );

    await setBpm(96);
    await page.waitForFunction(
      () => window.__drumTicks.filter((t) => t.bpm === 96).length >= 5,
    );
    const slower = await page.evaluate(() =>
      window.__drumTicks.filter((t) => t.bpm === 96),
    );
    for (let i = 1; i < slower.length; i++)
      assert.ok(
        Math.abs(slower[i].audioTime - slower[i - 1].audioTime - 60 / 96 / 4) <
          0.00004,
      );
    pass(
      'Changing BPM changes the actual drum clock without restarting playback',
    );
    const tapTimes = await page.evaluate(async () => {
      const times = [];
      for (let i = 0; i < 3; i += 1) {
        times.push(performance.now());
        document.querySelector('#tapButton').click();
        if (i < 2) await new Promise((resolve) => setTimeout(resolve, 600));
      }
      return times;
    });
    const tapped = Number(await page.locator('#bpmInput').inputValue());
    assert.ok(
      Math.abs(tapped - Math.round(120000 / (tapTimes[2] - tapTimes[0]))) <= 1,
      String(tapped),
    );
    pass('Tap tempo also controls the drum machine');

    await setBpm(120);
    await page.locator('[data-drum-pattern="shuffle"]').click();
    await page.waitForFunction(() =>
      window.__drumTicks.some((t) => t.drumPattern === 'shuffle'),
    );
    const transition = await page.evaluate(() => {
      const i = window.__drumTicks.findIndex(
        (t) => t.drumPattern === 'shuffle',
      );
      return {
        next: window.__drumTicks[i],
        previous: window.__drumTicks[i - 1],
      };
    });
    assert.equal(transition.next.step, 0);
    assert.equal(transition.next.subdivision, 3);
    assert.equal(transition.previous.step, 15);
    assert.equal(transition.next.bar, transition.previous.bar + 1);
    assert.equal(await page.locator('#bpmInput').inputValue(), '120');
    await page.waitForFunction(
      () => document.querySelectorAll('.drum-step.is-current').length === 3,
    );
    pass('Shuffle enters on the next bar with a synchronized three-part grid');

    await page.locator('[data-drum-track="snare"]').click();
    assert.equal(
      await page
        .locator('[data-drum-track="snare"]')
        .getAttribute('aria-pressed'),
      'true',
    );
    await page.keyboard.press('Space');
    assert.equal(
      await page
        .locator('[data-drum-track="snare"]')
        .getAttribute('aria-pressed'),
      'false',
    );
    for (const track of ['kick', 'snare', 'hat'])
      await page.locator(`[data-drum-track="${track}"]`).click();
    assert.equal(await page.locator('.drum-lane.muted').count(), 3);
    await page.waitForFunction(() => {
      const data = new Float32Array(2048);
      window.__drumAnalyser.getFloatTimeDomainData(data);
      return data.every((sample) => sample === 0);
    });
    const peak = await page.evaluate(() => {
      const a = new Float32Array(2048);
      window.__drumAnalyser.getFloatTimeDomainData(a);
      return Math.max(...a.map(Math.abs));
    });
    assert.equal(peak, 0);
    assert.equal(
      await page.locator('#playButton').getAttribute('aria-pressed'),
      'true',
    );
    for (const track of ['kick', 'snare', 'hat'])
      await page.locator(`[data-drum-track="${track}"]`).click();
    pass(
      'Individual track mute is keyboard accessible; muting all tracks silences real audio without stopping the clock',
    );

    await page.locator('#playButton').click();
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.drum-step.is-current').count(), 0);
    const paused = await page.locator('#sessionTime').textContent();
    await page.waitForTimeout(700);
    assert.equal(await page.locator('#sessionTime').textContent(), paused);
    await page.locator('[data-preset="slow"]').click();
    assert.equal(await page.locator('#bpmInput').inputValue(), '60');
    assert.equal(
      await page.locator('[data-mode="drums"]').getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(
      await page.locator('#drumGrid').getAttribute('data-pattern'),
      'shuffle',
    );
    await page.locator('[data-preset="flow"]').click();
    pass(
      'Pause clears the playhead and freezes the timer; quick tempo presets keep the selected drum groove',
    );

    await page.locator('[data-drum-pattern="funk"]').click();
    await page.locator('[data-drum-track="hat"]').click();
    await page.locator('#addPreset').click();
    await page.locator('#presetName').fill('放克伴奏');
    await page.locator('#presetForm button[type=submit]').click();
    await page.locator('[data-mode="metronome"]').click();
    assert.equal(await page.locator('#meterSelect').inputValue(), '3/4');
    assert.equal(
      await page.locator('[data-subdivision="3"]').getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(
      await page.locator('[data-sound="soft"]').getAttribute('aria-pressed'),
      'true',
    );
    await page
      .getByRole('button', { name: '放克伴奏 120', exact: true })
      .click();
    assert.equal(
      await page.locator('[data-mode="drums"]').getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(
      await page.locator('#drumGrid').getAttribute('data-pattern'),
      'funk',
    );
    assert.equal(
      await page
        .locator('[data-drum-track="hat"]')
        .getAttribute('aria-pressed'),
      'true',
    );
    await page.reload();
    await page.waitForSelector('.drum-pattern-button');
    assert.equal(
      await page.locator('[data-mode="drums"]').getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(
      await page.locator('#drumGrid').getAttribute('data-pattern'),
      'funk',
    );
    assert.equal(
      await page
        .locator('[data-drum-track="hat"]')
        .getAttribute('aria-pressed'),
      'true',
    );
    pass(
      'Drum presets and track mutes survive reload; returning to metronome restores its meter, subdivision and sound',
    );

    await page.locator('[data-drum-pattern="rock"]').click();
    await setBpm(120);
    await page.locator('#resetSession').click();
    await page.locator('#practiceSettings').click();
    await page.locator('#practiceEvery').fill('1');
    await page.locator('#practiceStep').fill('5');
    await page.locator('#practiceGoal').fill('180');
    await page.locator('#durationSelect').selectOption('300');
    await page.locator('#practiceForm button[type=submit]').click();
    await page.locator('#practiceToggle').click();
    await page.locator('#playButton').click();
    await page.waitForFunction(
      () => document.querySelector('#bpmInput').value === '125',
    );
    assert.match(await page.locator('#sessionTime').textContent(), /05:00/);
    await page.locator('#playButton').click();
    await page.locator('#practiceToggle').click();
    pass(
      'Progressive practice increases drum BPM after a complete bar and shares the practice timer',
    );

    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('.beat-button');
    await page.locator('[data-mode="drums"]').click();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(240);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight,
      ),
    );
    await page.screenshot({ path: path.join(root, 'qa/drums-light.png') });
    await page.locator('#themeButton').click();
    await page.waitForTimeout(240);
    await page.screenshot({ path: path.join(root, 'qa/drums-dark.png') });
    await page.locator('#focusButton').click();
    assert.equal(await page.locator('.controls-panel').isVisible(), false);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight,
      ),
    );
    await page.keyboard.press('Escape');
    await page.locator('#themeButton').click();
    for (const width of [800, 680, 375]) {
      await app.evaluate(({ BrowserWindow }, w) => {
        const win = BrowserWindow.getAllWindows()[0];
        win.setMinimumSize(320, 600);
        win.setSize(w, 812);
      }, width);
      await page.waitForTimeout(100);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.screenshot({
        path: path.join(root, `qa/drums-width-${width}.png`),
        fullPage: true,
      });
    }
    pass(
      'Drum mode supports light, dark and focus views, with responsive 800px, 680px and 375px layouts',
    );
    assert.deepEqual(errors, []);
    pass('No JavaScript, audio worklet or CSP errors');
    fs.writeFileSync(
      path.join(
        root,
        packaged ? 'qa/drums-packaged-report.json' : 'qa/drums-report.json',
      ),
      JSON.stringify({ packaged, checks, errors }, null, 2) + '\n',
    );
    console.log(`Completed ${checks.length} drum-machine checks.`);
  } catch (error) {
    if (page)
      await page
        .screenshot({
          path: path.join(root, 'qa/drums-failure.png'),
          fullPage: true,
        })
        .catch(() => {});
    throw error;
  } finally {
    await app.close();
    cleanupProfile(profile);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
