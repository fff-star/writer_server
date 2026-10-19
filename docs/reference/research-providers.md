# Research providers

Web research uses replaceable search and fetch providers. The current development adapter supports Brave Search when `BRAVE_SEARCH_API_KEY` is present in the main-process environment. Without that key, the application reports web research as unavailable and still completes local deterministic analysis.

Fetched pages must be public HTTP or HTTPS documents. Localhost, private addresses, unsupported content types, oversized pages, and private DNS results are rejected. Fetched text is cached locally with its URL, title, timestamp, and content hash.

Provider credentials must never be sent to the renderer, Subagents, sandboxed jobs, logs, fixtures, or source caches. A later settings milestone will move key storage to Electron `safeStorage`; the environment variable is only a development adapter.

Return to the [reference index](README.md).
