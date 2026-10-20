import { randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { AuditLog } from "./audit-log.js";
import type { LinuxSandboxRequest, LinuxSandboxResult } from "./linux-sandbox.js";
import { runLinuxSandbox } from "./linux-sandbox.js";
import { createFileNoOverwrite, resolveWorkspacePath } from "./path-policy.js";

export class PolicyDeniedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "PolicyDeniedError";
  }
}

// Credential-target denylist. Every path segment of a broker request is matched
// against these patterns; any match denies the operation regardless of where the
// resolved path lands. The list covers secret-bearing dotfiles (.env*, .netrc),
// private key and certificate containers (*.pem, *.key, *.p12, *.pfx, OpenSSH
// id_* keys), credential directories (.ssh, .aws, .gnupg, .azure, .kube, .docker),
// package-registry token files (.npmrc, .pypirc), and files literally named
// "credential(s)" with common config extensions.
export const CREDENTIAL_TARGET_PATTERNS: readonly RegExp[] = [
  /^\.env(?:\..+)?$/i,
  /^\.envrc$/i,
  /\.(?:pem|key|p12|pfx)$/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$/i,
  /^\.(?:ssh|aws|gnupg|azure|kube|docker)$/i,
  /^\.?(?:netrc|npmrc|pypirc)$/i,
  /^credentials?(?:\.(?:json|ini|yaml|yml|txt))?$/i,
  /^\.git-credentials$/i,
];

export function isCredentialTarget(candidate: string): boolean {
  const segments = candidate.split(/[\\/]+/).filter((segment) => segment !== "" && segment !== ".");
  return segments.some((segment) =>
    CREDENTIAL_TARGET_PATTERNS.some((pattern) => pattern.test(segment)),
  );
}

export type ListDirectoryEntry = {
  name: string;
  type: "file" | "directory" | "symlink" | "other";
};

export type EditResult = {
  path: string;
  changeId: string;
};

export type ShellOptions = {
  timeoutMs?: number;
};

export type SandboxRunner = (request: LinuxSandboxRequest) => Promise<LinuxSandboxResult>;

export type PolicyBrokerOptions = {
  workspace: string;
  auditLog: AuditLog;
  shellEnabled: boolean;
  // Injectable for tests and for fail-closed platform checks. Defaults to the
  // real platform and the real bubblewrap runner.
  platform?: NodeJS.Platform;
  runSandbox?: SandboxRunner;
  maxReadBytes?: number;
};

export type PolicyBroker = {
  readonly workspace: string;
  listDirectory(relativePath: string): Promise<ListDirectoryEntry[]>;
  readFile(relativePath: string): Promise<string>;
  createFile(relativePath: string, content: string | Uint8Array): Promise<string>;
  editFile(relativePath: string, content: string | Uint8Array): Promise<EditResult>;
  rollbackChange(changeId: string): Promise<void>;
  runShell(command: string, args?: string[], options?: ShellOptions): Promise<LinuxSandboxResult>;
};

const DEFAULT_MAX_READ_BYTES = 1_048_576;

type BackupRecord = {
  path: string;
  backupPath: string;
};

