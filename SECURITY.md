# Security policy

## Reporting

Do not disclose exploitable vulnerabilities in a public issue. Prepare a private report with affected versions, reproduction steps, impact, and a minimal synthetic fixture. Remove credentials and confidential documents before sharing logs.

## Current boundary

The foundation renderer runs with context isolation, Chromium sandboxing, and no Node integration. Pi sessions use in-memory credentials and settings, in-memory sessions, no project resources, and no tools.

These controls do not make a future shell command safe. Workspace execution requires a separate operating-system sandbox, a policy broker, explicit approvals, and adversarial tests. If no working sandbox is available, the execution feature must fail closed.

## Data handling

Local source snapshots are intended to remain on the device. Configured cloud providers may later receive task-required excerpts, and those events must be auditable. Credentials must never enter generated documents, source indexes, logs, test fixtures, or sandbox environments.

Tracked workspace file changes may be reversible. Network requests, external application actions, and other outside effects are not generally reversible and must not be described as covered by rollback.

See the [security architecture decision](docs/adr/0003-security-boundary.md).
