# Controller to MIDI

Turn your game controller, joystick, or pedal into Sustain, Sostenuto, and Soft MIDI controls.

## Download for Windows

Get the latest version and `.exe` files from the [GitHub Releases page](https://github.com/Froxian55/Controller-To-Midi/releases/latest).

- **Portable**: A single executable; no installation required. Portable builds do not update automatically. Use **Check for updates** to open the latest release page and download the new version.
- **Setup**: A standard Windows installation with Desktop and Start menu shortcuts. Installed builds check for updates automatically, download them in the background, and prompt you to restart to install.

The app requests MIDI access only after you click **Start**. Windows may show a SmartScreen warning for unsigned open-source apps.

## Features

- View connected game controllers and live axis/button signals
- Select a MIDI output and MIDI channel (1–16)
- Learn controller inputs or select them from a list
- Map Sustain (CC 64), Sostenuto (CC 66), and Soft (CC 67)
- Configure analog/threshold mode, inversion, dead zone, and threshold
- Safely stop MIDI output when a controller disconnects
- Save settings locally

## Development

- Node.js 22 or later
- Windows x64

```powershell
npm ci
npm start
```

Run tests and build Windows `.exe` packages:

```powershell
npm test
npm run package:win
```

Build artifacts are written to the `release` directory. GitHub Actions automatically builds and attaches the Setup and Portable `.exe` files to a GitHub Release when a `v*` tag is pushed.

## License

MIT
