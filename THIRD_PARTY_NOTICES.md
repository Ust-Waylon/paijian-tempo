# Third-party notices

The application source, original icons, and documentation are available under
the [MIT License](LICENSE). Third-party components retain their own licenses.

## Bundled fonts

The fonts are distributed as font files, with their embedded copyright notices
and original font licenses preserved. They are not covered by this project's MIT
license.

| Files                                                                | Copyright                                           | License                                                                |
| -------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| `assets/fonts/InstrumentSans-Regular.ttf`, `InstrumentSans-Bold.ttf` | Copyright 2022 The Instrument Sans Project Authors  | [SIL Open Font License 1.1](assets/fonts/LICENSE-Instrument-Sans.txt)  |
| `assets/fonts/InstrumentSerif-Italic.ttf`                            | Copyright 2022 The Instrument Serif Project Authors | [SIL Open Font License 1.1](assets/fonts/LICENSE-Instrument-Serif.txt) |

Upstream projects:

- [Instrument Sans](https://github.com/Instrument/instrument-sans)
- [Instrument Serif](https://github.com/Instrument/instrument-serif)

Designed by Rodrigo Fuenzalida with direction from Instrument. Additional
attribution and font license terms are included in the files linked above.

## Desktop runtime and development tools

- [Electron](https://github.com/electron/electron) — MIT; its bundled Chromium
  and other components have additional notices distributed with Electron.
- [electron-builder](https://github.com/electron-userland/electron-builder) — MIT.
- [Playwright](https://github.com/microsoft/playwright) — Apache-2.0.
- [sharp](https://github.com/lovell/sharp) — Apache-2.0; its native dependencies
  carry their own notices.
- [Prettier](https://github.com/prettier/prettier) — MIT.

Dependencies are installed through npm using `package-lock.json`. Their own
license files and notices remain applicable. Packaged desktop distributions
also retain the notices supplied by Electron.

All metronome and drum sounds are synthesized locally by this project's code;
no third-party audio sample pack is bundled.
