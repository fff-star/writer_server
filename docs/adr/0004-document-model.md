# ADR 0004: Use one canonical document model for editing and export

- Status: Proposed
- Date: 2026-10-19

## Context

The product needs Chinese drafting, citations, editable pagination, manual-edit protection, and DOCX/PDF export. Independent editor and exporter representations would make content and citations drift.

## Decision

Define one canonical document schema for headings, paragraphs, lists, tables, images, citations, and page settings. The editor, versions, diffs, DOCX exporter, and PDF renderer must consume this schema. Provide built-in styles only.

The first rendering spike must prove editable pagination and Chinese content before the full document studio is built. PDF should match the application rendering path; DOCX guarantees structure and styles rather than pixel identity across office suites.

## Consequences

The schema limits editor features to explicit, testable structures and requires migration tests as it evolves. Complex Office layouts and user templates are excluded. Pagination remains a high-risk implementation area until the spike passes.

Return to the [ADR index](README.md).
