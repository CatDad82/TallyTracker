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

  const req = http.get("http://localhost:5610/api/active", (res) => {
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
  process.env.NODE_ENV = "production";
  process.env.PORT = "5610";

  const serverPath = path.join(__dirname, "dist", "server.cjs");
  console.log("Starting backend server from:", serverPath);
  
  try {
    require(serverPath);
    console.log("Express server loaded successfully in-process.");
  } catch (err) {
    console.error("Failed to require Express server in main process. Falling back to fork...", err);
    try {
      serverProcess = fork(serverPath, [], {
        env: { ...process.env, NODE_ENV: "production", PORT: "5610" },
        stdio: "inherit"
      });

      serverProcess.on("error", (forkErr) => {
        console.error("Forked Express server failed to start:", forkErr);
      });
    } catch (forkErr) {
      console.error("Failed to fork Express server:", forkErr);
    }
  }
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

  // Load the web app running on port 5610
  mainWindow.loadURL("http://localhost:5610");

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
    createWindow();
    try {
      createTray();
    } catch (e) {
      console.warn("Could not create system tray icon (might be missing icon.png), proceeding anyway:", e.message);
    }
    if (!success) {
      console.error("Express server failed to respond within timeout, window opened anyway as fallback.");
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
