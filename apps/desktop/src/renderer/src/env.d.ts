export {};

declare global {
  interface Window {
    officeAgent: {
      getAppInfo: () => Promise<unknown>;
      exportDocumentPdf: (document: unknown) => Promise<string>;
    };
  }
}
