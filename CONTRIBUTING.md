# Contributing

Bug reports, small improvements, and new practice grooves are welcome.

## Development

Use Node.js 22.12 or later. Development and desktop checks support Windows and macOS.

```sh
npm ci
npm start
```

For a browser preview, run `npm run preview` and open the local address printed
in the terminal. Window pinning is available only in the desktop app.

## Before submitting a change

```sh
npm run format
npm test
```

For changes to controls or audio integration, also run `npm run test:desktop` on
Windows or macOS. These checks open real Electron windows and play short audio sequences.
They use temporary profiles and do not alter normal practice settings. Running
these desktop checks does not require downloading Playwright browsers.

`npm run pack` builds an unpacked application for your operating system. `npm run test:packaged` checks it on the current architecture. `npm run dist:win` creates an EXE installer and ZIP; `npm run dist:mac` creates DMG and ZIP packages. Regenerate the committed icon assets with
`npm run icons` after changing `build/icon.svg`.

## Releases

Bump `package.json` and the lockfile to publish a new stable version. Update versioned download links in both READMEs. A push to `main` starts the release workflow if that version has not already been published.

Each of the four native runners checks source behavior, creates packages, then runs `scripts/verify-installers.cjs`. Windows checks cover a silent per-user install, launch, audio processing, uninstall, and portable ZIP launch. Mac checks mount the DMG, copy and launch the application, and launch the ZIP version. A release becomes public only after all four runners succeed and all eight package uploads are confirmed. Published assets are not overwritten; failed drafts can be resumed.

CI uses a silent AudioContext output sink because runners do not provide physical speakers. The audio graph, analyzers, and real-time worklet clock still run. Physical devices and operating-system trust dialogs require manual checks. To reproduce silent checks locally, set `TEMPO_TEST_SILENT_AUDIO=1`.

The release includes `SHA256SUMS.txt`. Mac builds use ad-hoc signing for bundle integrity. Trusted publisher signing and notarization are not configured; do not describe the builds as Developer ID signed, notarized, or SmartScreen trusted.

## Project layout

- `src/app.mjs`: controls, preferences, presets, and audio-synchronized visuals.
- `src/audio.mjs`: AudioContext and AudioWorklet lifecycle.
- `audio/clock-processor.js`: sample-based timing and sound synthesis.
- `audio/patterns.mjs`: one-bar drum grooves shared by the UI and audio thread.
- `main.cjs`, `preload.cjs`: the desktop window and a narrow IPC bridge.
- `tests/clock.test.cjs`: an audio worklet harness for deterministic timing and
  synthesis tests.

Keep scheduling on the audio thread. UI timers should not decide when a sound
plays. Preserve the existing settings format when adding controls, and keep
all fonts, sounds, and required assets available offline.

Use original or compatibly licensed assets and include any necessary license
notices. Do not commit generated apps, local profiles, credentials, or machine
paths. Include the relevant validation and a screenshot for visible UI changes.
