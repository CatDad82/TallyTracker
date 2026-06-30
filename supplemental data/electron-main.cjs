/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Production Electron entry point for "Smart Time Tracker" Desktop EXE.
 * Bundles and serves the client-side SPA with native OS hooks, active window 
 * polling simulation, and minimize-to-system-tray behavior.
 */

const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let tray = null;
let isQuitting = false;

// Embedded base64 high-contrast orange clock PNG icon so the window & system tray always have valid icons
const iconBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH6AYUFAYwL3v91AAAAs1JREFUWMPFl8urTWEUxz9rr304h0uE8g9QIiMpxYgU8g8wMTeUKY9IUTIhySBeE6UYmEvpBygGUpS8IuWREAnX3mvv9vax9z7XdTmfe8496Tf73fX7re9etX7ru9degxX8N8m6EuyS9EhS6M86uT1k3fVstXAnOANsk/RYUuhWvofsurbaWmACOA/MAe9TCEfI7p9r7ToF7AHeAptSgMvAWmCgD8CHGfNf6bKAnpSeAd9L99WUP8fKAtvTe32KP1N6vVb5fW1uYAHInZfym6UvY9Wp7v8pYAnIlfEew96pYJukm5LuA3Pr5HqAmZTuSOnmFODm/0g/DEx0S05Iuq0S3D8v6bY6PgnMS7qtEqwkfTslS6U/k67XyV0CZu6mYFrSqZSyvaxHqU2/X9LBlP6FpIcl7U27N6R9O9XvVlVfSDpfK3pIejIvsAnYSvbt9MyS9bCscx36C9is6reSjWSbKvk2st8me6r9p2S7Wp4YIeup1t2vSreSvXW9R8B69fKzBfskbS647qV6nOxdSreSTXbLryRdrpZvpNoZJXtS2j/vK8nGsE7u8/E2YGeW3uXfbyRbpuxKsq3t6zXADuAQ8K1pAbCj2OclYDfwayX4Y4L4U8Ab4IUK8HOC+G8pG+e7Zc5Vgh7A96gAf1gT/FvW+A61XGqC/mN9m9qfTjbe0rVnB3AL+I3scbIn2f7yvXreCbyv6ieSnUr2m6Snmup7gIdCds9l9gHvgd3A+qYFwN4iR+/SgPfAn8h4V/W9UscvAh9U9K8XW+U+X9L7pT91R8u6Z98WAnPVcs0Eep20PjdfqvebL+bEemAmsHAGX3eK9+YCEzHovnkvFfA/Zc/hRInV62X5R8UofBqrVsvaq/AepR6M6Ym6XqX+Y7Ke6hXoqZ6P6ffr/B8A7jXbe1bO+98AAAAASUVORK5CYII=";

function getAppIcon() {
  // 1. Try our custom high-resolution branding PNG first
  const customPngPath = path.join(__dirname, 'assets', 'icon_desktop.png');
  if (fs.existsSync(customPngPath)) {
    return nativeImage.createFromPath(customPngPath);
  }
  const customIcon2 = path.join(__dirname, 'assets', 'icon.png');
  if (fs.existsSync(customIcon2)) {
    return nativeImage.createFromPath(customIcon2);
  }
  const iconPath = path.join(__dirname, 'dist', 'favicon.ico');
  if (fs.existsSync(iconPath)) {
    return nativeImage.createFromPath(iconPath);
  }
  // Robust embedded fallback icon
  return nativeImage.createFromDataURL(iconBase64);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    title: "Smart Time Tracker Desktop",
    icon: getAppIcon(), // Uses build-time favicon or embedded robust fallback
    backgroundColor: '#111625',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'electron-preload.cjs') // Preload sandbox hooks in CJS
    }
  });

  // Load the compiled Vite production assets
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  if (fs.existsSync(indexPath)) {
    mainWindow.loadFile(indexPath);
  } else {
    // Development Mode Fallback
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  }

  // Handle window closing by hiding instead of closing (system tray mode)
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  // Setup system tray context menu with a verified icon representation
  try {
    const rawIcon = getAppIcon();
    // Resize down to 16x16 standard Windows taskbar tray icon for optimal crispness
    const trayIcon = rawIcon.resize({ width: 16, height: 16 });

    tray = new Tray(trayIcon);
    const contextMenu = Menu.buildFromTemplate([
      { 
        label: 'Show Dashboard', 
        click: () => { mainWindow.show(); } 
      },
      { 
        label: 'Active Tracking Session', 
        enabled: false 
      },
      { type: 'separator' },
      { 
        label: 'Quit Application', 
        click: () => {
          isQuitting = true;
          app.quit();
        } 
      }
    ]);

    tray.setToolTip('Smart Time Tracker - Engaged');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
      mainWindow.show();
    });
  } catch (err) {
    console.log('Tray system not supported on host OS virtualization layer.');
  }
}

