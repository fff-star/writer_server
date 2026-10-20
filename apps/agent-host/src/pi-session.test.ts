import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditLog, createPolicyBroker } from "@office-agent/security";
import type { PolicyBroker } from "@office-agent/security";
import { afterEach, describe, expect, it } from "vitest";
import { createIsolatedPiSession, createWorkspaceToolDefinitions } from "./pi-session.js";

const WORKSPACE_TOOL_NAMES = [
  "workspace_create",
  "workspace_edit",
  "workspace_list",
  "workspace_read",
  "workspace_rollback",
];

const roots: string[] = [];

async function createBroker(shellEnabled = false): Promise<PolicyBroker> {
  const root = await mkdtemp(join(tmpdir(), "office-agent-pi-session-"));
  roots.push(root);
  const auditLog = await AuditLog.create(join(root, "audit.jsonl"));
  return createPolicyBroker({ workspace: root, auditLog, shellEnabled });
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("createIsolatedPiSession", () => {
  it("creates a session without exposing tools", async () => {
    const { session } = await createIsolatedPiSession();
    try {
      expect(session.getActiveToolNames()).toEqual([]);
    } finally {
      session.dispose();
    }
  });

  it("activates only the broker-gated workspace tools when provided", async () => {
    const broker = await createBroker();
    const { session } = await createIsolatedPiSession({
      workspaceTools: { broker, shellEnabled: false },
    });
    try {
      const active = session.getActiveToolNames();
      expect([...active].sort()).toEqual(WORKSPACE_TOOL_NAMES);
      for (const builtin of ["read", "bash", "edit", "write", "ls", "grep", "find"]) {
        expect(active).not.toContain(builtin);
      }
    } finally {
      session.dispose();
    }
  });
});

describe("createWorkspaceToolDefinitions", () => {
  it("omits the shell tool unless the sandbox is available", async () => {
    const broker = await createBroker();
    const withoutShell = createWorkspaceToolDefinitions({ broker, shellEnabled: false });
    const withShell = createWorkspaceToolDefinitions({ broker, shellEnabled: true });

    expect(withoutShell.map((tool) => tool.name).sort()).toEqual(WORKSPACE_TOOL_NAMES);
    expect(withShell.map((tool) => tool.name)).toContain("workspace_shell");
  });

  it("returns tool-call results as values, including policy denials", async () => {
    const broker = await createBroker();
    await writeFile(join(broker.workspace, "note.txt"), "hello", "utf8");
    const tools = createWorkspaceToolDefinitions({ broker, shellEnabled: false });
    const read = tools.find((tool) => tool.name === "workspace_read");
    expect(read).toBeDefined();

    const allowed = await read!.execute(
      "call-1",
      { path: "note.txt" },
      undefined,
      undefined,
      {} as never,
    );
    expect(allowed.details).toMatchObject({ ok: true, content: "hello" });

    const denied = await read!.execute(
      "call-2",
      { path: ".env" },
      undefined,
      undefined,
      {} as never,
    );
    expect(denied.details).toMatchObject({ ok: false });
    expect((denied.details as { reason: string }).reason).toContain("denied");
  });
});
