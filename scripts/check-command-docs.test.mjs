import { describe, expect, it } from "vitest";
import { documentedCommands, findCommandIssues, workflowCommands } from "./check-command-docs.mjs";

describe("command freshness checks", () => {
  it("extracts documented and workflow commands", () => {
    expect(documentedCommands("| `pnpm test` | Run tests. |")).toEqual(["test"]);
    expect(
      workflowCommands([
        "name: CI\njobs:\n  test:\n    steps:\n      - run: pnpm install\n      - run: pnpm test\n      - run: xvfb-run -a pnpm test:e2e\n",
      ]),
    ).toEqual(["test", "test:e2e"]);
  });

  it("rejects undocumented, unknown, and inconsistent commands", () => {
    const issues = findCommandIssues({
      scripts: new Set(["test", "build"]),
      documentation: "| `pnpm test` | Run tests. |\n| `pnpm missing` | Bad. |",
      workflows: ["jobs:\n  ci:\n    steps:\n      - run: pnpm build\n      - run: pnpm unknown\n"],
    });
    expect(issues).toContain("documented command does not exist in package.json scripts: missing");
    expect(issues).toContain("package.json script is not documented: build");
    expect(issues).toContain("CI workflow runs an unknown pnpm script: unknown");
    expect(issues).toContain("CI workflow command is not documented: build");
  });

  it("accepts complete command coverage", () => {
    expect(
      findCommandIssues({
        scripts: new Set(["test", "build"]),
        documentation: "| `pnpm test` | Run tests. |\n| `pnpm build` | Build. |",
        workflows: [
          "jobs:\n  ci:\n    steps:\n      - run: pnpm install\n      - run: pnpm test\n",
        ],
      }),
    ).toEqual([]);
  });
});
