const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { version, productName } = require('../package.json');
const { cleanupProfile } = require('./desktop-test.cjs');
const root = path.resolve(__dirname, '..');
const dist = path.resolve(root, process.env.TEMPO_BUILD_DIR || 'dist');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 180000,
    ...options,
  });
  if (result.status !== 0)
    throw new Error(
      `${path.basename(command)} failed (${result.status}): ${result.error?.message || result.stderr || result.stdout}`,
    );
  if (result.stdout) process.stdout.write(result.stdout);
}
function smoke(executable) {
  if (!fs.existsSync(executable))
    throw new Error(`Installed executable is missing: ${executable}`);
  run(process.execPath, [path.join(__dirname, 'smoke.cjs')], {
    env: { ...process.env, TEMPO_TEST_EXECUTABLE: executable },
  });
}

(async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'paijian-install-'));
  const platform = process.platform === 'win32' ? 'win' : 'mac';
  const stem = path.join(
    dist,
    `Paijian-Tempo-${version}-${platform}-${process.arch}`,
  );
  try {
    if (process.platform === 'win32') {
      const installed = path.join(base, 'installed');
      run(`${stem}.exe`, ['/S', '/currentuser', `/D=${installed}`], {
        windowsHide: true,
      });
      smoke(path.join(installed, `${productName}.exe`));
      const uninstall = fs
        .readdirSync(installed)
        .find((file) => /uninstall.*\.exe$/i.test(file));
      if (!uninstall) throw new Error('Uninstaller was not installed');
      run(path.join(installed, uninstall), ['/S'], { windowsHide: true });
      for (
        let i = 0;
        i < 75 && fs.existsSync(path.join(installed, `${productName}.exe`));
        i += 1
      )
        await new Promise((resolve) => setTimeout(resolve, 200));
      if (fs.existsSync(path.join(installed, `${productName}.exe`)))
        throw new Error('Uninstaller did not remove the application');
      console.log(
        'PASS Windows per-user install, packaged audio checks, and uninstall',
      );
      const portable = path.join(base, 'portable');
      run(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          'Expand-Archive -LiteralPath $env:TEMPO_ZIP -DestinationPath $env:TEMPO_EXTRACT',
        ],
        {
          env: {
            ...process.env,
            TEMPO_ZIP: `${stem}.zip`,
            TEMPO_EXTRACT: portable,
          },
        },
      );
      smoke(path.join(portable, `${productName}.exe`));
      console.log('PASS Windows portable ZIP');
    } else if (process.platform === 'darwin') {
      const mount = path.join(base, 'volume');
      fs.mkdirSync(mount);
      run('hdiutil', [
        'attach',
        '-readonly',
        '-nobrowse',
        '-mountpoint',
        mount,
        `${stem}.dmg`,
      ]);
      try {
        const installed = path.join(base, `${productName}.app`);
        run('ditto', [path.join(mount, `${productName}.app`), installed]);
        smoke(path.join(installed, 'Contents', 'MacOS', productName));
      } finally {
        run('hdiutil', ['detach', mount]);
      }
      console.log(
        'PASS macOS DMG mount, drag-copy installation, and packaged audio checks',
      );
      const portable = path.join(base, 'portable');
      run('ditto', ['-x', '-k', `${stem}.zip`, portable]);
      smoke(
        path.join(
          portable,
          `${productName}.app`,
          'Contents',
          'MacOS',
          productName,
        ),
      );
      console.log('PASS macOS ZIP');
    } else throw new Error('Installer verification requires Windows or macOS');
  } finally {
    cleanupProfile(base);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
