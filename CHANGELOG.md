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

### Security

- No workspace shell or file mutation tool is enabled in the foundation shell.
- Windows native sandbox code remains experimental until its Windows CI checks pass.
