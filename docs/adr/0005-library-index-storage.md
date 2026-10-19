# ADR 0005: Use node:sqlite and staged locators for managed library metadata

- Status: Accepted
- Date: 2026-10-19

## Context

The first managed library must run inside Electron without a separate database service or another native dependency. It also needs stable metadata, searchable blocks, and citations for Chinese office content.

## Decision

Use Node.js 24 `node:sqlite` for metadata and SQLite FTS5 for searchable text. Keep immutable file bytes in content-addressed object storage rather than in the database. Record source locators at the stage each parser can prove: lines, cells, pages, or stable document blocks. Use substring matching for non-ASCII queries because the default FTS tokenizer does not segment Chinese.

Images and scanned pages remain `partial` until OCR and visual providers are available.

## Consequences

The database is embedded and testable with the runtime used by the application. FTS5 ranking does not currently provide ideal Chinese tokenization, so the first implementation combines exact substring behavior for non-ASCII queries with FTS for ASCII text. A later retrieval milestone can replace ranking without changing immutable snapshots or proven locators.

Return to the [ADR index](README.md).
