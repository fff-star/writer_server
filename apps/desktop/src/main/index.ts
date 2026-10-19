import { app, BrowserWindow, ipcMain, shell } from "electron";
import { exportDocumentPdf } from "./document-exporter";
import { LibraryService } from "./library-service";
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

let libraryServicePromise: Promise<LibraryService> | undefined;

function getLibraryService(): Promise<LibraryService> {
  libraryServicePromise ??= LibraryService.create(
    join(app.getPath("userData"), "library"),
    join(app.getPath("temp"), "office-agent-ingestion"),
  );
  return libraryServicePromise;
}

app.whenReady().then(() => {
  ipcMain.handle("app:get-info", () => ({
    name: "Office Agent",
    version: app.getVersion(),
    platform: process.platform,
    stage: "foundation",
  }));
  ipcMain.handle("document:export-pdf", (_event, input: unknown) => exportDocumentPdf(input));
  ipcMain.handle("library:import-dialog", async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      throw new Error("Library import requires an application window");
    }
    return (await getLibraryService()).importWithDialog(window);
  });
  ipcMain.handle("library:list", async () => (await getLibraryService()).listSnapshots());
  ipcMain.handle("library:search", async (_event, query: unknown) => {
    if (typeof query !== "string" || query.length === 0 || query.length > 500) {
      throw new Error("Library search requires a query between 1 and 500 characters");
    }
    return (await getLibraryService()).search(query);
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  if (libraryServicePromise) {
    void libraryServicePromise.then((service) => service.close());
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
