import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runLinuxSandbox } from "../../packages/security/src/linux-sandbox.js";

const linux = process.platform === "linux" ? describe : describe.skip;
let root: string;
let workspace: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "office-agent-bwrap-"));
  workspace = join(root, "workspace");
  await mkdir(workspace);
});

afterEach(async () => {
  if (root) {
    await rm(root, { recursive: true, force: true });
  }
});

linux("Linux bubblewrap boundary", () => {
  it("starts a sandboxed process on this host", async () => {
    const probe = await runLinuxSandbox({
      workspace,
      command: "/bin/true",
    });
    expect(
      probe,
      `bwrap could not start a sandbox on this host: ${JSON.stringify(probe)}`,
    ).toMatchObject({ code: 0, timedOut: false });
  });

  it("allows workspace writes and strips inherited secrets", async () => {
    const write = await runLinuxSandbox({
      workspace,
      command: "/bin/bash",
      args: ["-c", "printf ok > /workspace/result.txt"],
    });
    expect(write, `sandbox result: ${JSON.stringify(write)}`).toMatchObject({
      code: 0,
      stderr: "",
    });
    expect(existsSync(join(workspace, "result.txt"))).toBe(true);

    const environment = await runLinuxSandbox({
      workspace,
      command: "/bin/bash",
      args: ["-c", 'if test -z "$CANARY_SECRET"; then printf clean; else printf leaked; fi'],
    });
    expect(environment.stdout).toBe("clean");
    expect(environment, `sandbox result: ${JSON.stringify(environment)}`).toMatchObject({
      code: 0,
      stderr: "",
    });
  });

  it("denies host credential reads and symlink escapes", async () => {
    const secret = join(root, "canary.txt");
    await writeFile(secret, "canary");
    await symlink(secret, join(workspace, "escape.txt"));
    const direct = await runLinuxSandbox({
      workspace,
      command: "/bin/cat",
      args: [secret],
    });
    const linked = await runLinuxSandbox({
      workspace,
      command: "/bin/cat",
      args: ["/workspace/escape.txt"],
    });
    expect(direct.code, `sandbox result: ${JSON.stringify(direct)}`).not.toBe(0);
    expect(linked.code, `sandbox result: ${JSON.stringify(linked)}`).not.toBe(0);
    expect(direct.stdout).not.toContain("canary");
    expect(linked.stdout).not.toContain("canary");
  });

  it("does not create host files outside the workspace", async () => {
    const outside = join(root, "outside.txt");
    await runLinuxSandbox({
      workspace,
      command: "/bin/bash",
      args: ["-c", `printf escaped > ${outside}`],
    });
    expect(existsSync(outside)).toBe(false);
  });

  it("denies network access by default", async () => {
    const result = await runLinuxSandbox({
      workspace,
      command: "/bin/bash",
      args: ["-c", "exec 3<>/dev/tcp/1.1.1.1/80"],
      timeoutMs: 3000,
    });
    expect(result.code, `sandbox result: ${JSON.stringify(result)}`).not.toBe(0);
  });
});
