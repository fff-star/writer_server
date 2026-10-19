export {};

declare global {
  interface Window {
    officeAgent: {
      getAppInfo: () => Promise<unknown>;
      exportDocumentPdf: (document: unknown) => Promise<string>;
      library: {
        importWithDialog: () => Promise<unknown>;
        list: () => Promise<unknown>;
        search: (query: string) => Promise<unknown>;
      };
    };
  }
}