export function createPolicyBroker(options: PolicyBrokerOptions): PolicyBroker {
  const platform = options.platform ?? process.platform;
  const runSandbox = options.runSandbox ?? runLinuxSandbox;
  const maxReadBytes = options.maxReadBytes ?? DEFAULT_MAX_READ_BYTES;
  const backups = new Map<string, BackupRecord>();
  let backupDirectory: Promise<string> | undefined;

  function backupRoot(): Promise<string> {
    backupDirectory ??= mkdtemp(join(tmpdir(), "office-agent-broker-"));
    return backupDirectory;
  }

  async function deny(
    type: string,
    details: Record<string, unknown>,
    reason: string,
  ): Promise<never> {
    await options.auditLog.append(type, "denied", { ...details, reason });
    throw new PolicyDeniedError(reason);
  }

  function assertAllowedTarget(type: string, candidate: string): Promise<void> | undefined {
    if (isCredentialTarget(candidate)) {
      return deny(type, { path: candidate }, `Credential-target path is denied: ${candidate}`);
    }
    return undefined;
  }

  async function resolveOrDeny(
    type: string,
    candidate: string,
    resolveOptions: { allowMissing?: boolean } = {},
  ): Promise<string> {
    try {
      return await resolveWorkspacePath(options.workspace, candidate, resolveOptions);
    } catch (error) {
      return deny(type, { path: candidate }, (error as Error).message);
    }
  }

  return {
    workspace: options.workspace,

    async listDirectory(relativePath: string): Promise<ListDirectoryEntry[]> {
      const type = "workspace.list";
      const resolved = await resolveOrDeny(type, relativePath);
      let entries;
      try {
        entries = await readdir(resolved, { withFileTypes: true });
      } catch (error) {
        await options.auditLog.append(type, "failed", {
          path: resolved,
          reason: (error as Error).message,
        });
        throw error;
      }
      const listing = entries.map((entry): ListDirectoryEntry => {
        const typeName = entry.isFile()
          ? "file"
          : entry.isDirectory()
            ? "directory"
            : entry.isSymbolicLink()
              ? "symlink"
              : "other";
        return { name: entry.name, type: typeName };
      });
      listing.sort((left, right) => left.name.localeCompare(right.name));
      await options.auditLog.append(type, "allowed", {
        path: resolved,
        entryCount: listing.length,
      });
      return listing;
    },

    async readFile(relativePath: string): Promise<string> {
      const type = "workspace.read";
      await assertAllowedTarget(type, relativePath);
      const resolved = await resolveOrDeny(type, relativePath);
      const info = await stat(resolved);
      if (!info.isFile()) {
        return deny(type, { path: resolved }, `Not a regular file: ${relativePath}`);
      }
      if (info.size > maxReadBytes) {
        return deny(
          type,
          { path: resolved, size: info.size },
          `File exceeds the read size cap of ${maxReadBytes} bytes: ${relativePath}`,
        );
      }
      // Content is returned to the caller but never written to the audit log.
      const content = await readFile(resolved, "utf8");
      await options.auditLog.append(type, "allowed", { path: resolved, bytes: info.size });
      return content;
    },

    async createFile(relativePath: string, content: string | Uint8Array): Promise<string> {
      const type = "workspace.create";
      await assertAllowedTarget(type, relativePath);
      let resolved: string;
      try {
        resolved = await createFileNoOverwrite(options.workspace, relativePath, content);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "EEXIST") {
          return deny(
            type,
            { path: relativePath },
            `Refusing to overwrite an existing file: ${relativePath}`,
          );
        }
        return deny(type, { path: relativePath }, (error as Error).message);
      }
      await options.auditLog.append(type, "completed", { path: resolved });
      return resolved;
    },

    async editFile(relativePath: string, content: string | Uint8Array): Promise<EditResult> {
      const type = "workspace.edit";
      await assertAllowedTarget(type, relativePath);
      const resolved = await resolveOrDeny(type, relativePath);
      const info = await stat(resolved).catch(() => undefined);
      if (!info?.isFile()) {
        return deny(type, { path: relativePath }, `No existing file to edit: ${relativePath}`);
      }
      // Per-file backup: copy the exact prior bytes into a broker-owned temp
      // directory before writing, so rollbackChange can restore them byte-for-byte.
      const changeId = randomUUID();
      const changeDirectory = join(await backupRoot(), changeId);
      await mkdir(changeDirectory, { recursive: true });
      const backupPath = join(changeDirectory, "backup");
      await copyFile(resolved, backupPath);
      await writeFile(resolved, content);
      backups.set(changeId, { path: resolved, backupPath });
      await options.auditLog.append(type, "completed", { path: resolved, changeId });
      return { path: resolved, changeId };
    },

    async rollbackChange(changeId: string): Promise<void> {
      const type = "workspace.rollback";
      const record = backups.get(changeId);
      if (!record) {
        return deny(type, { changeId }, `Unknown change id: ${changeId}`);
      }
      await copyFile(record.backupPath, record.path);
      await rm(dirname(record.backupPath), { recursive: true, force: true });
      backups.delete(changeId);
      await options.auditLog.append(type, "completed", { changeId, path: record.path });
    },

    async runShell(
      command: string,
      args: string[] = [],
      shellOptions: ShellOptions = {},
    ): Promise<LinuxSandboxResult> {
      const type = "shell.run";
      if (platform !== "linux") {
        return deny(
          type,
          { command, platform },
          `Shell execution is disabled: no sandbox is available on platform ${platform}`,
        );
      }
      if (!options.shellEnabled) {
        return deny(type, { command }, "Shell execution is disabled by policy");
      }
      const request: LinuxSandboxRequest = {
        workspace: options.workspace,
        command,
        args,
      };
      if (shellOptions.timeoutMs !== undefined) {
        request.timeoutMs = shellOptions.timeoutMs;
      }
      const result = await runSandbox(request);
      // Log the invocation and its status only; stdout/stderr stay out of the
      // audit log because command output may contain secrets.
      await options.auditLog.append(type, "completed", {
        command,
        code: result.code,
        signal: result.signal,
        timedOut: result.timedOut,
      });
      return result;
    },
  };
}
