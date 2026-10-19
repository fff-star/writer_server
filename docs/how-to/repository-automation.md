# Configure repository automation

These settings require the actual GitHub repository and administrator access. Local files cannot prove that they are configured.

## Branch protection

Protect the default branch and require a successful `quality` check, `windows-sandbox` check, and dependency review for every pull request. Require branches to be current before merging and block force pushes.

Allow repository auto-merge, but do not bypass required checks. Release publication remains a separate manual action through the protected `preview-release` environment.

## Agent auto-merge

An Agent-authored pull request may enable auto-merge after its title and body are complete:

```bash
gh pr merge --auto --squash "$PULL_REQUEST_URL"
```

GitHub merges only after required checks pass. The Agent must not use administrator tokens, bypass rules, or edit checks to force a merge.

## Pull-request checks

The `quality` job validates workflows, lint, formatting, types, unit tests, documentation, build, Linux integration tests, Electron end-to-end tests, Conventional Commits, and production dependency audit. The `windows-sandbox` job builds the native helper, runs its adversarial script, and verifies the desktop shell on Windows.

A green local run is useful evidence but is not proof that branch protection is configured.

Return to the [how-to guide index](README.md).
