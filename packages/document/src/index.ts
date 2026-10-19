export { exportDocx } from "./docx-export.js";
export { renderDocumentHtml } from "./html.js";
export { mergeAgentRevision, officeDocumentSchema } from "./model.js";
export type { DocumentBlock, MergeResult, OfficeDocument } from "./model.js";
export {
  DraftingError,
  DraftingService,
  buildEvidence,
  buildPromptText,
  localLocator,
} from "./drafting.js";
export type {
  DraftPrompt,
  DraftRequest,
  DraftResult,
  DraftWriter,
  EvidenceItem,
  LocalEvidenceProvider,
  WebEvidenceProvider,
} from "./drafting.js";
export { DocumentVersionStore } from "./versions.js";
export type {
  AgentRevisionResult,
  DocumentSummary,
  DocumentVersion,
  MessageRole,
  Project,
  StoredMessage,
  VersionAuthorKind,
} from "./versions.js";
