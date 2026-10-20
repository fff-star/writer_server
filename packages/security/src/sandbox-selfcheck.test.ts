import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LinuxSandboxResult } from "./linux-sandbox.js";
import { probeLinuxSandbox, resolveShellAvailability } from "./sandbox-selfcheck.js";

const bwrapAvailable = (() => {
  if (process.platform !== "linux") {
    return false;
  }
  try {
    return spawnSync("bwrap", ["--version"], { stdio: "ignore" }).status === 0;
  } catch {
    return false;
  }
})();

const linuxWithBwrap = bwrapAvailable ? describe : describe.skip;

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function workspaceFixture() {
  const root = await mkdtemp(join(tmpdir(), "office-agent-selfcheck-"));
  temporary.push(root);
  const workspace = join(root, "workspace");
  await mkdir(workspace);
  return { root, workspace };
}

function fakeResult(overrides: Partial<LinuxSandboxResult> = {}): LinuxSandboxResult {
  return {
    code: 0,
    signal: null,
    stdout: "",
    stderr: "",
    warnings: [],
    timedOut: false,
    ...overrides,
  };
}

describe("sandbox self-check fail-closed reasoning", () => {
  it("reports not ok on non-linux platforms without invoking the runner", async () => {
    const { workspace } = await workspaceFixture();
    let invoked = false;
    const probe = await probeLinuxSandbox(workspace, {
      platform: "win32",
      run: async () => {
        invoked = true;
        return fakeResult();
      },
    });
    expect(probe.ok).toBe(false);
    expect(probe.reason).toContain("win32");
    expect(invoked).toBe(false);
    await expect(
      resolveShellAvailability(workspace, { platform: "darwin", run: async () => fakeResult() }),
    ).resolves.toBe(false);
  });

  it("reports not ok when the probe exits non-zero, times out, or throws", async () => {
    const { workspace } = await workspaceFixture();
    const nonZero = await probeLinuxSandbox(workspace, {
      run: async () => fakeResult({ code: 1 }),
    });
    expect(nonZero).toMatchObject({ ok: false });
    expect(nonZero.reason).toContain("code 1");

    const timedOut = await probeLinuxSandbox(workspace, {
      run: async () => fakeResult({ timedOut: true, code: null, signal: "SIGKILL" }),
    });
    expect(timedOut).toMatchObject({ ok: false });
    expect(timedOut.reason).toContain("timed out");

    const failedToStart = await probeLinuxSandbox(workspace, {
      run: async () => {
        throw new Error("spawn bwrap ENOENT");
      },
    });
    expect(failedToStart).toMatchObject({ ok: false });
    expect(failedToStart.reason).toContain("ENOENT");
  });

  it("reports ok only when the injected runner exits cleanly", async () => {
    const { workspace } = await workspaceFixture();
    const probe = await probeLinuxSandbox(workspace, {
      platform: "linux",
      run: async () => fakeResult(),
    });
    expect(probe).toEqual({ ok: true });
  });
});

linuxWithBwrap("sandbox self-check against real bubblewrap", () => {
  it("passes the real probe on this host", async () => {
    const { workspace } = await workspaceFixture();
    const probe = await probeLinuxSandbox(workspace);
    expect(probe, `probe failed: ${JSON.stringify(probe)}`).toEqual({ ok: true });
    await expect(resolveShellAvailability(workspace)).resolves.toBe(true);
  });
});
