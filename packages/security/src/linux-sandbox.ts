import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export type LinuxSandboxRequest = {
  workspace: string;
  command: string;
  args?: string[];
  timeoutMs?: number;
};

export type LinuxSandboxResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  warnings: string[];
  timedOut: boolean;
};

function normalizeStderr(stderr: string): { stderr: string; warnings: string[] } {
  const warnings: string[] = [];
  const lines = stderr
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .filter((line) => {
      if (line === "bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted") {
        warnings.push(line);
        return false;
      }
      return true;
    });
  return { stderr: lines.join("\n"), warnings };
}

function sandboxArguments(request: LinuxSandboxRequest): string[] {
  const args = [
    "--die-with-parent",
    "--new-session",
    "--unshare-all",
    "--cap-drop",
    "ALL",
    "--clearenv",
  ];
  for (const path of ["/usr", "/lib", "/lib64", "/bin", "/sbin"]) {
    if (existsSync(path)) {
      args.push("--ro-bind", path, path);
    }
  }
  args.push(
    "--dev",
    "/dev",
    "--proc",
    "/proc",
    "--tmpfs",
    "/tmp",
    "--dir",
    "/workspace",
    "--bind",
    resolve(request.workspace),
    "/workspace",
    "--chdir",
    "/workspace",
    "--setenv",
    "PATH",
    "/usr/bin:/bin",
    "--setenv",
    "HOME",
    "/tmp",
    "--",
    request.command,
    ...(request.args ?? []),
  );
  return args;
}

export async function runLinuxSandbox(request: LinuxSandboxRequest): Promise<LinuxSandboxResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("bwrap", sandboxArguments(request), {
      env: { PATH: process.env["PATH"] ?? "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, request.timeoutMs ?? 5000);

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length < 1_000_000) {
        stdout += chunk.toString("utf8");
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 1_000_000) {
        stderr += chunk.toString("utf8");
      }
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      const normalized = normalizeStderr(stderr);
      resolvePromise({
        code,
        signal,
        stdout,
        stderr: normalized.stderr,
        warnings: normalized.warnings,
        timedOut,
      });
    });
  });
}
