import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuditLog } from "./audit-log.js";

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("AuditLog", () => {
  it("chains events and redacts credential-like fields", async () => {
    const root = await mkdtemp(join(tmpdir(), "office-agent-audit-"));
    temporary.push(root);
    const path = join(root, "audit.jsonl");
    const log = await AuditLog.create(path);
    const first = await log.append("workspace.grant", "allowed", {
      path: "/workspace",
      apiKey: "do-not-log",
    });
    const second = await log.append("sandbox.run", "completed", { nested: { token: "hidden" } });

    expect(second.previousHash).toBe(first.hash);
    const persisted = await readFile(path, "utf8");
    expect(persisted).not.toContain("do-not-log");
    expect(persisted).not.toContain("hidden");
    expect(persisted).toContain("[redacted]");
  });
});
