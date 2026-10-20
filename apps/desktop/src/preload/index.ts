import { contextBridge, ipcRenderer } from "electron";

const api = {
  getAppInfo: () => ipcRenderer.invoke("app:get-info") as Promise<unknown>,
  exportDocumentPdf: (document: unknown) =>
    ipcRenderer.invoke("document:export-pdf", document) as Promise<string>,
  exportDocumentPdfFile: (payload: unknown) =>
    ipcRenderer.invoke("document:export-pdf-file", payload) as Promise<unknown>,
  library: {
    importWithDialog: () => ipcRenderer.invoke("library:import-dialog") as Promise<unknown>,
    list: () => ipcRenderer.invoke("library:list") as Promise<unknown>,
    search: (query: string) => ipcRenderer.invoke("library:search", query) as Promise<unknown>,
  },
  studio: {
    listDocuments: (projectId?: string) =>
      ipcRenderer.invoke("studio:list-documents", projectId) as Promise<unknown>,
    createDocument: (document: unknown, projectId?: string) =>
      ipcRenderer.invoke("studio:create-document", document, projectId) as Promise<unknown>,
    getVersion: (versionId: string) =>
      ipcRenderer.invoke("studio:get-version", versionId) as Promise<unknown>,
    latestVersion: (documentId: string) =>
      ipcRenderer.invoke("studio:latest-version", documentId) as Promise<unknown>,
    listVersions: (documentId: string) =>
      ipcRenderer.invoke("studio:list-versions", documentId) as Promise<unknown>,
    appendVersion: (documentId: string, document: unknown) =>
      ipcRenderer.invoke("studio:append-version", documentId, document) as Promise<unknown>,
    appendAgentRevision: (documentId: string, document: unknown, baseVersionId?: string) =>
      ipcRenderer.invoke(
        "studio:append-agent-revision",
        documentId,
        document,
        baseVersionId,
      ) as Promise<unknown>,
    listConflicts: (versionId: string) =>
      ipcRenderer.invoke("studio:list-conflicts", versionId) as Promise<string[]>,
    exportDocx: (payload: unknown) =>
      ipcRenderer.invoke("studio:export-docx", payload) as Promise<unknown>,
    draft: (request: unknown) => ipcRenderer.invoke("studio:draft", request) as Promise<unknown>,
  },
  analysis: {
    analyzeBudget: (query: string) =>
      ipcRenderer.invoke("analysis:budget", query) as Promise<unknown>,
  },
  projects: {
    list: () => ipcRenderer.invoke("projects:list") as Promise<unknown>,
    create: (name: string) => ipcRenderer.invoke("projects:create", { name }) as Promise<unknown>,
    rename: (projectId: string, name: string) =>
      ipcRenderer.invoke("projects:rename", projectId, { name }) as Promise<unknown>,
  },
  conversation: {
    list: (projectId: string) =>
      ipcRenderer.invoke("conversation:list", projectId) as Promise<unknown>,
    append: (projectId: string, message: unknown) =>
      ipcRenderer.invoke("conversation:append", projectId, message) as Promise<unknown>,
  },
  settings: {
    list: () => ipcRenderer.invoke("settings:list") as Promise<unknown>,
    hasSecret: (name: string) =>
      ipcRenderer.invoke("settings:has-secret", name) as Promise<boolean>,
    setSecret: (name: string, value: string) =>
      ipcRenderer.invoke("settings:set-secret", name, value) as Promise<void>,
    deleteSecret: (name: string) =>
      ipcRenderer.invoke("settings:delete-secret", name) as Promise<boolean>,
  },
  windowControls: {
    minimize: () => ipcRenderer.send("window:minimize"),
    toggleMaximize: () => ipcRenderer.send("window:toggle-maximize"),
    close: () => ipcRenderer.send("window:close"),
    onMaximizedChange: (listener: (maximized: boolean) => void) => {
      const handler = (_event: unknown, maximized: boolean) => listener(maximized);
      ipcRenderer.on("window:maximized-changed", handler);
      return () => {
        ipcRenderer.removeListener("window:maximized-changed", handler);
      };
    },
  },
};

contextBridge.exposeInMainWorld("officeAgent", Object.freeze(api));
