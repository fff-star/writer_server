import { app, BrowserWindow, ipcMain, shell } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import {
  exportDocumentDocx,
  exportDocumentPdf,
  exportDocumentPdfToFile,
} from "./document-exporter";
import { EvidenceService } from "./evidence-service";
import { resolveExtractionProviders } from "./extraction-providers";
import { LibraryService } from "./library-service";
import { KNOWN_SECRET_NAMES, SettingsService } from "./settings-service";
import { StudioService } from "./studio-service";
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
let evidenceServicePromise: Promise<EvidenceService> | undefined;
let studioServicePromise: Promise<StudioService> | undefined;
let settingsService: SettingsService | undefined;

function getSettingsService(): SettingsService {
  settingsService ??= SettingsService.create(app.getPath("userData"));
  return settingsService;
}

function getLibraryService(): Promise<LibraryService> {
  libraryServicePromise ??= LibraryService.create(
    join(app.getPath("userData"), "library"),
    join(app.getPath("temp"), "office-agent-ingestion"),
    () => resolveExtractionProviders(getSettingsService()),
  );
  return libraryServicePromise;
}

function getEvidenceService(): Promise<EvidenceService> {
  evidenceServicePromise ??= getLibraryService().then((library) =>
    EvidenceService.create(library, app.getPath("userData"), getSettingsService()),
  );
  return evidenceServicePromise;
}

function getStudioService(): Promise<StudioService> {
  studioServicePromise ??= getLibraryService().then((library) =>
    StudioService.open(join(app.getPath("userData"), "studio"), {
      local: {
        search: (query, limit) => Promise.resolve(library.search(query).slice(0, limit ?? 8)),
      },
      web: async () => {
        const evidence = await getEvidenceService();
        if (!evidence.hasResearch()) {
          return null;
        }
        return { collect: (query) => evidence.collectResearch(query) };
      },
      writer: null,
    }),
  );
  return studioServicePromise;
}

async function resetEvidenceService(): Promise<void> {
  const existing = evidenceServicePromise;
  evidenceServicePromise = undefined;
  if (existing) {
    (await existing).close();
  }
}

const secretNamePattern = /^[a-z][a-z0-9-]{1,63}$/;

function validateSecretName(name: unknown): string {
  if (typeof name !== "string" || !secretNamePattern.test(name)) {
    throw new Error("Secret names must be 2-64 lowercase letters, digits, or hyphens");
  }
  return name;
}

function requireWindow(event: IpcMainInvokeEvent): BrowserWindow {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) {
    throw new Error("This operation requires an application window");
  }
  return window;
}

app.whenReady().then(() => {
  ipcMain.handle("app:get-info", () => ({
    name: "Office Agent",
    version: app.getVersion(),
    platform: process.platform,
    stage: "foundation",
  }));
  ipcMain.handle("document:export-pdf", (_event, input: unknown) => exportDocumentPdf(input));
  ipcMain.handle("document:export-pdf-file", async (event, payload: unknown) => {
    const studio = await getStudioService();
    return exportDocumentPdfToFile(requireWindow(event), studio.resolveDocument(payload));
  });
  ipcMain.handle("studio:list-documents", async (_event, projectId?: unknown) =>
    (await getStudioService()).listDocuments(projectId),
  );
  ipcMain.handle("studio:create-document", async (_event, input: unknown, projectId?: unknown) =>
    (await getStudioService()).createDocument(input, projectId),
  );
  ipcMain.handle("studio:get-version", async (_event, versionId: unknown) =>
    (await getStudioService()).getVersion(versionId),
  );
  ipcMain.handle("studio:latest-version", async (_event, documentId: unknown) =>
    (await getStudioService()).latestVersion(documentId),
  );
  ipcMain.handle("studio:list-versions", async (_event, documentId: unknown) =>
    (await getStudioService()).listVersions(documentId),
  );
  ipcMain.handle("studio:append-version", async (_event, documentId: unknown, document: unknown) =>
    (await getStudioService()).appendVersion(documentId, document),
  );
  ipcMain.handle(
    "studio:append-agent-revision",
    async (_event, documentId: unknown, document: unknown, baseVersionId?: unknown) =>
      (await getStudioService()).appendAgentRevision(documentId, document, baseVersionId),
  );
  ipcMain.handle("studio:list-conflicts", async (_event, versionId: unknown) =>
    (await getStudioService()).listConflicts(versionId),
  );
  ipcMain.handle("studio:export-docx", async (event, payload: unknown) => {
    const studio = await getStudioService();
    return exportDocumentDocx(requireWindow(event), studio.resolveDocument(payload));
  });
  ipcMain.handle("studio:draft", async (_event, request: unknown) =>
    (await getStudioService()).draft(request),
  );
  ipcMain.handle("projects:list", async () => (await getStudioService()).listProjects());
  ipcMain.handle("projects:create", async (_event, input: unknown) =>
    (await getStudioService()).createProject(input),
  );
  ipcMain.handle("projects:rename", async (_event, projectId: unknown, input: unknown) =>
    (await getStudioService()).renameProject(projectId, input),
  );
  ipcMain.handle("conversation:list", async (_event, projectId: unknown) =>
    (await getStudioService()).listMessages(projectId),
  );
  ipcMain.handle("conversation:append", async (_event, projectId: unknown, message: unknown) =>
    (await getStudioService()).appendMessage(projectId, message),
  );
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
  ipcMain.handle("analysis:budget", async (_event, query: unknown) => {
    if (typeof query !== "string" || query.length === 0 || query.length > 200) {
      throw new Error("Budget analysis requires a query between 1 and 200 characters");
    }
    return (await getEvidenceService()).analyzeBudget(query);
  });
  ipcMain.handle("settings:list", async () => {
    const stored = new Set(await getSettingsService().listSecretNames());
    const names = new Set<string>([...KNOWN_SECRET_NAMES, ...stored]);
    return [...names].sort().map((name) => ({ name, configured: stored.has(name) }));
  });
  ipcMain.handle("settings:has-secret", async (_event, name: unknown) =>
    getSettingsService().hasSecret(validateSecretName(name)),
  );
  ipcMain.handle("settings:set-secret", async (_event, name: unknown, value: unknown) => {
    const secretName = validateSecretName(name);
    if (typeof value !== "string" || value.length === 0 || value.length > 4096) {
      throw new Error("Secret values must be between 1 and 4096 characters");
    }
    await getSettingsService().setSecret(secretName, value);
    if (secretName === "brave-search-api-key") {
      await resetEvidenceService();
    }
  });
  ipcMain.handle("settings:delete-secret", async (_event, name: unknown) => {
    const secretName = validateSecretName(name);
    const deleted = await getSettingsService().deleteSecret(secretName);
    if (deleted && secretName === "brave-search-api-key") {
      await resetEvidenceService();
    }
    return deleted;
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
  if (evidenceServicePromise) {
    void evidenceServicePromise.then((service) => service.close());
  }
  if (studioServicePromise) {
    void studioServicePromise.then((service) => service.close());
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
