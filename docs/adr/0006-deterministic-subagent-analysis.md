# ADR 0006: Use deterministic analysis inside read-only Subagent tasks

- Status: Accepted
- Date: 2026-10-19

## Context

Budget totals and anomalies must be reproducible and auditable. The application also needs parallel local and web evidence collection without giving Subagents independent credentials or mutation permissions.

## Decision

Implement a dedicated Subagent orchestrator with read-only tasks, isolated contexts, bounded concurrency, step limits, timeouts, and progress events. Run deterministic budget aggregation as one task and public web collection as another. LLMs may later summarize evidence, but they do not compute totals or approve elevated actions.

## Consequences

Every report includes machine-computed calculations and task events. Unsupported providers degrade to an explicit unavailable state. Pi model sessions still need to be connected to this orchestrator in a later Agent-writing milestone.

Return to the [ADR index](README.md).
