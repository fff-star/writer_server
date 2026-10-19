# ADR 0002: Use immutable local source snapshots

- Status: Accepted
- Date: 2026-10-19

## Context

Reports need stable citations, and source files may later be moved or edited. Indexing only a live path would make historical evidence difficult to reproduce and could mix multiple versions of a document.

## Decision

Import source files into an application-managed, content-addressed local library. Preserve each original as an immutable snapshot, deduplicate by content hash, and attach extracted blocks and citations to a specific snapshot. Re-importing changed content creates a new version rather than mutating old evidence.

The managed library remains distinct from a user-authorized Agent workspace.

## Consequences

Imports consume additional storage and require explicit re-import to capture outside changes. In return, citations, reports, tests, and audits can identify exact evidence. Deleting a library item requires a separate retention policy and is not part of ordinary Agent file operations.

Return to the [ADR index](README.md).
