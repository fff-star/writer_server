# Architecture

## Process boundaries

The Electron renderer owns presentation only. It has no Node integration and receives a minimal typed API from a sandboxed preload. The Electron main process owns application lifecycle, native integration, and protected secret storage.

A separate Agent host embeds the Pi TypeScript SDK. Its initial session uses in-memory settings, credentials, and history; disables project resources; and exposes no tools. Application capabilities will be registered explicitly after policy checks exist.

## Modules

Workspace packages separate contracts, security, immutable library storage, ingestion, retrieval, research, document handling, and Agent runtime. Shared contracts validate process and tool boundaries. Format parsers produce normalized blocks with source locators so generated claims can resolve to immutable evidence. Ingestion accepts pluggable OCR, visual, and PDF-rasterizer providers; without them, image-only imports keep explicit partial records.

The document editor, version store, DOCX exporter, and PDF renderer consume one canonical document model, which keeps exported content aligned with the edited content. Grounded drafting sits behind an injectable writer boundary: the pipeline assembles evidence with reference identifiers and drops citations that point at unknown sources, and it reports itself unavailable when no writer is configured.

## Trust boundaries

Renderer isolation does not sandbox Agent tools. Shell and script execution require an operating-system boundary, explicit workspace grants, stripped credentials, default-denied networking, audit events, and process-tree cleanup. If that boundary is absent, execution fails closed.

Cloud providers are separate trust boundaries. Only task-required excerpts may be sent after provider configuration, and egress must be recorded. Web and local source text is untrusted evidence rather than Agent instruction.

See [ADR 0001](../adr/0001-pi-integration.md) and [ADR 0003](../adr/0003-security-boundary.md).
