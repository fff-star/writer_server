import { describe, expect, it } from "vitest";
import { evaluateDocsImpact } from "./check-docs-impact.mjs";

describe("evaluateDocsImpact", () => {
  it("rejects code changes without documentation", () => {
    const violations = evaluateDocsImpact({
      files: ["packages/library/src/store.ts"],
      note: "feat: change storage",
    });
    expect(violations.some((item) => item.includes("documentation update"))).toBe(true);
  });

  it.each(["docs/README.md", "README.md", "CHANGELOG.md", "docs/adr/0099-example.md"])(
    "accepts code changes with %s",
    (documentation) => {
      expect(
        evaluateDocsImpact({
          files: ["apps/desktop/src/main/index.ts", documentation],
        }),
      ).toEqual([]);
    },
  );

  it("requires security-specific documentation for security changes", () => {
    const violations = evaluateDocsImpact({
      files: ["packages/security/src/linux-sandbox.ts", "README.md"],
    });
    expect(violations.some((item) => item.includes("security changes"))).toBe(true);
    expect(
      evaluateDocsImpact({
        files: ["packages/security/src/linux-sandbox.ts", "SECURITY.md"],
      }),
    ).toEqual([]);
  });

  it("requires library and research reference documentation", () => {
    expect(
      evaluateDocsImpact({
        files: ["packages/library/src/store.ts", "docs/reference/library-formats.md"],
      }),
    ).toEqual([]);
    expect(
      evaluateDocsImpact({
        files: ["packages/research/src/service.ts", "docs/reference/research-providers.md"],
      }),
    ).toEqual([]);
  });

  it("requires automation documentation for workflow and script changes", () => {
    const violations = evaluateDocsImpact({
      files: [".github/workflows/ci.yml", "README.md"],
    });
    expect(violations.some((item) => item.includes("automation changes"))).toBe(true);
    expect(
      evaluateDocsImpact({
        files: [".github/workflows/ci.yml", "docs/reference/commands.md"],
      }),
    ).toEqual([]);
  });

  it("accepts an explicit standalone docs-impact none marker", () => {
    expect(
      evaluateDocsImpact({
        files: ["packages/library/src/store.ts"],
        note: "refactor: rename internals\n\ndocs-impact: none\n",
      }),
    ).toEqual([]);
  });

  it("does not accept marker-like text inside prose", () => {
    const violations = evaluateDocsImpact({
      files: ["packages/library/src/store.ts"],
      note: "This mentions docs-impact: none without declaring it",
    });
    expect(violations.length).toBeGreaterThan(0);
  });
});
