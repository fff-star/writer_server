# Office Agent

Office Agent is a local-first Electron application being built around the Pi TypeScript SDK. Its goal is to combine immutable local source libraries, grounded web research, Chinese document writing, and explicitly sandboxed workspace automation.

## Current status

The repository has completed the foundation, managed-library, and evidence-analysis milestones, and the M3 document studio is substantially in place: structured editing of the canonical document model, editable citations, versioned manual edits with conflict surfacing, and DOCX/PDF export with save dialogs. The editor tab binds the paginated canvas editor to the same document model — it loads the selected document's latest version and saves explicit versions through the studio version store. Grounded Chinese drafting is wired end-to-end but returns an explicit unavailable reason until a draft writer (LLM credentials) is configured. OCR and visual provider interfaces, HTTP adapters, and protected local settings for provider keys are done; images and scanned PDFs index real content once providers are configured.

Both sandbox CI jobs are green. The Linux failure was root-caused to bubblewrap 0.9 dying on loopback setup under Ubuntu 24.04 AppArmor user-namespace mediation; the Windows failure took three fixes — a Low mandatory-integrity workspace label (mandatory no-write-up blocked the Low-integrity process despite the DACL grant), a conformant AppContainer environment block with per-run profile directories (error 203), and adaptive Job-Object breakaway (error 5 on runners whose enclosing job forbids it). The renderer is organized around projects: a persisted conversation per project, project-scoped generated documents, a global managed library, and protected settings.

The M4 workspace Agent milestone has landed its security core: a policy broker in `packages/security` is the only gateway for workspace tool calls (path confinement, credential-target denial, no-overwrite creation, per-file edit backups with byte-exact rollback, hash-chained audit of every decision, per ADR 0012). A startup self-check probes the bubblewrap adapter, and shell stays disabled unless the probe passes; Windows fails closed until the native helper ships in the app. Broker-gated tools (list/read/create/edit-with-rollback/shell) are registered with the isolated Pi session only when a broker is explicitly supplied — the default session stays tool-free — and write-capable Subagent tasks (`workspace-edit` role) run only under a broker. No LLM credentials exist yet, so the agent host wiring is unit-tested but not yet exercised end-to-end with a live model. Agent shell execution and file organization remain disabled in the desktop app itself.

See the [documentation map](docs/README.md) for architecture, decisions, development workflows, and current capability boundaries.

## Next TODO

- Configure a draft writer behind the drafting boundary so studio drafting becomes available (requires LLM credentials), and wire the agent host to a live model so the broker-gated workspace tools run end-to-end.
- Trigger the manual preview-release workflow once to validate it. Windows packaging, remote branch protection (pull request plus required `quality` and `windows-sandbox` checks), and auto-merge are validated.

## Development requirements

- Node.js 24
- pnpm 10.33 or newer within the same major version
- LibreOffice for legacy DOC conversion tests
- bubblewrap for Linux sandbox tests

## Quick start

```bash
pnpm install
pnpm build
pnpm test
pnpm dev
```

Run all local verification before submitting a change:

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

## Security and privacy

The renderer has no Node.js integration. Pi starts without tools, project extensions, persisted sessions, or user Pi credentials. Application tools must be explicitly registered after the policy broker and operating-system sandbox pass their tests.

Cloud model features may send task-required excerpts to configured providers. No such feature is enabled by the foundation shell. Never place real credentials in source files, fixtures, logs, or issue reports.

## Linux preview executable

Build the Linux packages and a self-extracting executable that does not require FUSE:

```bash
pnpm package:linux:binary
./release/office-agent-0.1.0-linux-portable.run
```

The executable extracts once to the user's versioned cache directory and starts the cached Electron binary.

## Release status

There is no production release. Preview artifacts are unsigned and include SHA-256 checksums. Production signing, built-in automatic upgrades, domestic Linux distributions, and ARM64 are outside the current milestone.
