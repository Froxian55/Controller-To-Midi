# Controller To MIDI

A utility that transforms any standard game controller, joystick, wheel, or pedal into a functional MIDI expression pedal or switch.

## Features

- Universal controller support via SDL2 (XInput, DirectInput, wheels, pedals, HOTAS)
- Learn mode: press a button or move an axis to bind it
- 3 fixed piano-style pedals with MIDI CC numbers:
  - Sustain (CC 64)
  - Sostenuto (CC 66)
  - Soft (CC 67)
- Per-pedal settings:
  - Analog / Threshold mode
  - Invert axis
  - Deadzone
  - Threshold
- Save/load mappings to JSON
- Dark modern UI

## Requirements

- .NET 6.0 SDK
- Windows

## Build & Run

```powershell
cd ControllerToMidi3
dotnet run
```

## Build

```powershell
dotnet build
```

## Usage

1. Select your controller from the dropdown
2. Select your MIDI output device
3. Set the MIDI channel (1-16)
4. Click **Start**
5. For each pedal, click **Bind** and press the corresponding button or move the axis on your controller
6. Adjust deadzone, threshold, and invert as needed
7. Click **Save** to store your mappings

## License

MIT
