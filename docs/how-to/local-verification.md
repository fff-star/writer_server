# Run local verification

Use Node.js 24 and install exact workspace dependencies with `pnpm install`.

Run the checks relevant to your change, then run the complete suite before submitting:

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm docs:check
pnpm build
```

`pnpm test:e2e` builds and launches the Electron application. It verifies that the user interface loads and that the renderer cannot access Node.js globals. After `pnpm package`, set `OFFICE_AGENT_EXECUTABLE` to the unpacked binary or self-extracting `.run` file to run the same end-to-end checks against the packaged artifact.

Legacy DOC tests require `soffice` on the executable path. Linux sandbox tests require `bwrap`. A missing tool must produce an explicit result; it must not cause a security check to pass without exercising the boundary.

Live DeepSeek and web-search checks are separate optional smoke tests. Configure credentials locally through the approved secret mechanism and never commit them. Deterministic tests must not depend on those credentials.

See the [command reference](../reference/commands.md).
