import {
  DocumentVersionStore,
  DraftingService,
  officeDocumentSchema,
} from "@office-agent/document";
import type {
  DraftRequest,
  DraftResult,
  DraftWriter,
  LocalEvidenceProvider,
  OfficeDocument,
  WebEvidenceProvider,
} from "@office-agent/document";

export type StudioDraftOutcome =
  { available: true; result: DraftResult } | { available: false; reason: string };

export type StudioDependencies = {
  local: LocalEvidenceProvider;
  web?: () => Promise<WebEvidenceProvider | null>;
  writer?: DraftWriter | null;
};

function validateId(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) {
    throw new Error(`${label} ID must be a string between 1 and 128 characters`);
  }
  return value;
}

function validateDraftRequest(input: unknown): DraftRequest {
  if (typeof input !== "object" || input === null) {
    throw new Error("Draft request must be an object");
  }
  const { topic, brief, outline, localLimit, webLimit } = input as Record<string, unknown>;
  if (typeof topic !== "string" || topic.trim().length === 0 || topic.length > 500) {
    throw new Error("Draft topic must be a string between 1 and 500 characters");
  }
  if (brief !== undefined && (typeof brief !== "string" || brief.length > 2000)) {
    throw new Error("Draft brief must be a string of at most 2000 characters");
  }
  if (
    outline !== undefined &&
    (!Array.isArray(outline) ||
      outline.length > 50 ||
      outline.some((item) => typeof item !== "string" || item.length > 500))
  ) {
    throw new Error("Draft outline must be an array of at most 50 short strings");
  }
  for (const [name, value] of [
    ["localLimit", localLimit],
    ["webLimit", webLimit],
  ] as const) {
    if (value !== undefined && (!Number.isInteger(value) || (value as number) < 1)) {
      throw new Error(`Draft ${name} must be a positive integer`);
    }
  }
  return {
    topic,
    ...(brief !== undefined ? { brief } : {}),
    ...(outline !== undefined ? { outline: outline as string[] } : {}),
    ...(localLimit !== undefined ? { localLimit: localLimit as number } : {}),
    ...(webLimit !== undefined ? { webLimit: webLimit as number } : {}),
  };
}

export class StudioService {
  private constructor(
    private readonly store: DocumentVersionStore,
    private readonly dependencies: StudioDependencies,
  ) {}

  static async open(root: string, dependencies: StudioDependencies): Promise<StudioService> {
    return new StudioService(await DocumentVersionStore.open(root), dependencies);
  }

  listDocuments() {
    return this.store.listDocuments();
  }

  createDocument(input: unknown) {
    return this.store.createDocument(officeDocumentSchema.parse(input));
  }

  getVersion(versionId: unknown) {
    return this.store.getVersion(validateId(versionId, "Version")) ?? null;
  }

  latestVersion(documentId: unknown) {
    return this.store.latestVersion(validateId(documentId, "Document")) ?? null;
  }

  listVersions(documentId: unknown) {
    return this.store.listVersions(validateId(documentId, "Document"));
  }

  appendVersion(documentId: unknown, input: unknown) {
    return this.store.appendVersion(
      validateId(documentId, "Document"),
      officeDocumentSchema.parse(input),
    );
  }

  appendAgentRevision(documentId: unknown, input: unknown, baseVersionId?: unknown) {
    const base =
      baseVersionId === undefined || baseVersionId === null
        ? undefined
        : validateId(baseVersionId, "Base version");
    return this.store.appendAgentRevision(
      validateId(documentId, "Document"),
      officeDocumentSchema.parse(input),
      base,
    );
  }

  listConflicts(versionId: unknown) {
    return this.store.getConflicts(validateId(versionId, "Version"));
  }

  resolveDocument(payload: unknown): OfficeDocument {
    if (typeof payload !== "object" || payload === null) {
      throw new Error("Export requires { documentId } or { document }");
    }
    if ("documentId" in payload) {
      const latest = this.latestVersion((payload as { documentId: unknown }).documentId);
      if (!latest) {
        throw new Error("Document does not exist or has no versions");
      }
      return latest.document;
    }
    if ("document" in payload) {
      return officeDocumentSchema.parse((payload as { document: unknown }).document);
    }
    throw new Error("Export requires { documentId } or { document }");
  }

  async draft(input: unknown): Promise<StudioDraftOutcome> {
    const request = validateDraftRequest(input);
    const writer = this.dependencies.writer;
    if (!writer) {
      return {
        available: false,
        reason: "Draft writer is not configured (no LLM credentials are loaded in this build)",
      };
    }
    const web = this.dependencies.web ? await this.dependencies.web() : null;
    const service = new DraftingService(writer, this.dependencies.local, web ?? undefined);
    return { available: true, result: await service.draft(request) };
  }

  close(): void {
    this.store.close();
  }
}
