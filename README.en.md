# Paijian Tempo · 拍间

**Make a little time for practice.**

An offline Windows and macOS metronome and simple drum machine. No account, ads, or streamed
audio. Open it and start practicing.

[简体中文](README.md) · [Contributing](CONTRIBUTING.md) · [MIT License](LICENSE)

![Paijian Tempo in light mode](docs/images/metronome-light.png)

## Download and install

**Installers are ready to use. Node.js and the source code are not required.**

| Platform                    | Installer                                                                                                           | Portable archive                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Windows · Intel / AMD (x64) | [EXE setup](https://github.com/Ust-Waylon/paijian-tempo/releases/download/v1.2.0/Paijian-Tempo-1.2.0-win-x64.exe)   | [ZIP](https://github.com/Ust-Waylon/paijian-tempo/releases/download/v1.2.0/Paijian-Tempo-1.2.0-win-x64.zip)   |
| Windows · ARM64             | [EXE setup](https://github.com/Ust-Waylon/paijian-tempo/releases/download/v1.2.0/Paijian-Tempo-1.2.0-win-arm64.exe) | [ZIP](https://github.com/Ust-Waylon/paijian-tempo/releases/download/v1.2.0/Paijian-Tempo-1.2.0-win-arm64.zip) |
| macOS · Apple Silicon       | [DMG](https://github.com/Ust-Waylon/paijian-tempo/releases/download/v1.2.0/Paijian-Tempo-1.2.0-mac-arm64.dmg)       | [ZIP](https://github.com/Ust-Waylon/paijian-tempo/releases/download/v1.2.0/Paijian-Tempo-1.2.0-mac-arm64.zip) |
| macOS · Intel               | [DMG](https://github.com/Ust-Waylon/paijian-tempo/releases/download/v1.2.0/Paijian-Tempo-1.2.0-mac-x64.dmg)         | [ZIP](https://github.com/Ust-Waylon/paijian-tempo/releases/download/v1.2.0/Paijian-Tempo-1.2.0-mac-x64.zip)   |

[All releases and SHA-256 checksums](https://github.com/Ust-Waylon/paijian-tempo/releases/latest)

On Windows, run the installer for a per-user installation, or extract the ZIP and run `拍间 Tempo.exe`. On macOS, open the DMG and drag the app to Applications.

These community packages have no trusted publisher certificate or Apple notarization. Your operating system may ask you to confirm the publisher; verify the download came from this repository before continuing.

## Features

- **30–240 BPM** with a draggable tempo dial, direct entry, fine adjustment, and
  tap tempo.
- **Metronome:** multiple meters, 1–4 sounds per beat, and an accent, normal, or
  silent setting for each beat.
- **Six drum grooves:** Rock, Pop, Funk, Disco, Shuffle, and Half-time.
- **Practice tools:** increase BPM every few bars, set a target tempo, and stop
  after a chosen amount of playback time.
- **Presets:** save your setup, or hover over any preset and click × to remove it.
- **Light, dark, and focus views,** keyboard controls, window pinning, and
  continued playback while the window is in the background or minimized.
- **Offline assets:** bundled fonts, locally synthesized sounds, and preferences
  stored on your machine.

## Drum machine

Select **鼓机** at the top left, choose a groove, and use the same tempo dial.

| Groove    | Feel                                                    |
| --------- | ------------------------------------------------------- |
| Rock      | Eighth-note hats, kick on 1 and 3, snare on 2 and 4     |
| Pop       | Syncopated kick and an open hat near the end of the bar |
| Funk      | Sixteenth-note hats, syncopated kick, and a ghost snare |
| Disco     | Four-on-the-floor kick and offbeat open hats            |
| Shuffle   | Triplet grid with a 2:1 long–short hat pattern          |
| Half-time | Snare on beat 3 for a more spacious feel                |

Every groove is a one-bar 4/4 loop. BPM always counts quarter notes, including
Shuffle. Groove changes enter on the next bar. Click the kick, snare, or hat
label to mute that part independently.

![Drum machine in dark mode](docs/images/drums-dark.png)

The interface is currently in Simplified Chinese, with English groove names
and utility labels.

## Run from source

Development requires **Node.js 22.12 or later**. Windows and macOS share the same application source.

```sh
npm ci
npm start
```

Build an unpacked application for the current platform:

```sh
npm run pack
```

Build installers on the corresponding operating system:

```sh
npm run dist:win     # Windows EXE setup and ZIP
npm run dist:mac     # macOS DMG and ZIP
```

Outputs are written to `dist/`. Append `-- --x64` or `-- --arm64` to select an architecture. The release workflow builds and verifies each package on native Windows x64, Windows ARM64, Apple Silicon, and Intel Mac runners before publishing.

For a browser preview, run `npm run preview` and open the local URL printed in
the terminal. Window pinning and the application shortcut menu require the
desktop app.

## Keyboard controls

| Key           | Action                            |
| ------------- | --------------------------------- |
| Space         | Start / pause                     |
| ↑ / ↓         | Change tempo by 1 BPM             |
| Shift + ↑ / ↓ | Change tempo by 10 BPM            |
| T             | Tap tempo                         |
| F             | Toggle focus view                 |
| M             | Mute / unmute                     |
| ?             | Show shortcuts                    |
| Esc           | Close a dialog / leave focus view |

Inputs and focused buttons retain their standard keyboard behavior. Tab to the
tempo dial to adjust it with the arrow keys.

## Audio and verification

The clock and synthesis run on the **AudioWorklet audio thread**. Fractional
sample intervals retain their remainder to avoid accumulating timing error.
Visuals follow the audio output clock. Pause clears active sound tails; meter,
subdivision, and groove changes take effect at bar boundaries.

```sh
npm test                 # 16 audio and clock checks
npm run test:desktop     # Real Electron windows and audio graphs on Windows/macOS
npm run test:packaged    # Check a built application
npm run format:check
```

Desktop checks use temporary profiles and leave normal practice preferences alone. CI routes hardware output to a silent sink while testing the real audio graph and clock. Release checks also install and uninstall the Windows setup, mount and copy the Mac DMG, and launch every extracted ZIP. See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

Application source, original icons, and documentation are available under the
[MIT License](LICENSE). Bundled Instrument Sans and Instrument Serif fonts keep
their SIL Open Font License 1.1 notices. See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
