# Configuration

Office Agent is local-first and works without any provider configuration. Optional providers are enabled through protected settings and a small set of environment variables.

## Protected settings

Provider API keys are stored by the main-process settings service, encrypted with Electron `safeStorage` in `settings/secrets.json` under the application user-data directory. The settings panel in the desktop application can set, delete, and list key names and shows whether each key is configured; it never displays a stored value. If system encryption is unavailable, storing or reading secrets fails closed with an explicit error. See [ADR 0008](../adr/0008-protected-local-settings.md).

Known secret names:

| Secret name            | Purpose                                        |
| ---------------------- | ---------------------------------------------- |
| `brave-search-api-key` | Brave Search key for public-web research.      |
| `ocr-api-key`          | Bearer key for the configured OCR endpoint.    |
| `visual-api-key`       | Bearer key for the configured visual endpoint. |

## Environment variables

| Variable                       | Purpose                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `BRAVE_SEARCH_API_KEY`         | Development-only fallback for the Brave Search key; the settings store takes precedence.              |
| `OFFICE_AGENT_OCR_ENDPOINT`    | HTTPS endpoint of an OCR provider; the OCR adapter is created only when the matching key is set.      |
| `OFFICE_AGENT_VISUAL_ENDPOINT` | HTTPS endpoint of a visual provider; the visual adapter is created only when the matching key is set. |
| `OFFICE_AGENT_EXECUTABLE`      | Points the end-to-end checks at a packaged binary instead of the development build.                   |

OCR and visual adapters send images as multipart POST requests with a Bearer key and a request timeout; provider responses are schema-validated and error messages never include the key. Without both an endpoint and its key, the corresponding extraction provider is absent and imports stay in their explicit `partial` state. Web research key resolution and cache behavior are described in [research providers](research-providers.md).

Return to the [reference index](README.md).
