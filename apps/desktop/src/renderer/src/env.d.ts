export {};

declare global {
  interface Window {
    officeAgent: {
      getAppInfo: () => Promise<unknown>;
      exportDocumentPdf: (document: unknown) => Promise<string>;
      exportDocumentPdfFile: (payload: unknown) => Promise<unknown>;
      library: {
        importWithDialog: () => Promise<unknown>;
        list: () => Promise<unknown>;
        search: (query: string) => Promise<unknown>;
      };
      studio: {
        listDocuments: () => Promise<unknown>;
        createDocument: (document: unknown) => Promise<unknown>;
        getVersion: (versionId: string) => Promise<unknown>;
        latestVersion: (documentId: string) => Promise<unknown>;
        listVersions: (documentId: string) => Promise<unknown>;
        appendVersion: (documentId: string, document: unknown) => Promise<unknown>;
        appendAgentRevision: (
          documentId: string,
          document: unknown,
          baseVersionId?: string,
        ) => Promise<unknown>;
        listConflicts: (versionId: string) => Promise<string[]>;
        exportDocx: (payload: unknown) => Promise<unknown>;
        draft: (request: unknown) => Promise<unknown>;
      };
      analysis: {
        analyzeBudget: (query: string) => Promise<unknown>;
      };
      settings: {
        list: () => Promise<unknown>;
        hasSecret: (name: string) => Promise<boolean>;
        setSecret: (name: string, value: string) => Promise<void>;
        deleteSecret: (name: string) => Promise<boolean>;
      };
    };
  }
}
