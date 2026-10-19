# Contributing

## Development workflow

1. Read `AGENTS.md` and the relevant documents linked from `docs/README.md`.
2. Create a focused task describing the user outcome, acceptance checks, security impact, and documentation impact.
3. Make the smallest coherent change. Include tests and update documentation in the same change.
4. Run local verification with Node.js 24 and pnpm.
5. Submit a pull request with a Conventional Commit title, a behavior summary, test evidence, and any remaining limitations.

Agent-authored pull requests may merge automatically only when repository rules, required reviews if configured, and every required check pass. Release tags and publication remain manual approval steps.

## Commits and pull requests

Use the Conventional Commits format, for example `feat(library): import immutable source snapshots` or `fix(security): reject symlink workspace escapes`. Avoid mixing unrelated refactors with behavior changes.

Do not commit generated dependencies, credentials, local settings, build artifacts, or real user documents.

## Tests and documentation

Unit tests use deterministic providers. Integration tests may use LibreOffice or bubblewrap when available. Live model and search tests are optional and require local credentials; they must never be required for an unauthenticated CI run.

All documentation is English and limited to 5,000 English words per file. Add significant design decisions to `docs/adr/` and link new documents through the documentation indexes.

See [local verification](docs/how-to/local-verification.md) and the [Agent development workflow](docs/how-to/agent-development.md).
