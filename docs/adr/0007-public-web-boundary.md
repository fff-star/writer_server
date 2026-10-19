# ADR 0007: Restrict research to replaceable public-web providers

- Status: Accepted
- Date: 2026-10-19

## Context

Research needs fresh web evidence without turning arbitrary source content into instructions or allowing server-side request forgery against the user's network.

## Decision

Use replaceable search and fetch providers, with Brave as the first development adapter. Fetch only public HTTP or HTTPS pages after hostname, IP, content-type, size, and private-DNS checks. Cache extracted text locally with URL, timestamp, and content hash. Treat fetched text as untrusted evidence and keep provider credentials in the main process.

## Consequences

Private or authenticated sources are outside this milestone. DNS resolution and redirects remain network risks that require ongoing review, and provider availability is explicit rather than silently replaced by local text.

Return to the [ADR index](README.md).
