# Develop with Agents

## Before a task

Read root `AGENTS.md`, then follow the relevant links from the [documentation map](../README.md). Define a verifiable user outcome and identify affected security, privacy, migration, and documentation behavior.

## During a task

Keep changes focused. Add or update automated tests with the implementation. Use synthetic fixtures and deterministic model doubles. Record a new ADR when choosing between architecture-level alternatives or changing a previous decision.

Do not enable a planned interface merely to make a demonstration appear complete. Unsupported operations must return an explicit status. Do not weaken a test, sandbox, citation requirement, or documentation check to hide a failure.

## Before merge

Run all affected root checks and inspect the final diff for secrets, generated files, stale comments, and documentation drift. A pull request must describe the behavior, test evidence, risk, and remaining limitations.

Agent-authored pull requests may use repository auto-merge only after every required check succeeds. Branch protection and required-check names must match the CI workflows. Tags, releases, and publication require separate human approval.

Return to the [how-to guide index](README.md).
