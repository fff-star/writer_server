# ADR 0003: Require an operating-system security boundary

- Status: Accepted
- Date: 2026-10-19

## Context

Generated commands and source text must be treated as untrusted. Tool allowlists, transcript review, and prompt instructions cannot prevent a child process from reading credentials, changing other paths, or using the network.

## Decision

Keep shell and script tools disabled until an operating-system adapter proves workspace-only writes, stripped credentials, default-denied networking, process-tree termination, and fail-closed behavior. Linux will evaluate bubblewrap. Windows requires a separately verified restricted-token/AppContainer and Job Object boundary.

Use real-copy workspace snapshots for tracked file rollback. Require explicit, narrowly scoped approval for elevation. Never claim that network or external application effects are reversible.

## Consequences

Some scripts will require additional approval, and an unavailable sandbox disables execution. Windows support is a feasibility gate rather than a promise based on command filtering. Snapshots add storage and latency and do not replace backups.

Return to the [ADR index](README.md).
