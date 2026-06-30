const { app, BrowserWindow, Menu, Tray } = require("electron");
const path = require("path");
const { fork } = require("child_process");
const http = require("http");

let mainWindow = null;
let serverProcess = null;
let tray = null;
let isQuitting = false;

// Function to check if our Express port is ready
function checkServerReady(callback, attempts = 0) {
  if (attempts > 30) {
    console.error("Server took too long to start.");
    if (callback) callback(false);
    return;
  }

  const req = http.get("http://localhost:3000/api/active", (res) => {
    if (res.statusCode === 200) {
      if (callback) callback(true);
    } else {
      setTimeout(() => checkServerReady(callback, attempts + 1), 200);
    }
  });

  req.on("error", () => {
    setTimeout(() => checkServerReady(callback, attempts + 1), 200);
  });
}

function startServer() {
  const serverPath = path.join(__dirname, "dist", "server.cjs");
  console.log("Starting backend server from:", serverPath);
  
  serverProcess = fork(serverPath, [], {
    env: { ...process.env, NODE_ENV: "production" },
    stdio: "inherit"
  });

  serverProcess.on("error", (err) => {
    console.error("Express server failed to start:", err);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Tally Time Tracker",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Remove default menu bar
  mainWindow.setMenuBarVisibility(false);

  // Load the web app running on port 3000
  mainWindow.loadURL("http://localhost:3000");

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray() {
  // We try to locate a tray icon, using fallback if not found
  const iconPath = path.join(__dirname, "assets", "icon.png");
  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show Tally Tracker",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        } else {
          createWindow();
        }
      }
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip("Tally Time Tracker");
  tray.setContextMenu(contextMenu);

  tray.on("double-click", () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
      }
    }
  });
}

app.whenReady().then(() => {
  startServer();
  
  checkServerReady((success) => {
    if (success) {
      createWindow();
      try {
        createTray();
      } catch (e) {
        console.warn("Could not create system tray icon (might be missing icon.png), proceeding anyway:", e.message);
      }
    } else {
      console.error("Express server failed to load.");
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  isQuitting = true;
  if (serverProcess) {
    serverProcess.kill();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
