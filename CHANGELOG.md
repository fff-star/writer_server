# Changelog

This project keeps a human-curated changelog inspired by Keep a Changelog. Versions and release dates are added only for approved releases.

## Unreleased

### Added

- Initial pnpm and TypeScript workspace.
- Sandboxed Electron application shell and renderer isolation smoke test.
- Isolated Pi SDK session without tools or user credentials.
- Documentation governance and automated word-count and link checks.
- Linux bubblewrap sandbox, workspace snapshot, rollback, and audit-log spikes.
- Real LibreOffice legacy DOC conversion and DOCX/PDF extraction spike.
- Canonical document model, DOCX export, Electron PDF export, and paginated editing spikes.
- CI, unsigned preview packaging, artifact checksums, and manual release workflows.
- Self-extracting Linux executable for machines without FUSE, with packaged end-to-end verification.
- Immutable managed-library snapshots, deduplication, source versions, and SQLite metadata.
- TXT, Markdown, CSV, XLSX, DOC, DOCX, and text-PDF extraction with staged locators.
- Chinese search, Electron import/list/search IPC, and a managed-library interface.
- A 500-file synthetic ingestion and indexing acceptance test.
- Hybrid lexical/vector retrieval with provider-backed embedding storage.
- Deterministic quarterly budget aggregation, calculations, anomalies, and citations.
- Replaceable public-web search/fetch providers with private-network protection and local cache.
- Read-only Subagent orchestration with concurrency, step, timeout, and progress limits.
- Electron budget evidence analysis with explicit web-provider degradation.
- Documentation-impact CI gate mapping code areas to required documentation updates, with a `docs-impact: none` bypass marker.
- Command freshness checks matching package.json scripts, command documentation, and CI usage.
- ADR structure validation and immutability protection for Accepted decision records.
- Document studio with structured block editing, editable citations, versioned manual edits, agent-revision conflict surfacing, and DOCX/PDF export with save dialogs.
- Canvas editor bound to the canonical document model with round-tripping headings, paragraphs, lists, tables, and preserved citations.
- Grounded Chinese drafting pipeline behind an injectable writer boundary, unavailable until a draft writer is configured.
- Protected local settings store for provider secrets with OCR and visual HTTP provider adapters.
- Policy broker as the only gateway for workspace tool calls, with path confinement, credential-target denial, no-overwrite creation, per-file edit backups with byte-exact rollback, and hash-chained audit.
- Linux sandbox startup self-check gating the shell tool; broker-gated workspace tools registered with the isolated Pi session only when a broker is supplied.
- Broker-required gate for write-capable Subagent tasks such as the `workspace-edit` role.
- Unit tests for conversation intent dispatch, evidence-service key resolution order, and library-service provider threading.

### Security

- Workspace tool calls pass only through the policy broker; shell execution requires a passing Linux sandbox self-check and fails closed elsewhere.
- The isolated Pi session exposes no tools unless a policy broker is explicitly supplied.
- Windows native sandbox code remains experimental until its Windows CI checks pass.
