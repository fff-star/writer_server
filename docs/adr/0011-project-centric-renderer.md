# ADR 0011: Organize the renderer around projects

- Status: Accepted
- Date: 2026-10-19

Supersedes [ADR 0010](0010-conversation-first-shell.md), which introduced the conversation-first shell with a flat module navigation.

## Context

The flat navigation treated documents and research as top-level destinations. In use that framing breaks down: generated documents belong to the task that produced them, and research is work the agent performs inside a task, not a surface a person operates. Agent workbenches such as Codex reflect this — the sidebar lists projects and their threads, and artifacts live inside the active task rather than in global sections.

## Decision

The project is the renderer's primary object. The sidebar lists projects (with creation as the primary action) plus the global managed library and settings. Selecting a project opens its workspace: a persisted conversation as the default tab, a documents tab listing only that project's generated documents, and the paged-editor surface. The standalone research view is removed; budget analysis and web research remain conversation intents executed by the agent on demand.

The studio store gains projects and persisted per-project conversation messages. Documents carry a project reference; on migration, pre-existing documents are reassigned to a default project so no stored work is orphaned.

## Consequences

Every artifact a user produces is traceable to the project that asked for it, which strengthens the audit story. The library deliberately stays global because source evidence is shared across projects; if per-project source scoping is ever needed, it must be modeled as an attachment rather than a copy, to keep snapshots immutable and deduplicated. Project deletion is not offered yet because the retention rule for its documents and messages is undecided.

Return to the [ADR index](README.md).
