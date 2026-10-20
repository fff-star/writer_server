import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuditLog } from "./audit-log.js";
import { createPolicyBroker, type PolicyBroker } from "./policy-broker.js";
import {
  createFileTool,
  editFileTool,
  listDirectoryTool,
  readFileTool,
  rollbackChangeTool,
  runShellTool,
} from "./workspace-tools.js";

const temporary: string[] = [];

async function toolsFixture(overrides: { shellEnabled?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), "office-agent-tools-"));
  temporary.push(root);
  const workspace = join(root, "workspace");
  await mkdir(workspace);
  const auditLog = await AuditLog.create(join(root, "audit.jsonl"));
  const broker = createPolicyBroker({
    workspace,
    auditLog,
    shellEnabled: overrides.shellEnabled ?? false,
  });
  return { root, workspace, broker };
}

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("workspace tools", () => {
  it("delegates happy-path operations through the broker", async () => {
    const { workspace, broker } = await toolsFixture();
    await writeFile(join(workspace, "notes.txt"), "original");

    const listing = await listDirectoryTool(broker, ".");
    expect(listing).toEqual({
      ok: true,
      path: ".",
      entries: [{ name: "notes.txt", type: "file" }],
    });

    await expect(readFileTool(broker, "notes.txt")).resolves.toEqual({
      ok: true,
      path: "notes.txt",
      content: "original",
    });

    const created = await createFileTool(broker, "new.txt", "fresh");
    expect(created).toMatchObject({ ok: true });

    const edited = await editFileTool(broker, "notes.txt", "updated");
    expect(edited).toMatchObject({ ok: true });
    if (!edited.ok) {
      throw new Error("expected edit to succeed");
    }
    await expect(readFileTool(broker, "notes.txt")).resolves.toMatchObject({
      ok: true,
      content: "updated",
    });
    await expect(rollbackChangeTool(broker, edited.changeId)).resolves.toEqual({
      ok: true,
      changeId: edited.changeId,
    });
    await expect(readFileTool(broker, "notes.txt")).resolves.toMatchObject({
      ok: true,
      content: "original",
    });
  });

  it("surfaces denials as { ok: false, reason } results", async () => {
    const { broker } = await toolsFixture();
    await expect(readFileTool(broker, "../escape.txt")).resolves.toMatchObject({
      ok: false,
      reason: expect.stringContaining("escapes") as string,
    });
    await expect(readFileTool(broker, ".env")).resolves.toMatchObject({
      ok: false,
      reason: expect.stringContaining("Credential-target") as string,
    });
    await expect(rollbackChangeTool(broker, "no-such-change")).resolves.toMatchObject({
      ok: false,
      reason: expect.stringContaining("Unknown change id") as string,
    });
    await expect(runShellTool(broker, "/bin/true")).resolves.toMatchObject({
      ok: false,
      reason: expect.stringContaining("disabled") as string,
    });
  });

  it("returns the sandbox result for an allowed shell call", async () => {
    const root = await mkdtemp(join(tmpdir(), "office-agent-tools-"));
    temporary.push(root);
    const workspace = join(root, "workspace");
    await mkdir(workspace);
    const auditLog = await AuditLog.create(join(root, "audit.jsonl"));
    const broker: PolicyBroker = createPolicyBroker({
      workspace,
      auditLog,
      shellEnabled: true,
      platform: "linux",
      runSandbox: async () => ({
        code: 3,
        signal: null,
        stdout: "out",
        stderr: "err",
        warnings: [],
        timedOut: false,
      }),
    });
    const result = await runShellTool(broker, "/bin/false");
    expect(result).toMatchObject({
      ok: true,
      result: { code: 3, stdout: "out", stderr: "err" },
    });
  });
});
