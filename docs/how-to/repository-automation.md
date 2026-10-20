# Configure repository automation

These settings require the actual GitHub repository and administrator access. Local files cannot prove that they are configured.

## Branch protection

Protect the default branch and require a successful `quality` check, `windows-sandbox` check, and dependency review for every pull request. Require branches to be current before merging and block force pushes.

Allow repository auto-merge, but do not bypass required checks. Release publication remains a separate manual action through the protected `preview-release` environment. The release workflow's `verify` job runs the unit tests, so it loads the same AppArmor profile for bubblewrap as the CI `quality` job; keep the two steps in sync.

## Agent auto-merge

An Agent-authored pull request may enable auto-merge after its title and body are complete:

```bash
gh pr merge --auto --squash "$PULL_REQUEST_URL"
```

GitHub merges only after required checks pass. The Agent must not use administrator tokens, bypass rules, or edit checks to force a merge.

## Pull-request checks

The `quality` job validates workflows, lint, formatting, types, unit tests, documentation, build, Linux integration tests, Electron end-to-end tests, Conventional Commits, and production dependency audit. Before the pnpm steps it loads an AppArmor profile that grants bubblewrap user namespaces — Ubuntu 24.04 mediation otherwise kills bwrap during loopback setup — and runs a sandbox-launcher smoke check that writes a file through `bwrap`. The `windows-sandbox` job builds the native helper, runs its adversarial script, and verifies the desktop shell on Windows. When the end-to-end test fails, the script captures a screenshot, the page DOM, the renderer console log, and a Playwright trace under `artifacts/e2e/`, and the job uploads them as the `e2e-failure-artifacts` artifact (retained 14 days).

A green local run is useful evidence but is not proof that branch protection is configured.

Return to the [how-to guide index](README.md).
