import { contextBridge, ipcRenderer } from "electron";

const api = {
  getAppInfo: () => ipcRenderer.invoke("app:get-info") as Promise<unknown>,
  exportDocumentPdf: (document: unknown) =>
    ipcRenderer.invoke("document:export-pdf", document) as Promise<string>,
};

contextBridge.exposeInMainWorld("officeAgent", Object.freeze(api));
