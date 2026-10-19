# ADR 0010: Conversation-first renderer shell

- Status: Superseded
- Superseded by ADR 0011
- Date: 2026-10-19

## Context

The renderer started as a scrolling overview page that presented each milestone as a module card with stacked panels. That shape describes the product instead of being the product: every capability required scrolling to its panel, and there was no single place where a writing task begins. The application needs a workbench layout — persistent navigation on the left, one focused working area on the right — with a conversation as the default surface, matching how operator-focused tools (for example Codex) structure agent work.

## Decision

The renderer is an application shell: a fixed sidebar with text navigation (Conversation, Documents, Library, Research, Editor, Settings — rendered in Chinese in the product) and a main area that renders exactly one active view. The default view is a conversation that maps user intents to existing, tested IPC capabilities only — library search, budget analysis, web research, and drafting — and answers with explicit unavailable reasons when a capability is not configured. No intent is answered by a fabricated response, and conversation state lives in component state only until a session backend exists.

The visual identity follows the writing subject: a paper-and-ink palette with hairline separators instead of card shadows, serif type reserved for content and headings, sans type for interface chrome, and a single cinnabar accent used like a seal stamp — active navigation, primary actions, and citation markers only.

## Consequences

New capabilities ship as sidebar views with one working area each, which keeps the shell stable as milestones land. The conversation can only expose what the preload already exposes, so research intents currently route through the budget-analysis channel; a dedicated research conversation surface needs its own IPC contract. The paged-editor spike remains reachable as the Editor view so end-to-end tests keep their typing surface.

Return to the [ADR index](README.md).
