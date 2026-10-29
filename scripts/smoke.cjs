const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const asar = require('@electron/asar');
const {
  packagedExecutable,
  preparePage,
  cleanupProfile,
} = require('./desktop-test.cjs');
(async () => {
  const root = path.resolve(__dirname, '..');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tempo-packaged-'));
  const executable = packagedExecutable(root);
  const app = await electron.launch({
    executablePath: executable,
    env: { ...process.env, TEMPO_TEST_PROFILE: profile },
  });
  try {
    const page = await app.firstWindow();
    await preparePage(page);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.waitForSelector('.beat-button');
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await app.evaluate(({ app }) => app.isPackaged), true);
    assert.equal(
      await app.evaluate(({ app }) => app.getVersion()),
      require('../package.json').version,
    );
    assert.equal(await app.evaluate(() => process.arch), process.arch);
    const archive = await app.evaluate(({ app }) => app.getAppPath());
    const files = asar
      .listPackage(archive)
      .map((file) => file.replaceAll('\\', '/'));
    const notices = [
      'LICENSE',
      'THIRD_PARTY_NOTICES.md',
      'assets/fonts/LICENSE-Instrument-Sans.txt',
      'assets/fonts/LICENSE-Instrument-Serif.txt',
    ].every((file) => files.includes(`/${file}`));
    assert.ok(notices, 'The installed app includes its license notices');
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight,
      ),
    );
    const contrast = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      const lum = (hex) => {
        const c = hex
          .trim()
          .slice(1)
          .match(/../g)
          .map((x) => parseInt(x, 16) / 255)
          .map((v) =>
            v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
          );
        return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
      };
      const fg = lum(s.getPropertyValue('--muted'));
      return ['--chassis', '--surface', '--stage', '--inset'].map((name) => {
        const bg = lum(s.getPropertyValue(name));
        return [name, (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)];
      });
    });
    assert.ok(
      contrast.every(([, ratio]) => ratio >= 4.5),
      JSON.stringify(contrast),
    );
    await page.screenshot({ path: path.join(root, 'qa/desktop-light.png') });
    await page.evaluate(() => {
      const Base = window.AudioWorkletNode;
      window.__packagedTicks = [];
      window.AudioWorkletNode = class extends Base {
        constructor(context, ...args) {
          super(context, ...args);
          this.port.addEventListener('message', (event) => {
            if (event.data.type === 'tick')
              window.__packagedTicks.push(event.data);
          });
          window.__packagedAnalyser = context.createAnalyser();
          window.__packagedAnalyser.fftSize = 2048;
          this.connect(window.__packagedAnalyser);
        }
      };
    });
    await page.locator('#playButton').click();
    await page.waitForFunction(
      () =>
        document.querySelector('#playButton').getAttribute('aria-pressed') ===
        'true',
    );
    await page.waitForTimeout(1200);
    assert.match(
      await page.locator('#statusText').textContent(),
      /第 \d+ 小节/,
    );
    assert.notEqual(await page.locator('#sessionTime').textContent(), '00:00');
    await page.screenshot({ path: path.join(root, 'qa/desktop-playing.png') });
    await page.locator('#playButton').click();
    await page.locator('[data-mode="drums"]').click();
    await page.locator('[data-drum-pattern="rock"]').click();
    await page.locator('#playButton').click();
    await page.waitForFunction(() =>
      window.__packagedTicks.some((tick) => tick.mode === 'drums'),
    );
    await page.waitForFunction(() => {
      const data = new Float32Array(2048);
      window.__packagedAnalyser.getFloatTimeDomainData(data);
      return data.some((sample) => Math.abs(sample) > 0.001);
    });
    await page.locator('[data-drum-pattern="shuffle"]').click();
    await page.waitForFunction(() =>
      window.__packagedTicks.some(
        (tick) => tick.mode === 'drums' && tick.drumPattern === 'shuffle',
      ),
    );
    const shuffle = await page.evaluate(() =>
      window.__packagedTicks.find(
        (tick) => tick.mode === 'drums' && tick.drumPattern === 'shuffle',
      ),
    );
    assert.equal(shuffle.step, 0);
    assert.equal(shuffle.subdivision, 3);
    await page.locator('#playButton').click();
    await page.locator('[data-mode="metronome"]').click();
    await page.locator('#themeButton').click();
    await page.waitForTimeout(240);
    await page.locator('#resetSession').click();
    await page
      .locator('#toast')
      .evaluate((el) => el.classList.remove('visible'));
    await page.screenshot({ path: path.join(root, 'qa/desktop-dark.png') });
    await page.locator('#focusButton').click();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight,
      ),
    );
    await page.screenshot({ path: path.join(root, 'qa/focus-dark.png') });
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        packaged: true,
        audio: 'passed',
        layout: 'passed',
        mutedTextContrast: contrast,
        errors,
      }),
    );
    fs.writeFileSync(
      path.join(root, 'qa/packaged-report.json'),
      JSON.stringify(
        {
          packaged: true,
          audio: 'passed',
          layout: 'passed',
          mutedTextContrast: contrast,
          errors,
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    await app.close();
    cleanupProfile(profile);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
