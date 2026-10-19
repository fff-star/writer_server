# Capability boundaries

## Foundation state

The current application demonstrates startup, renderer isolation, an isolated Pi session without tools, immutable managed-library imports, extraction, Chinese search, source locators, deterministic budget analysis, optional public-web collection, and read-only Subagent orchestration. Foundation spikes also exercise Linux process isolation, workspace rollback, real DOC conversion, DOCX/PDF generation, and paginated editing. These checks do not enable production semantic retrieval, OCR/visual indexing, Agent writing, file organization, or Agent shell execution.

## Intended first usable scope

The product will use immutable imports for DOC, DOCX, PDF, XLSX, CSV, TXT, Markdown, and agreed image formats. Scanned pages and images require OCR and visual understanding. Retrieval and reports must retain source locators. Budget calculations must be deterministic and reproducible.

The writing workflow will generate Chinese material from local and public-web evidence, provide an editable paginated surface, preserve manual edits across Agent revisions, and export built-in styles to DOCX and PDF.

Workspace automation will be limited to authorized directories and verified sandboxes. Controlled file changes will be auditable and reversible; outside effects will not be included in that guarantee.

## Explicit non-goals and limits

The current scope excludes macOS, mobile, multiple users, cloud synchronization, collaborative editing, user DOCX template import or filling, office GUI automation, production signing, and built-in automatic upgrades. PPTX, legacy XLS, GIF, and HEIC are not content-indexing formats.

Synthetic and public fixtures cannot establish accuracy on unknown real office files. Domestic Linux and ARM64 compatibility is deferred. DOCX pagination may differ between Word, WPS, and LibreOffice, so cross-application pixel identity is not promised.

Return to the [explanation index](README.md).
