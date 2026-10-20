import type { LinuxSandboxResult } from "./linux-sandbox.js";
import { runLinuxSandbox } from "./linux-sandbox.js";
import type { SandboxRunner } from "./policy-broker.js";

export type SandboxProbeResult = {
  ok: boolean;
  reason?: string;
};

export type SandboxProbeOptions = {
  // Injectable for tests: the platform and the runner both default to the real
  // ones so production callers get a true fail-closed probe.
  platform?: NodeJS.Platform;
  run?: SandboxRunner;
};

// Probes the OS sandbox with a trivial command. Shell execution may only be
// enabled when this probe succeeds: on any non-Linux platform, on a launcher
// failure, on a non-zero exit, or on a timeout the result is not ok and the
// caller must keep shell disabled (fail closed).
export async function probeLinuxSandbox(
  workspace: string,
  options: SandboxProbeOptions = {},
): Promise<SandboxProbeResult> {
  const platform = options.platform ?? process.platform;
  if (platform !== "linux") {
    return {
      ok: false,
      reason: `No sandbox is available on platform ${platform}; shell execution stays disabled`,
    };
  }
  const run = options.run ?? runLinuxSandbox;
  let result: LinuxSandboxResult;
  try {
    result = await run({ workspace, command: "/bin/true", timeoutMs: 5000 });
  } catch (error) {
    return { ok: false, reason: `Sandbox probe failed to start: ${(error as Error).message}` };
  }
  if (result.timedOut) {
    return { ok: false, reason: "Sandbox probe timed out" };
  }
  if (result.code !== 0) {
    return {
      ok: false,
      reason: `Sandbox probe exited with code ${String(result.code)} (signal ${String(result.signal)})`,
    };
  }
  return { ok: true };
}

// Decides the `shellEnabled` flag for the policy broker: true only when the
// real sandbox probe passes on Linux.
export async function resolveShellAvailability(
  workspace: string,
  options: SandboxProbeOptions = {},
): Promise<boolean> {
  return (await probeLinuxSandbox(workspace, options)).ok;
}
