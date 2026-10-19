# Research providers

Web research uses replaceable search and fetch providers. The Brave Search provider is enabled when an API key is configured in the protected settings store or, as a development adapter, when `BRAVE_SEARCH_API_KEY` is present in the main-process environment. Without a key, the application reports web research as unavailable and still completes local deterministic analysis.

Fetched pages must be public HTTP or HTTPS documents. Localhost, private addresses, unsupported content types, oversized pages, and private DNS results are rejected. Fetched text is cached locally with its URL, title, timestamp, and content hash.

Provider credentials must never be sent to the renderer, Subagents, sandboxed jobs, logs, fixtures, or source caches. API keys are stored by the main-process settings service: values are encrypted with Electron `safeStorage` and persisted in `settings/secrets.json` under the application user-data directory with owner-only file permissions. If system encryption is unavailable, the service fails closed and refuses to store or read secrets. The renderer can only set, delete, or list key names and see whether a key is configured; it can never read a stored value. Key resolution checks the settings store first, then falls back to the `BRAVE_SEARCH_API_KEY` environment variable, which remains a development-only adapter. Without a key from either source, web research reports itself unavailable.

Return to the [reference index](README.md).
