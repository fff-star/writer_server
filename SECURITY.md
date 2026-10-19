# Security policy

## Reporting

Do not disclose exploitable vulnerabilities in a public issue. Prepare a private report with affected versions, reproduction steps, impact, and a minimal synthetic fixture. Remove credentials and confidential documents before sharing logs.

## Current boundary

The foundation renderer runs with context isolation, Chromium sandboxing, and no Node integration. Pi sessions use in-memory credentials and settings, in-memory sessions, no project resources, and no tools.

These controls do not make a future shell command safe. Workspace execution requires a separate operating-system sandbox, a policy broker, explicit approvals, and adversarial tests. If no working sandbox is available, the execution feature must fail closed.

## Data handling

Local source snapshots are intended to remain on the device. Configured cloud providers may later receive task-required excerpts, and those events must be auditable. Credentials must never enter generated documents, source indexes, logs, test fixtures, or sandbox environments.

Tracked workspace file changes may be reversible. Network requests, external application actions, and other outside effects are not generally reversible and must not be described as covered by rollback.

## Sandbox adapter notes

The Linux adapter treats every stderr line prefixed with `bwrap:` as a launcher diagnostic recorded as a warning, never as sandboxed-command output; the exit code remains authoritative, so a launcher failure still fails closed. CI runners load an AppArmor profile that grants bubblewrap user namespaces, because Ubuntu 24.04 mediation otherwise kills bwrap during loopback setup.

The experimental Windows helper grants the workspace a DACL entry for the per-run AppContainer SID and a Low mandatory-integrity label (`S:(ML;OICI;NW;;;LW)`), because mandatory no-write-up otherwise denies the Low-integrity sandboxed process writes to an unlabeled directory despite the DACL grant. Both the label and the DACL are restored on teardown. This widens write access only inside the nominated workspace directory; the AppContainer still has no declared network capabilities and the Job Object still owns process-tree cleanup. The helper's adversarial CI job passes, but it remains an experimental spike: it is not wired into any application feature, and shell execution stays disabled until the M4 policy broker lands.

See the [security architecture decision](docs/adr/0003-security-boundary.md).
