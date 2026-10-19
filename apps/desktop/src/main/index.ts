import { app, BrowserWindow, ipcMain, shell } from "electron";
import { exportDocumentPdf } from "./document-exporter";
import { join } from "node:path";

app.enableSandbox();

const createWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== window.webContents.getURL()) {
      event.preventDefault();
    }
  });

  const developmentUrl = process.env["ELECTRON_RENDERER_URL"];
  if (developmentUrl) {
    void window.loadURL(developmentUrl);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return window;
};

app.whenReady().then(() => {
  ipcMain.handle("app:get-info", () => ({
    name: "Office Agent",
    version: app.getVersion(),
    platform: process.platform,
    stage: "foundation",
  }));
  ipcMain.handle("document:export-pdf", (_event, input: unknown) => exportDocumentPdf(input));

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
