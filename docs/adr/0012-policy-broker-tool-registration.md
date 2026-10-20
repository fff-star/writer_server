# ADR 0012: Gate all workspace tools through a policy broker

- Status: Accepted
- Date: 2026-10-20

## Context

ADR 0003 requires an operating-system security boundary before shell execution, but it does not say how agent-facing workspace tools (list, read, create, edit, shell) reach the filesystem. If each tool resolved paths or audited decisions on its own, confinement, credential-target denial, and audit chaining would drift apart and become untestable. The isolated Pi session starts with `noTools: "all"` (ADR 0001), so a registration boundary is also needed to decide when tools may appear at all.

## Decision

A single policy broker in `packages/security` is the only gateway for workspace tool calls. The broker composes the existing path policy, no-overwrite file creation, audit log, Linux sandbox, and snapshot facilities, and enforces:

- path confinement through `resolveWorkspacePath`, including symlink escapes;
- denial of credential-like targets (for example `.env`, private keys, `.ssh`, `.aws`) even inside the workspace;
- creation without overwrite, and no delete or elevation operations in this milestone;
- per-file backups behind every edit, with byte-exact rollback through an opaque change id;
- shell execution only on Linux, only when explicitly enabled, and always through the bubblewrap adapter; other platforms fail closed;
- a hash-chained audit entry for every allow, deny, failure, and completion, recording paths and outcomes but never file contents or secret values.

Shell availability is decided at startup by a self-check that probes the sandbox adapter with a trivial command; the shell tool exists only when the probe passes.

Tools are registered with the isolated Pi session only when a broker is explicitly supplied. The default session stays tool-free (`noTools: "all"`). When a broker is supplied, built-in tools remain disabled (`noTools: "builtin"`) and only the broker-gated workspace tools are exposed as custom tools. Broker denials are returned to the model as values, never thrown. Write-capable Subagent tasks (such as the `workspace-edit` role) run only when the orchestrator holds a broker; read-only tasks are unchanged.

## Consequences

Every new workspace capability must be added to the broker and its adversarial tests before any tool can expose it. The broker is a choke point, so its audit log captures all tool activity, but also all tool latency. Per-file edit backups cover single-file rollback only; multi-file atomicity is future work. Shell remains unavailable on Windows until the native helper ships in the app, and unavailable everywhere when the sandbox probe fails.

Return to the [ADR index](README.md).
