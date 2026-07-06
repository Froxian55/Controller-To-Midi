Controller → MIDI Pedal
A lightweight and efficient open-source utility that transforms any standard game controller or joystick into a functional MIDI expression pedal or switch. Perfect for musicians, pianists, and producers who want to repurpose their spare gaming hardware for music production or live performances.

✨ Features
Universal Compatibility: Works with any controller or joystick recognized by Windows (Xbox, PlayStation, generic controllers, etc.).

Multiple Mapping Profiles: Map controller buttons or analog axes to standard MIDI Control Change (CC) messages (e.g., CC64 for Sustain, CC66 for Sostenuto, CC67 for Soft Pedal).

Dual Axis Modes:

Analog Mode: Smooth, continuous values (0-127) perfect for expression or volume control.

Threshold Mode: Triggers a fixed binary switch (on/off) once the axis passes a customizable limit.

Dead Zone & Invert Adjustments: Fine-tune your hardware triggers, eliminate jitter with dead zone configurations, or invert the axis direction dynamically.

Multilingual Interface: Native support for both English and Turkish languages.

Auto-Save: Automatically saves and restores your last used controller, MIDI port, channel, and custom button layouts.

🚀 Getting Started / Installation
Option 1: Quick Installer (Recommended for standard users)
Go to the Releases section on the right side of this GitHub page.

Download the latest Controller_To_Midi_Setup.exe.

Run the installer and follow the wizard instructions.

Launch the application from your desktop shortcut!

Option 2: Running from Source (For developers)
If you prefer to run the script manually, make sure you have Python 3.11+ installed, then follow these steps:

Clone this repository:

Bash
git clone https://github.com/your-username/Controller-To-Midi-2.git
cd Controller-To-Midi-2
Install the required dependencies:

Bash
pip install -r requirements.txt
Run the main script:

Bash
python main.py
🛠️ How to Use
Configure Devices: Open the Settings (⚙) panel, choose your game controller, select your active MIDI Output port, and set your preferred MIDI Channel.

Assign Controls: Click the Click & Press button on any pedal card (Sustain, Sostenuto, or Soft), then press a button or move an axis on your controller to bind it.

Fine-tune: Click the gear icon on the card to open the advanced settings for Dead Zone, Invert, or Threshold values.

Start: Click the START button in the footer to begin routing your controller inputs to your DAW or MIDI software.

Save: Don't forget to click Save to keep your layout configuration for your next session!

📝 License
This project is open-source and available under the MIT License. Feel free to fork, modify, and improve it!
