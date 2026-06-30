# Tally Time Tracker v1.2.8

*by Ian Read*

Automatic time tracking for Windows with Monday.com integration.

## What it does

- Tracks active windows and browser tabs automatically
- Links time entries to Monday.com tasks via a Chrome extension
- Posts a daily summary to a Monday board at a time you choose
- Live browser dashboard at `http://localhost:5610`
- Manual timer with project and category assignment

## Requirements

- Windows 10 / 11
- Python 3.10+ (or use the compiled installer)
- Chrome (for the browser extension)
- Monday.com account + API token (optional, for integration features)

## Run from source

```
python TallyTimeTracker.py
```

No third-party packages required — all dependencies are Python standard library.

## Build installer

1. Install [PyInstaller](https://pyinstaller.org) and [Inno Setup 6](https://jrsoftware.org/isdl.php)
2. Run `build.bat` — creates `dist\TallyTimeTracker\`
3. Open `installer.iss` in Inno Setup Compiler and click **Build → Compile**
4. Installer output: `dist-installer\TallyTimeTracker_Setup_1.2.8.exe`

## Chrome extension

Load `browser_extension/` as an unpacked extension in Chrome (`chrome://extensions` → Developer mode → Load unpacked). Only activates on monday.com pages.

## Monday.com setup

Enter your API token in the **Associations** tab. The daily review board and columns are created automatically on first use.

## Toast notifications

Tally shows a small toast notification in the top-right corner of your screen whenever it automatically starts or switches tracking. Toasts appear for:

- **Auto-tracking started** — when a window or browser tab is matched to a known project
- **No Project tracking** — when an unrecognised app triggers tracking with no association yet
- **Minimise to tray** — a one-time hint when the window is closed to the system tray

Each toast plays a short audio ping when it appears (Windows only). Toasts dismiss automatically after 15 seconds, or you can click them to dismiss immediately.
