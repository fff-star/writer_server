# Capability boundaries

## Foundation state

The current application demonstrates startup, renderer isolation, an isolated Pi session that exposes tools only when a policy broker is explicitly supplied, immutable managed-library imports, extraction, Chinese search, source locators, deterministic budget analysis, optional public-web collection, and Subagent orchestration where write-capable tasks run only under a policy broker. Foundation spikes also exercise Linux process isolation, workspace rollback, real DOC conversion, DOCX/PDF generation, and paginated editing.

The document studio is present: structured block editing of the canonical document model, editable citations with a library-search locator picker, versioned manual edits stored in a local SQLite version store, agent-revision merges that surface per-block conflicts, and DOCX/PDF export through native save dialogs. The editor tab binds the paginated canvas editor to the same model: headings, paragraphs, lists, tables, and citations round-trip through the canvas element stream, citation locators are restored from the loaded version on save, and blocks the canvas cannot represent are preserved rather than dropped. Grounded Chinese drafting is wired end-to-end from evidence assembly to validated document output, but it reports an explicit unavailable reason in this build because no draft writer (LLM credentials) is configured; see [ADR 0009](../adr/0009-grounded-drafting-boundary.md).

OCR and visual indexing work when providers are configured: API keys live in the protected settings store and endpoints come from main-process environment variables. Without providers, images and scanned PDFs keep explicit `partial` stub records rather than silent gaps. Scanned-PDF OCR additionally needs a page rasterizer, and none is shipped yet. Agent shell execution, file organization, and production semantic retrieval remain disabled.

## Intended first usable scope

The product will use immutable imports for DOC, DOCX, PDF, XLSX, CSV, TXT, Markdown, and agreed image formats. Scanned pages and images require OCR and visual understanding. Retrieval and reports must retain source locators. Budget calculations must be deterministic and reproducible.

The writing workflow will generate Chinese material from local and public-web evidence, provide an editable paginated surface, preserve manual edits across Agent revisions, and export built-in styles to DOCX and PDF.

Workspace automation will be limited to authorized directories and verified sandboxes. Controlled file changes will be auditable and reversible; outside effects will not be included in that guarantee.

## Explicit non-goals and limits

The current scope excludes macOS, mobile, multiple users, cloud synchronization, collaborative editing, user DOCX template import or filling, office GUI automation, production signing, and built-in automatic upgrades. PPTX, legacy XLS, GIF, and HEIC are not content-indexing formats.

Synthetic and public fixtures cannot establish accuracy on unknown real office files. Domestic Linux and ARM64 compatibility is deferred. DOCX pagination may differ between Word, WPS, and LibreOffice, so cross-application pixel identity is not promised.

Return to the [explanation index](README.md).
