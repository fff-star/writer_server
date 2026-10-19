# Office Agent

Office Agent is a local-first Electron application being built around the Pi TypeScript SDK. Its goal is to combine immutable local source libraries, grounded web research, Chinese document writing, and explicitly sandboxed workspace automation.

## Current status

The repository has completed the foundation, managed-library, and evidence-analysis milestones. The application shell, isolated Pi session, immutable imports, extraction, searchable locators, deterministic budget analysis, replaceable web providers, and read-only Subagent orchestration are present. Agent writing, OCR/visual indexing, and workspace tools remain disabled.

See the [documentation map](docs/README.md) for architecture, decisions, development workflows, and current capability boundaries.

## Next TODO

- Watch the latest GitHub Actions run and fix the remaining Linux/Windows sandbox failures using the annotated CI diagnostics.
- Complete the M3 document studio: grounded Chinese drafting, editable citations, versioned manual edits, and DOCX/PDF export.
- Complete the M4 workspace Agent only after the Windows and Linux sandboxes pass their adversarial tests.
- Validate Windows packaging, remote branch protection, auto-merge behavior, and the manual preview-release workflow.
- Add configured OCR/visual providers and move provider keys from development environment variables to protected local settings.

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
