import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuditLog, type AuditEvent } from "./audit-log.js";
import { createPolicyBroker, isCredentialTarget, PolicyDeniedError } from "./policy-broker.js";
import type { LinuxSandboxResult } from "./linux-sandbox.js";

const temporary: string[] = [];

async function brokerFixture(
  overrides: Partial<{
    shellEnabled: boolean;
    platform: NodeJS.Platform;
  }> = {},
) {
  const root = await mkdtemp(join(tmpdir(), "office-agent-broker-adv-"));
  temporary.push(root);
  const workspace = join(root, "workspace");
  await mkdir(workspace);
  const auditLog = await AuditLog.create(join(root, "audit.jsonl"));
  const broker = createPolicyBroker({
    workspace,
    auditLog,
    shellEnabled: overrides.shellEnabled ?? false,
    ...(overrides.platform ? { platform: overrides.platform } : {}),
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

describe("credential-target denylist", () => {
  it("matches credential-like path segments", () => {
    const denied = [
      ".env",
      ".env.local",
      "config/.env.production",
      "id_rsa",
      "id_ed25519",
      "keys/server.pem",
      "tls/private.key",
      "cert.p12",
      ".ssh/config",
      ".aws/credentials",
      ".gnupg/secring.gpg",
      ".netrc",
      "netrc",
      ".npmrc",
      "credentials",
      "credentials.json",
      ".git-credentials",
    ];
    for (const path of denied) {
      expect(isCredentialTarget(path), path).toBe(true);
    }
    const allowed = ["notes.txt", "src/index.ts", "environment.md", "keys.txt", "ssh-notes.md"];
    for (const path of allowed) {
      expect(isCredentialTarget(path), path).toBe(false);
    }
  });
});

describe("policy broker adversarial paths", () => {
  it("denies lexical escapes and records them in the audit log", async () => {
    const { root, workspace, broker } = await brokerFixture();
    await writeFile(join(root, "outside.txt"), "outside");
    await expect(broker.readFile("../outside.txt")).rejects.toThrow(PolicyDeniedError);
    await expect(broker.listDirectory("..")).rejects.toThrow("escapes");
    await expect(broker.createFile("../evil.txt", "x")).rejects.toThrow("escapes");
    const events = await auditEvents(root);
    expect(events).toHaveLength(3);
    expect(events.every((event) => event.outcome === "denied")).toBe(true);
    await expect(readFile(join(workspace, "..", "evil.txt"), "utf8")).rejects.toThrow();
  });

  it("denies symlink escapes", async () => {
    const { root, workspace, broker } = await brokerFixture();
    const secret = join(root, "secret.txt");
    await writeFile(secret, "secret");
    await symlink(secret, join(workspace, "link.txt"));
    await expect(broker.readFile("link.txt")).rejects.toThrow(PolicyDeniedError);
    await expect(broker.editFile("link.txt", "changed")).rejects.toThrow(PolicyDeniedError);
    await expect(readFile(secret, "utf8")).resolves.toBe("secret");
    const events = await auditEvents(root);
    expect(events.every((event) => event.outcome === "denied")).toBe(true);
  });

  it("denies credential-target paths for read, create, and edit", async () => {
    const { root, workspace, broker } = await brokerFixture();
    await writeFile(join(workspace, ".env"), "TOKEN=canary");
    await expect(broker.readFile(".env")).rejects.toThrow("Credential-target");
    await expect(broker.editFile(".env", "TOKEN=changed")).rejects.toThrow("Credential-target");
    await expect(broker.createFile("id_rsa", "key")).rejects.toThrow("Credential-target");
    await expect(broker.createFile(".ssh/config", "host *")).rejects.toThrow("Credential-target");
    await expect(broker.createFile(".aws/credentials", "x")).rejects.toThrow("Credential-target");
    await expect(readFile(join(workspace, ".env"), "utf8")).resolves.toBe("TOKEN=canary");
    const events = await auditEvents(root);
    expect(events).toHaveLength(5);
    expect(events.every((event) => event.outcome === "denied")).toBe(true);
    expect(JSON.stringify(events)).not.toContain("canary");
  });

  it("denies overwrite through create", async () => {
    const { root, workspace, broker } = await brokerFixture();
    await broker.createFile("result.txt", "first");
    await expect(broker.createFile("result.txt", "second")).rejects.toThrow("overwrite");
    await expect(readFile(join(workspace, "result.txt"), "utf8")).resolves.toBe("first");
    const events = await auditEvents(root);
    expect(events.at(-1)).toMatchObject({ type: "workspace.create", outcome: "denied" });
  });

  it("restores exact prior bytes on rollback", async () => {
    const { workspace, broker } = await brokerFixture();
    const original = new Uint8Array([0, 1, 2, 255, 10, 13, 128]);
    await broker.createFile("binary.bin", original);
    const before = new Uint8Array(await readFile(join(workspace, "binary.bin")));
    const edit = await broker.editFile("binary.bin", new Uint8Array([9, 9, 9]));
    await expect(readFile(join(workspace, "binary.bin"))).resolves.toEqual(Buffer.from([9, 9, 9]));
    await broker.rollbackChange(edit.changeId);
    const restored = new Uint8Array(await readFile(join(workspace, "binary.bin")));
    expect(restored).toEqual(before);
    // A change id can only be rolled back once.
    await expect(broker.rollbackChange(edit.changeId)).rejects.toThrow("Unknown change id");
  });

  it("denies editing files that do not exist", async () => {
    const { broker } = await brokerFixture();
    await expect(broker.editFile("missing.txt", "x")).rejects.toThrow(PolicyDeniedError);
  });

  it("denies shell when shellEnabled is false", async () => {
    const { root, broker } = await brokerFixture({ shellEnabled: false, platform: "linux" });
    await expect(broker.runShell("/bin/true")).rejects.toThrow("disabled by policy");
    const events = await auditEvents(root);
    expect(events.at(-1)).toMatchObject({ type: "shell.run", outcome: "denied" });
  });

  it("fails closed for shell on win32 and darwin even when enabled", async () => {
    for (const platform of ["win32", "darwin"] as const) {
      const { root, broker } = await brokerFixture({ shellEnabled: true, platform });
      await expect(broker.runShell("/bin/true")).rejects.toThrow(PolicyDeniedError);
      const events = await auditEvents(root);
      expect(events.at(-1)).toMatchObject({ type: "shell.run", outcome: "denied" });
      expect(events.at(-1)!.details["platform"]).toBe(platform);
    }
  });

  it("never invokes the sandbox runner when policy denies shell", async () => {
    const root = await mkdtemp(join(tmpdir(), "office-agent-broker-adv-"));
    temporary.push(root);
    const workspace = join(root, "workspace");
    await mkdir(workspace);
    const auditLog = await AuditLog.create(join(root, "audit.jsonl"));
    let invoked = false;
    const runSandbox = async (): Promise<LinuxSandboxResult> => {
      invoked = true;
      return { code: 0, signal: null, stdout: "", stderr: "", warnings: [], timedOut: false };
    };
    const disabled = createPolicyBroker({
      workspace,
      auditLog,
      shellEnabled: false,
      platform: "linux",
      runSandbox,
    });
    await expect(disabled.runShell("/bin/true")).rejects.toThrow();
    const wrongPlatform = createPolicyBroker({
      workspace,
      auditLog,
      shellEnabled: true,
      platform: "win32",
      runSandbox,
    });
    await expect(wrongPlatform.runShell("/bin/true")).rejects.toThrow();
    expect(invoked).toBe(false);
  });
});
