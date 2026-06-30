# 💻 Smart Time Tracker Desktop (.exe) Packaging Guide

This guide describes how to bundle this high-performance auto-tracker client with Monday.com linkages into a secure, single standalone Windows Executable file (`.exe`) installer.

---

## 🛠 Prerequisites

1. **Node.js Environment**: Install Node.js v18 or later on your machine ([Download Page](https://nodejs.org/)).
2. **Download Project Files**: Ensure you download the project code directory (as a `.zip` file from the settings bar) or push the repository to GitHub.

---

## 🚀 Easy Packaging Instructions (Step-by-Step)

### Step 1: Run your Terminal as Administrator
To bypass Windows privilege errors (`Cannot create symbolic link`), you must run your terminal with admin rights:
- Search **"PowerShell"** or **"Command Prompt"** in the Windows Start Menu.
- Right-click and choose **"Run as Administrator"**.
- Navigate to your extracted project folder (`cd C:\path\to\your-project-folder`).

### Step 2: Install and Compile the Static Web Application
Install the main dependencies and compile the production client bundle using relative asset loading (which loads properly in Electron):

```bash
# 1. Install all dependencies (Web + Electron compiler tooling in one go!)
npm install

# 2. Build production assets into /dist
npm run build
```

### Step 3: Bundle and Package the standalone Windows Executable (.exe)
Trigger the active `electron-builder` compilation using our unified manifest script:

```bash
# Trigger the automated EXE package builder
npm run electron:dist
```

---

## 🛠 Troubleshooting Common Issues

### 1. I get a completely blank/black window when opening the installed app
- **Root Cause**: Earlier versions had absolute paths like `/assets/...` which fail in desktop applications running under the `file://` protocol.
- **Solution**: We have successfully updated `vite.config.ts` to use relative asset loading base paths (`base: './'`). Rebuild (`npm run build`) and compile again to use relative paths.

### 2. Error: "Cannot create symbolic link - A required privilege is not held by the client"
- **Root Cause**: `7-Zip` is trying to extract system symlinks under the `winCodeSign` cache folder, which standard Windows accounts don't have permission to do.
- **Solution**: Open your terminal (CMD or PowerShell) as **Administrator** and run the packaging command setup there, or turn on **Developer Mode** in your Windows settings. This bypasses the security restriction immediately!

---

## 📂 Desktop Distribution Outputs

Upon completion, `electron-builder` will create a new `/dist-desktop` directory in your workspace:

*   **`SmartTimeTracker Setup 1.2.4.exe`**: Standard, double-clickable interactive app setup wizard that installs the tracking agent, creates desktop shortcuts, and registers starting listeners on your computer.
*   **`dist-desktop/win-unpacked`**: Lightweight, portable executable runtime that you can run instantly without running the setup wizard installer program.

---

## 🔑 Key Features of Desktop Container

*   **Minimized Active Window Polling**: Bypasses browser context limits to scan window descriptors!
*   **System Frame Integration**: Double click the Taskbar system tray to minimize active tracking without stopping timers.
*   **Startup Loader**: Option to auto-load key trackers on Windows boot sequences.
