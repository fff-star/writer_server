# Edit and export a studio document

This tutorial exercises the document studio with an empty document. It takes about ten minutes and needs only the development shell (`pnpm dev`).

## Create a document

1. Start the application with `pnpm dev` and open the studio panel.
2. Create a new document with a title. The studio stores it in the local version store as the first version.

## Edit blocks and citations

1. Add heading, paragraph, list, and table blocks, then edit their text in place.
2. Add a citation block. Use the library-search picker to attach a locator from an imported library source, or edit the citation text directly.
3. Save your edits. Each save appends a new version rather than overwriting history.

## Edit on the canvas

1. Open the Editor tab of the project workspace. It loads the document selected in the studio panel into the paginated canvas editor.
2. Edit the text on the canvas, then choose the save-version button. Saving appends a new version just like the studio panel; nothing is saved automatically. Citations keep their source locators even though the canvas only shows their text.

## Review history and conflicts

1. Open the version history to list every saved version with its author kind and timestamp.
2. Agent revisions merge into the current document instead of replacing it; any block the merge could not reconcile is listed as a conflict for the new version.

## Export

1. Export to DOCX or PDF. Both actions open a native save dialog and write only the file you choose.
2. Open the exported file in an office suite. DOCX guarantees structure and built-in styles, not pixel identity across Word, WPS, and LibreOffice.

## Drafting availability

The draft action assembles local and web evidence for a grounded Chinese draft, but this build ships no draft writer, so the action reports an explicit unavailable reason. That degradation is expected; see [ADR 0009](../adr/0009-grounded-drafting-boundary.md).

Return to the [tutorial index](README.md).
