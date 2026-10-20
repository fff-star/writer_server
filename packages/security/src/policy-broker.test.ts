import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuditLog, type AuditEvent } from "./audit-log.js";
import { createPolicyBroker } from "./policy-broker.js";

const temporary: string[] = [];

async function brokerFixture(overrides: { shellEnabled?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), "office-agent-broker-"));
  temporary.push(root);
  const workspace = join(root, "workspace");
  await mkdir(workspace);
  const auditLog = await AuditLog.create(join(root, "audit.jsonl"));
  const broker = createPolicyBroker({
    workspace,
    auditLog,
    shellEnabled: overrides.shellEnabled ?? false,
  });
  return { root, workspace, auditLog, broker };
}

async function auditEvents(root: string): Promise<AuditEvent[]> {
  const content = await readFile(join(root, "audit.jsonl"), "utf8");
  return content
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AuditEvent);
}

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("policy broker allowed paths", () => {
  it("lists, reads, creates, and edits files inside the workspace", async () => {
    const { workspace, broker } = await brokerFixture();
    await writeFile(join(workspace, "notes.txt"), "original");

    const listing = await broker.listDirectory(".");
    expect(listing).toEqual([{ name: "notes.txt", type: "file" }]);

    await expect(broker.readFile("notes.txt")).resolves.toBe("original");

    await mkdir(join(workspace, "drafts"));
    const created = await broker.createFile("drafts/new.txt", "fresh");
    await expect(readFile(created, "utf8")).resolves.toBe("fresh");

    const edit = await broker.editFile("notes.txt", "updated");
    expect(edit.changeId).toBeTruthy();
    await expect(broker.readFile("notes.txt")).resolves.toBe("updated");
  });

  it("appends hash-chained audit entries for allowed and denied decisions", async () => {
    const { root, broker } = await brokerFixture();
    await broker.createFile("a.txt", "a");
    await broker.listDirectory(".");
    await expect(broker.readFile(".env")).rejects.toThrow("Credential-target");

    const events = await auditEvents(root);
    expect(events.map((event) => event.type)).toEqual([
      "workspace.create",
      "workspace.list",
      "workspace.read",
    ]);
    expect(events.map((event) => event.outcome)).toEqual(["completed", "allowed", "denied"]);
    events.forEach((event, index) => {
      expect(event.sequence).toBe(index + 1);
      expect(event.previousHash).toBe(index === 0 ? "0".repeat(64) : events[index - 1]!.hash);
    });
    const denied = events[2]!;
    expect(denied.details["path"]).toBe(".env");
    expect(JSON.stringify(events)).not.toContain("fresh");
  });

  it("runs shell commands through the sandbox only when enabled on linux", async () => {
    const root = await mkdtemp(join(tmpdir(), "office-agent-broker-"));
    temporary.push(root);
    const workspace = join(root, "workspace");
    await mkdir(workspace);
    const auditLog = await AuditLog.create(join(root, "audit.jsonl"));
    const calls: string[] = [];
    const broker = createPolicyBroker({
      workspace,
      auditLog,
      shellEnabled: true,
      platform: "linux",
      runSandbox: async (request) => {
        calls.push(request.command);
        return {
          code: 0,
          signal: null,
          stdout: "ok",
          stderr: "",
          warnings: [],
          timedOut: false,
        };
      },
    });
    const result = await broker.runShell("/bin/echo", ["ok"]);
    expect(result.code).toBe(0);
    expect(calls).toEqual(["/bin/echo"]);
    const events = await auditEvents(root);
    expect(events.at(-1)).toMatchObject({ type: "shell.run", outcome: "completed" });
    expect(JSON.stringify(events)).not.toContain("ok");
  });
});
