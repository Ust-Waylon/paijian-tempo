const fs = require('node:fs');
const path = require('node:path');

function packagedExecutable(root) {
  if (process.env.TEMPO_TEST_EXECUTABLE)
    return path.resolve(process.env.TEMPO_TEST_EXECUTABLE);
  const base = path.resolve(root, process.env.TEMPO_BUILD_DIR || 'dist');
  const name = require('../package.json').productName;
  const candidates =
    process.platform === 'win32'
      ? [
          path.join(
            base,
            process.arch === 'x64'
              ? 'win-unpacked'
              : `win-${process.arch}-unpacked`,
            `${name}.exe`,
          ),
        ]
      : [
          path.join(
            base,
            `mac-${process.arch}`,
            `${name}.app`,
            'Contents',
            'MacOS',
            name,
          ),
          path.join(base, 'mac', `${name}.app`, 'Contents', 'MacOS', name),
          path.join(
            base,
            'mac-universal',
            `${name}.app`,
            'Contents',
            'MacOS',
            name,
          ),
        ];
  const executable = candidates.find((candidate) => fs.existsSync(candidate));
  if (!executable)
    throw new Error(
      `Packaged executable not found. Run npm run pack first. Checked: ${candidates.join(', ')}`,
    );
  return executable;
}

async function preparePage(page) {
  if (!process.env.CI && process.env.TEMPO_TEST_SILENT_AUDIO !== '1') return;
  page.setDefaultTimeout(60000);
  // CI has no physical speakers. This keeps the real-time audio graph and
  // AudioWorklet running while routing only the hardware output to a null sink.
  const silentAudio = () => {
    if (window.__tempoSilentAudio) return;
    const Base = window.AudioContext;
    window.AudioContext = class extends Base {
      constructor(options) {
        super({ ...options, sinkId: { type: 'none' } });
      }
    };
    window.__tempoSilentAudio = true;
  };
  await page.addInitScript(silentAudio);
  await page.evaluate(silentAudio);
}

function cleanupProfile(profile) {
  fs.rmSync(profile, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 200,
  });
}

module.exports = { packagedExecutable, preparePage, cleanupProfile };