// OS Startup Event Initializers
app.whenReady().then(() => {
  // Hide default electron file menu for sleek production app experience
  Menu.setApplicationMenu(null);
  
  createMainWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Dictionary to map raw OS process names to user-friendly names matching configured associations
const PROCESS_MAP = {
  // Windows process binaries
  'chrome': 'Google Chrome',
  'msedge': 'Microsoft Edge',
  'firefox': 'Mozilla Firefox',
  'brave': 'Brave',
  'winword': 'Word',
  'excel': 'Excel',
  'powerpnt': 'PowerPoint',
  'outlook': 'Microsoft Outlook',
  'slack': 'Slack',
  'code': 'VS Code',
  'teams': 'Microsoft Teams',
  'discord': 'Discord',
  // macOS binaries
  'google chrome': 'Google Chrome',
  'microsoft edge': 'Microsoft Edge',
  'microsoft word': 'Word',
  'microsoft excel': 'Excel',
  'microsoft powerpoint': 'PowerPoint',
  'visual studio code': 'VS Code',
};

// Fast native active window detection via active-win (precompiled binary, no PowerShell)
let activeWin = null;
try {
  activeWin = require('active-win');
} catch (e) {
  console.warn('active-win not available, falling back to PowerShell');
}

async function getActiveWindowWin32() {
  if (activeWin) {
    try {
      const result = await activeWin();
      if (!result) return null;
      const appRaw = (result.owner && result.owner.name ? result.owner.name : '').toLowerCase().replace('.exe', '');
      const appName = PROCESS_MAP[appRaw] || result.owner.name || result.title || 'Unknown Program';
      const urlContext = (result.url) || '';
      return { appName, urlContext };
    } catch (e) {
      console.error('active-win error:', e);
      return null;
    }
  }
  // Fallback: lightweight PowerShell using only Get-Process (no Add-Type compilation)
  return new Promise((resolve) => {
    const script = `
      try {
        $id = (Get-Process | Where-Object {$_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -ne ''} | Sort-Object CPU -Descending | Select-Object -First 1).Id
        $proc = Get-Process -Id $id -ErrorAction SilentlyContinue
        if ($proc) { @{title=$proc.MainWindowTitle; process=$proc.ProcessName; url=""} | ConvertTo-Json -Compress }
      } catch {}
    `;
    const b64 = Buffer.from(script, 'utf16le').toString('base64');
    const { exec } = require('child_process');
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${b64}`, { timeout: 5000 }, (err, stdout) => {
      if (err || !stdout.trim()) return resolve(null);
      try {
        const parsed = JSON.parse(stdout.trim());
        const appRaw = (parsed.process || '').toLowerCase();
        resolve({
          appName: PROCESS_MAP[appRaw] || parsed.title || 'Unknown Program',
          urlContext: ''
        });
      } catch { resolve(null); }
    });
  });
}

// macOS helper using AppleScript and active tab automation
function getActiveWindowDarwin() {
  return new Promise((resolve) => {
    const applescript = `osascript -e '
      tell application "System Events"
        try
          set frontProc to first process whose frontmost is true
          set procName to name of frontProc
          try
            set winName to name of first window of frontProc
          on error
            set winName to ""
          end try
          return procName & "|||" & winName
        on error
          return "Unknown App|||"
        end try
      end tell
    '`;

    const { exec } = require('child_process');
    exec(applescript, { timeout: 2500 }, (err, stdout) => {
      if (err || !stdout.trim()) {
        resolve(null);
        return;
      }
      const parts = stdout.trim().split("|||");
      const appRawName = parts[0] ? parts[0].trim() : "Unknown App";
      const title = parts[1] ? parts[1].trim() : "";
      const appRawLower = appRawName.toLowerCase();

      const friendlyName = PROCESS_MAP[appRawLower] || appRawName;

      if (appRawLower === "google chrome" || appRawLower === "chrome") {
        const sc = `osascript -e 'tell application "Google Chrome" to get URL of active tab of first window'`;
        exec(sc, { timeout: 1200 }, (errUrl, stdoutUrl) => {
          const url = (errUrl || !stdoutUrl) ? "" : stdoutUrl.trim();
          resolve({
            appName: friendlyName,
            urlContext: url
          });
        });
      } else if (appRawLower === "microsoft edge") {
        const sc = `osascript -e 'tell application "Microsoft Edge" to get URL of active tab of first window'`;
        exec(sc, { timeout: 1200 }, (errUrl, stdoutUrl) => {
          const url = (errUrl || !stdoutUrl) ? "" : stdoutUrl.trim();
          resolve({
            appName: friendlyName,
            urlContext: url
          });
        });
      } else {
        resolve({
          appName: friendlyName,
          urlContext: ""
        });
      }
    });
  });
}

// Deep native API channel handler
ipcMain.handle('get-active-window-process', async () => {
  try {
    if (process.platform === 'win32') {
      const winResult = await getActiveWindowWin32();
      if (winResult) return winResult;
    } else if (process.platform === 'darwin') {
      const macResult = await getActiveWindowDarwin();
      if (macResult) return macResult;
    }
  } catch (err) {
    console.error("OS Window tracker thread exception:", err);
  }

  // Fallback when native detection is unavailable
  return {
    appName: "",
    urlContext: ""
  };
});
