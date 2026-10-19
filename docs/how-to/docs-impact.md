# Keep documentation in sync with code changes

The `docs:impact` check fails a pull request that changes behavior-bearing code without touching the matching documentation. It runs in the `quality` CI job before `docs:check` and is available locally:

```bash
pnpm docs:impact
```

## How the check works

The script `scripts/check-docs-impact.mjs` diffs `origin/main...HEAD` and applies these rules:

| Changed paths                                                                            | Required documentation                                                                  |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `apps/**`, `packages/**`, `native/**`, `scripts/**`                                      | Any `docs/**` change, `README.md`, `CHANGELOG.md`, `SECURITY.md`, or a new ADR          |
| `packages/security/**`, `native/windows-sandbox/**`                                      | `SECURITY.md` or a security ADR (`docs/adr/0003-*` or a new ADR)                        |
| `packages/library/**`, `packages/ingestion/**`, `library-service.ts`, `LibraryPanel.tsx` | `docs/reference/library-formats.md` or a related ADR                                    |
| `packages/research/**`, `evidence-service.ts`                                            | `docs/reference/research-providers.md` or a related ADR                                 |
| `.github/workflows/**`, `package.json`                                                   | `docs/how-to/repository-automation.md` or `docs/reference/commands.md` or a related ADR |

Documentation-only changes never require code. A missing merge base between the compared revisions is an error, not a pass.

## Configuration

- `DOCS_IMPACT_BASE` and `DOCS_IMPACT_HEAD` override the compared revisions (default `origin/main` and `HEAD`).
- `DOCS_IMPACT_NOTE` carries the explanation text. CI passes the pull-request body for `pull_request` events and the head commit message for `push` events. The check needs no secrets, so fork pull requests run identically.

## Bypassing for no-behavior changes

Refactors, comment fixes, and similar changes with no behavior impact may add a standalone line to the pull-request body or head commit message:

```text
docs-impact: none
```

The marker is case-insensitive but must appear alone on its own line; mentioning it inside a sentence does not bypass the check. Do not use the marker for changes that alter behavior, and never add it to repository documentation.

A path may also be exempted in the `explicitExemptions` table in `scripts/check-docs-impact.mjs`. Every table entry must include the path and a reviewable reason. The table is empty by default; do not use it to hide routine feature work.

## Related freshness checks

`pnpm docs:commands` verifies that every documented root command exists in `package.json`, every script is documented, and every CI `pnpm` command matches both. `pnpm docs:adr` validates ADR filenames, status, date, and required sections. An Accepted ADR cannot be edited quietly; supersede it with a new ADR that names the replacement. Both run as part of `pnpm docs:check`.

## Resolving a failure

1. Identify which rule failed from the error output; each message names the changed scope and the accepted documentation targets.
2. Update the listed reference document, `SECURITY.md`, or record the decision in a new ADR under `docs/adr/`.
3. If the change genuinely has no behavior impact, add the standalone `docs-impact: none` marker instead.
4. Re-run `pnpm docs:impact` locally before pushing.

Return to the [how-to guide index](README.md).
