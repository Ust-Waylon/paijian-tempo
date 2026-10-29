# Contributing

Bug reports, small improvements, and new practice grooves are welcome.

## Development

Use Node.js 22.12 or later. The desktop app is currently verified on macOS with
Apple Silicon.

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
a Mac. These checks open real Electron windows and play short audio sequences.
They use temporary profiles and do not alter normal practice settings. Running
these desktop checks does not require downloading Playwright browsers.

`npm run pack` builds a macOS application. `npm run test:packaged` checks the
packaged app on Apple Silicon. Regenerate the committed icon assets with
`npm run icons` after changing `build/icon.svg`.

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
