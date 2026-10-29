const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

(async () => {
  const root = path.resolve(__dirname, '..');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tempo-qa-'));
  const app = await electron.launch({
    executablePath: process.env.TEMPO_ELECTRON || require('electron'),
    args: [root],
    timeout: 30000,
    env: { ...process.env, TEMPO_TEST_PROFILE: profile },
  });
  const report = [];
  const errors = [];
  const record = (text) => {
    report.push(text);
    console.log('PASS ' + text);
  };
  try {
    const page = await app.firstWindow();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.waitForSelector('.beat-button');
    await page.evaluate(() => document.fonts.ready);
    const size = await page.evaluate(() => ({
      w: innerWidth,
      h: innerHeight,
      sh: document.documentElement.scrollHeight,
      sw: document.documentElement.scrollWidth,
    }));
    assert.ok(size.sh <= size.h, JSON.stringify(size));
    assert.equal(size.sw, size.w);
    await page.screenshot({ path: path.join(root, 'qa/desktop-light.png') });
    record('Default desktop window displays every control without scrolling');

    const setBpm = async (value) => {
      await page.locator('#bpmInput').fill(String(value));
      await page.locator('#bpmInput').press('Enter');
    };
    await setBpm(500);
    assert.equal(await page.locator('#bpmInput').inputValue(), '240');
    await setBpm(1);
    assert.equal(await page.locator('#bpmInput').inputValue(), '30');
    await setBpm(120);
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.locator('#bpmInput').inputValue(), '121');
    await page.keyboard.press('Shift+ArrowDown');
    assert.equal(await page.locator('#bpmInput').inputValue(), '111');
    record('Tempo entry clamps correctly; keyboard adjusts by 1 and 10 BPM');

    const rect = await page.locator('#tempoDial').boundingBox();
    await page.mouse.click(
      rect.x + rect.width / 2,
      rect.y + rect.height * 0.07,
    );
    assert.ok(Number(await page.locator('#bpmInput').inputValue()) >= 130);
    record('Dial pointer input sets the tempo');

    await page.locator('#meterSelect').selectOption('6/8');
    assert.equal(await page.locator('.beat-button').count(), 6);
    assert.equal(
      await page.locator('.beat-button[data-accent="2"]').count(),
      2,
    );
    const beat = page.locator('.beat-button').first();
    await beat.click();
    assert.equal(await beat.getAttribute('data-accent'), '1');
    await page.keyboard.press('Space');
    assert.equal(await beat.getAttribute('data-accent'), '0');
    await beat.click();
    assert.equal(await beat.getAttribute('data-accent'), '2');
    await page.locator('[data-subdivision="3"]').click();
    assert.equal(
      await page.locator('#subdivisionValue').textContent(),
      '每拍 3 声',
    );
    await page.locator('[data-sound="rim"]').click();
    record(
      '6/8 groups, per-beat accents, keyboard activation, subdivisions, and sounds work',
    );

    await page.locator('#volumeInput').fill('42');
    await page.locator('#muteButton').click();
    assert.equal(
      await page.locator('#muteButton').getAttribute('aria-pressed'),
      'true',
    );
    await page.locator('#muteButton').click();
    assert.equal(await page.locator('#volumeInput').inputValue(), '42');
    record('Muting preserves the selected volume');

    await page.locator('#addPreset').click();
    await page.locator('#presetName').fill('三连练习');
    await page.locator('#presetForm button[type=submit]').click();
    assert.equal(await page.locator('.preset-button').count(), 4);
    await page.locator('[data-preset="slow"]').click();
    assert.equal(await page.locator('#bpmInput').inputValue(), '60');
    await page
      .getByRole('button', { name: '三连练习', exact: false })
      .first()
      .click();
    assert.equal(await page.locator('#meterSelect').inputValue(), '6/8');
    assert.equal(
      await page.locator('[data-subdivision="3"]').getAttribute('aria-pressed'),
      'true',
    );
    record(
      'Custom presets restore tempo, meter, subdivisions, accents, and sound',
    );

    await page.reload();
    await page.waitForSelector('.beat-button');
    assert.equal(await page.locator('#meterSelect').inputValue(), '6/8');
    assert.equal(await page.locator('#volumeInput').inputValue(), '42');
    assert.equal(await page.locator('.preset-button').count(), 4);
    record('Preferences and custom presets survive restarting the page');

    await page.locator('#practiceSettings').click();
    await page.locator('#practiceEvery').fill('1');
    await page.locator('#practiceStep').fill('3');
    await page.locator('#practiceGoal').fill('200');
    await page.locator('#durationSelect').selectOption('300');
    await page.locator('#practiceForm button[type=submit]').click();
    assert.match(await page.locator('#sessionTime').textContent(), /05:00/);
    assert.equal(
      await page.locator('#practiceSummary').textContent(),
      '每 1 小节加快 3 BPM',
    );
    await page.locator('#practiceToggle').click();
    assert.equal(
      await page.locator('#practiceToggle').getAttribute('aria-checked'),
      'true',
    );
    await page.locator('#practiceToggle').click();
    record('Progressive practice and duration settings save and validate');

    await page.locator('[data-preset="flow"]').click();
    await page.evaluate(() => {
      window.__tempoTicks = [];
      const Original = window.AudioWorkletNode;
      window.AudioWorkletNode = class extends Original {
        constructor(...args) {
          super(...args);
          this.port.addEventListener('message', (e) => {
            if (e.data.type === 'tick') window.__tempoTicks.push(e.data);
          });
        }
      };
    });
    await page.locator('#playButton').click();
    await page.waitForFunction(
      () =>
        document.querySelector('#playButton').getAttribute('aria-pressed') ===
        'true',
    );
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const until = performance.now() + 1200;
      while (performance.now() < until) {}
    });
    await page.waitForTimeout(300);
    const ticks = await page.evaluate(() =>
      window.__tempoTicks.map((t) => t.audioTime),
    );
    assert.ok(ticks.length >= 4, JSON.stringify(ticks));
    for (let i = 1; i < ticks.length; i += 1)
      assert.ok(
        Math.abs(ticks[i] - ticks[i - 1] - 0.5) < 0.00004,
        JSON.stringify(ticks),
      );
    record(
      'Actual AudioWorklet keeps 120 BPM while the UI thread is blocked for 1.2 seconds',
    );
    await page.screenshot({ path: path.join(root, 'qa/desktop-playing.png') });

    const before = await page.locator('#sessionTime').textContent();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].minimize(),
    );
    await page.waitForTimeout(2200);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].restore(),
    );
    await page.waitForTimeout(200);
    assert.notEqual(await page.locator('#sessionTime').textContent(), before);
    assert.equal(
      await page.locator('#playButton').getAttribute('aria-pressed'),
      'true',
    );
    record(
      'Playback and the practice clock continue while the desktop window is minimized',
    );
    await page.locator('#playButton').click();
    await page.waitForTimeout(100);
    const paused = await page.locator('#sessionTime').textContent();
    await page.waitForTimeout(1100);
    assert.equal(await page.locator('#sessionTime').textContent(), paused);
    await page.locator('#resetSession').click();
    assert.match(await page.locator('#sessionTime').textContent(), /^00:00/);
    record('Pause freezes elapsed time; reset clears the practice clock');

    await page.locator('#pinButton').click();
    assert.equal(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isAlwaysOnTop(),
      ),
      true,
    );
    await page.locator('#pinButton').click();
    record('Window pin toggles the native always-on-top property');
    await page.locator('#themeButton').click();
    await page.waitForTimeout(240);
    await page.screenshot({ path: path.join(root, 'qa/desktop-dark.png') });
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.locator('#focusButton').click();
    assert.equal(await page.locator('.controls-panel').isVisible(), false);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight,
      ),
      'focus mode fits in the default window',
    );
    await page.screenshot({ path: path.join(root, 'qa/focus-dark.png') });
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.controls-panel').isVisible(), true);
    await page.locator('#themeButton').click();
    record(
      'Light/dark themes and focus mode work; Escape restores the controls',
    );
    await page.locator('#shortcutsButton').click();
    assert.equal(await page.locator('#shortcutsDialog').isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#shortcutsDialog').isVisible(), false);
    record('Shortcut dialog opens and dismisses with Escape');

    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('.beat-button');
    await page
      .locator('#toast')
      .evaluate((el) => el.classList.remove('visible'));
    await page.screenshot({ path: path.join(root, 'qa/desktop-light.png') });
    await page.locator('#themeButton').click();
    await page.waitForTimeout(240);
    await page.screenshot({ path: path.join(root, 'qa/desktop-dark.png') });
    await page.locator('#focusButton').click();
    await page.screenshot({ path: path.join(root, 'qa/focus-dark.png') });
    await page.locator('#focusButton').click();
    await page.locator('#themeButton').click();
    await page.locator('#practiceSettings').click();
    await page.screenshot({
      path: path.join(root, 'qa/practice-settings.png'),
    });
    await page.keyboard.press('Escape');
    for (const width of [800, 680, 375]) {
      await app.evaluate(({ BrowserWindow }, w) => {
        const window = BrowserWindow.getAllWindows()[0];
        window.setMinimumSize(320, 600);
        window.setSize(w, 812);
      }, width);
      await page.waitForTimeout(100);
      const bounds = await page.evaluate(() => ({
        w: innerWidth,
        sw: document.documentElement.scrollWidth,
      }));
      assert.ok(bounds.sw <= bounds.w, JSON.stringify(bounds));
      await page.screenshot({
        path: path.join(root, `qa/width-${width}.png`),
        fullPage: true,
      });
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(
      await page
        .locator('#phaseProgress')
        .evaluate((el) => getComputedStyle(el).display),
      'none',
    );
    record(
      '800px, 680px, and 375px layouts have no horizontal overflow; reduced motion is supported',
    );
    assert.deepEqual(errors, []);
    record('No renderer errors or CSP errors');
    fs.writeFileSync(
      path.join(root, 'qa/report.json'),
      JSON.stringify({ checks: report, errors }, null, 2) + '\n',
    );
    console.log(`Completed ${report.length} interaction checks.`);
  } finally {
    await app.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
