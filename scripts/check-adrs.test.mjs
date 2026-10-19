import { describe, expect, it } from "vitest";
import { evaluateAdrProtection, validateAdr } from "./check-adrs.mjs";

const validAdr = `# ADR 0001: Example

- Status: Proposed
- Date: 2026-10-19

## Context

Context.

## Decision

Decision.

## Consequences

Consequences.
`;

describe("validateAdr", () => {
  it("accepts a valid numbered ADR", () => {
    expect(validateAdr("docs/adr/0001-example.md", validAdr)).toEqual([]);
  });

  it("rejects missing structure and mismatched numbers", () => {
    const issues = validateAdr("docs/adr/0002-example.md", "# ADR 0001: Example\n");
    expect(issues.some((item) => item.includes("Status"))).toBe(true);
    expect(issues.some((item) => item.includes("Date"))).toBe(true);
    expect(issues.some((item) => item.includes("filename number"))).toBe(true);
    expect(issues.some((item) => item.includes("## Context"))).toBe(true);
  });
});

describe("evaluateAdrProtection", () => {
  const accepted = validAdr.replace("Status: Proposed", "Status: Accepted");

  it("rejects quiet edits to accepted ADRs", () => {
    const issues = evaluateAdrProtection([
      { path: "docs/adr/0001-example.md", before: accepted, after: `${accepted}\nQuiet edit.\n` },
    ]);
    expect(issues[0]).toContain("immutable");
  });

  it("accepts an explicit superseded transition", () => {
    expect(
      evaluateAdrProtection([
        {
          path: "docs/adr/0001-example.md",
          before: accepted,
          after:
            accepted.replace("Status: Accepted", "Status: Superseded") +
            "\nSuperseded by ADR 0002.\n",
        },
      ]),
    ).toEqual([]);
  });

  it("ignores proposed ADR edits", () => {
    expect(
      evaluateAdrProtection([
        {
          path: "docs/adr/0001-example.md",
          before: validAdr,
          after: `${validAdr}\nMore detail.\n`,
        },
      ]),
    ).toEqual([]);
  });
});
