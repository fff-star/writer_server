# Managed library formats

The managed library stores every import as an immutable content-addressed snapshot. Re-importing changed content from the same path creates a new version while unchanged content is deduplicated.

## Indexed formats

- TXT and Markdown: one searchable block for each non-empty line, located by line number.
- CSV: one block for each non-empty cell, located by row and A1 cell reference.
- XLSX: one block for each non-empty cell, located by sheet and cell address.
- DOCX: paragraph blocks located by stable paragraph number.
- DOC: converted through LibreOffice without modifying the original, then indexed as DOCX paragraph blocks.
- PDF with extractable text: page blocks located by page number.

## Partial formats

Images and scanned PDFs are indexed by configured OCR and visual providers: OCR text becomes text blocks and visual captions become image blocks, both located by file. A provider failure downgrades that import to `partial` with the failing provider named. Scanned-PDF OCR requires a page rasterizer in addition to the OCR provider, and no rasterizer is shipped yet.

Without configured providers, images and scanned PDFs are marked `partial` with an explicit stub record explaining that OCR and visual analysis are required. Their records remain visible so the application cannot silently claim complete indexing. See [configuration](configuration.md) for how providers are enabled.

Unsupported extensions are stored only when imported through a supported managed-library path and are marked `failed` with an explicit reason. PPTX, legacy XLS, GIF, and HEIC are not content-indexing formats.

Return to the [reference index](README.md).
