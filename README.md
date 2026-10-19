# Office Agent

Office Agent is a local-first Electron application being built around the Pi TypeScript SDK. Its goal is to combine immutable local source libraries, grounded web research, Chinese document writing, and explicitly sandboxed workspace automation.

## Current status

The repository has completed the foundation, managed-library, and evidence-analysis milestones, and the M3 document studio is substantially in place: structured editing of the canonical document model, editable citations, versioned manual edits with conflict surfacing, and DOCX/PDF export with save dialogs. Grounded Chinese drafting is wired end-to-end but returns an explicit unavailable reason until a draft writer (LLM credentials) is configured, and full canvas-editor model binding is deferred. OCR and visual provider interfaces, HTTP adapters, and protected local settings for provider keys are done; images and scanned PDFs index real content once providers are configured.

The latest sandbox CI run was red on both jobs. The Linux failure is root-caused to bubblewrap 0.9 dying on loopback setup under Ubuntu 24.04 AppArmor user-namespace mediation, and the Windows failure to mandatory no-write-up blocking the Low-integrity sandboxed process despite the workspace DACL grant. Fixes are implemented locally — a CI AppArmor profile plus launcher-diagnostic classification on Linux, and a Low mandatory-integrity workspace label on Windows — but await confirmation by a green CI run. The Windows native change is review-verified only and has not been compiled locally. Agent shell execution and file organization remain disabled.

See the [documentation map](docs/README.md) for architecture, decisions, development workflows, and current capability boundaries.

## Next TODO

- Push the sandbox fixes, watch the GitHub Actions run, and iterate until the Linux and Windows sandbox jobs are green.
- Configure a draft writer behind the drafting boundary so studio drafting becomes available, and bind the full canvas editor to the document model.
- Complete the M4 workspace Agent only after the Windows and Linux sandboxes pass their adversarial tests.
- Validate Windows packaging, remote branch protection, auto-merge behavior, and the manual preview-release workflow.

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
