# ADR 0009: Ground drafting in evidence behind an injectable writer

- Status: Accepted
- Date: 2026-10-19

## Context

The writing workflow must generate Chinese drafts that cite the managed library and public-web research without inventing sources. Wiring a specific language model directly into the drafting pipeline would hide the grounding contract, block deterministic tests, and make a missing credential look like a malfunction.

## Decision

Drafting depends on an injectable `DraftWriter` interface, not on a concrete model. The drafting service assembles evidence items with explicit reference identifiers from local search results and web collections, builds a Chinese prompt that permits only those identifiers, and parses the writer output as validated canonical document blocks. A citation whose reference identifier is unknown is dropped with a warning; a source is never invented to satisfy a citation, and malformed output raises a drafting error.

When no writer is configured, drafting reports itself unavailable with an explicit reason instead of failing opaquely. This milestone ships the pipeline without bundled LLM credentials, so the desktop draft action always returns that unavailable outcome until a writer is wired in.

## Consequences

Grounding is testable with deterministic fake writers, and provider choice stays open. Prompt-level instructions alone cannot guarantee model compliance, so the parser-level drop of unknown citations is the enforcement point. Drafting quality, cost, and latency remain unverified until a real writer is configured, and the evidence assembly limits draft grounding to the configured local and web result counts.

Return to the [ADR index](README.md).
