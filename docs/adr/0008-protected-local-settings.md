# ADR 0008: Store provider secrets in encrypted local settings

- Status: Accepted
- Date: 2026-10-19

## Context

Web research, OCR, and visual providers need API keys. Environment variables leak into process listings, crash reports, and child processes, and the renderer must never be able to read a stored credential. There was no sanctioned place for a user to configure a key at runtime.

## Decision

Keep all provider secrets in a main-process settings service. Values are encrypted with Electron `safeStorage` and persisted in `settings/secrets.json` under the application user-data directory with owner-only file permissions. If system encryption is unavailable, the store fails closed with an explicit error instead of writing plaintext, and a corrupted secrets file is refused rather than overwritten.

The renderer can list known secret names, check whether one is configured, and set or delete a value through validated IPC; no IPC channel returns a stored value. Main-process services resolve keys from the settings store first and fall back to environment variables such as `BRAVE_SEARCH_API_KEY`, which remain development-only adapters.

## Consequences

Key entry works without restarting into a development shell, and secrets stay out of the renderer, logs, fixtures, Subagents, and sandboxed jobs. `safeStorage` strength depends on the operating-system keychain, so a headless Linux session without a keychain cannot store secrets and reports that explicitly. Environment-variable fallback keeps CI and development workflows possible but must never be presented as the production path.

Return to the [ADR index](README.md).
