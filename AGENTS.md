# Agent development rules

## Scope and traceability

- Keep all project documentation in English. Each Markdown file must contain at most 5,000 English words.
- Use Conventional Commits. Each change needs a focused scope, tests, and documentation updates when behavior changes.
- Record significant architecture choices in a new ADR. Do not rewrite an accepted ADR to hide a superseded decision.
- Do not commit, push, merge, tag, or release unless the user has authorized that action.
- Do not claim a feature works until its user-facing path and automated tests pass.

## Engineering rules

- Run the root verification commands documented in `docs/reference/commands.md` for every affected change.
- Keep dependencies exact and review new native dependencies, lifecycle scripts, and network access.
- Keep Electron renderer Node integration disabled. Privileged operations must use validated IPC.
- Keep API keys out of the renderer, logs, fixtures, Subagents, and sandboxed jobs.
- Pi sessions must not load user credentials, project extensions, or built-in tools implicitly.
- Shell execution remains disabled unless the relevant operating-system sandbox fails closed and passes adversarial tests.
- Original library snapshots are immutable. Controlled file creation must not overwrite existing files.
- Rollback claims apply only to tracked workspace file changes, never to network or external application side effects.

## Documentation rules

- Start at `docs/README.md` and read only the documents relevant to the task.
- Update the documentation map when adding a document so the file remains reachable.
- Follow the existing Diátaxis section: tutorial, how-to, reference, or explanation.
- Tests and fixtures must use synthetic or public data. Do not add confidential office documents.
