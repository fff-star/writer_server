import { contextBridge, ipcRenderer } from "electron";

const api = {
  getAppInfo: () => ipcRenderer.invoke("app:get-info") as Promise<unknown>,
  exportDocumentPdf: (document: unknown) =>
    ipcRenderer.invoke("document:export-pdf", document) as Promise<string>,
  library: {
    importWithDialog: () => ipcRenderer.invoke("library:import-dialog") as Promise<unknown>,
    list: () => ipcRenderer.invoke("library:list") as Promise<unknown>,
    search: (query: string) => ipcRenderer.invoke("library:search", query) as Promise<unknown>,
  },
  analysis: {
    analyzeBudget: (query: string) =>
      ipcRenderer.invoke("analysis:budget", query) as Promise<unknown>,
  },
};

contextBridge.exposeInMainWorld("officeAgent", Object.freeze(api));
