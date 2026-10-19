# Root commands

| Command                     | Purpose                                                                     |
| --------------------------- | --------------------------------------------------------------------------- |
| `pnpm dev`                  | Start the Electron development shell.                                       |
| `pnpm build`                | Build all workspace packages and the desktop application.                   |
| `pnpm ci:check`             | Validate GitHub workflow structure and required sections.                   |
| `pnpm lint`                 | Run ESLint across source and configuration files.                           |
| `pnpm format:check`         | Check Prettier formatting without modifying files.                          |
| `pnpm typecheck`            | Run strict TypeScript checks in every package.                              |
| `pnpm test`                 | Run deterministic unit tests.                                               |
| `pnpm test:integration`     | Run integration tests, including external-tool adapters when present.       |
| `pnpm test:e2e`             | Build and launch the Electron isolation smoke test.                         |
| `pnpm docs:check`           | Run all documentation, command freshness, and ADR checks.                   |
| `pnpm docs:commands`        | Verify documented commands and CI pnpm commands match package.json scripts. |
| `pnpm docs:adr`             | Validate ADR structure and protect Accepted ADRs from quiet edits.          |
| `pnpm docs:impact`          | Require matching documentation updates for behavior-bearing code changes.   |
| `pnpm package`              | Build desktop packages using the local electron-builder configuration.      |
| `pnpm package:linux:binary` | Build a clean AppImage, self-extracting Linux executable, and checksums.    |

A successful build is not evidence that a planned product feature is available. Check the current [capability boundaries](../explanation/capabilities.md) and test the user-facing path.

Return to the [reference index](README.md).
