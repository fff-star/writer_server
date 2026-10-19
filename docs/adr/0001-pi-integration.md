# ADR 0001: Embed Pi through an isolated SDK host

- Status: Accepted
- Date: 2026-10-19

## Context

The application needs Pi model routing, sessions, and extensibility without inheriting the permissions and configuration of a user's terminal Agent. Pi does not provide a built-in permission sandbox, and its default SDK discovery can load existing settings and resources.

## Decision

Embed `@earendil-works/pi-coding-agent` in a separate local Agent host. Create sessions with in-memory settings, credentials, and history; disable context files, extensions, skills, prompt templates, themes, and every tool. Register application-owned tools only after their contracts and policy enforcement exist.

The Electron renderer will communicate through typed application APIs rather than loading Pi or provider credentials.

## Consequences

The host must explicitly implement permissions, Subagents, audit behavior, and tool lifecycle. Pi upgrades require contract and isolation tests. A disabled tool list is not treated as an operating-system security boundary.

Return to the [ADR index](README.md).
