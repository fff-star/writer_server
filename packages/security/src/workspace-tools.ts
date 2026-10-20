import type {
  EditResult,
  ListDirectoryEntry,
  PolicyBroker,
  ShellOptions,
} from "./policy-broker.js";
import type { LinuxSandboxResult } from "./linux-sandbox.js";

// Tool-call result surface suitable for returning to an LLM: failures are
// values, not exceptions. Every function delegates to the broker, which remains
// the only gateway to workspace operations and the audit log.
export type ToolResult<T> = ({ ok: true } & T) | { ok: false; reason: string };

async function wrap<T>(operation: () => Promise<T>): Promise<ToolResult<T>> {
  try {
    const value = await operation();
    return { ok: true, ...value };
  } catch (error) {
    return { ok: false, reason: (error as Error).message };
  }
}

export async function listDirectoryTool(
  broker: PolicyBroker,
  path: string,
): Promise<ToolResult<{ path: string; entries: ListDirectoryEntry[] }>> {
  return wrap(async () => ({ path, entries: await broker.listDirectory(path) }));
}

export async function readFileTool(
  broker: PolicyBroker,
  path: string,
): Promise<ToolResult<{ path: string; content: string }>> {
  return wrap(async () => ({ path, content: await broker.readFile(path) }));
}

export async function createFileTool(
  broker: PolicyBroker,
  path: string,
  content: string | Uint8Array,
): Promise<ToolResult<{ path: string }>> {
  return wrap(async () => ({ path: await broker.createFile(path, content) }));
}

export async function editFileTool(
  broker: PolicyBroker,
  path: string,
  content: string | Uint8Array,
): Promise<ToolResult<EditResult>> {
  return wrap(() => broker.editFile(path, content));
}

export async function rollbackChangeTool(
  broker: PolicyBroker,
  changeId: string,
): Promise<ToolResult<{ changeId: string }>> {
  return wrap(async () => {
    await broker.rollbackChange(changeId);
    return { changeId };
  });
}

export async function runShellTool(
  broker: PolicyBroker,
  command: string,
  args: string[] = [],
  options: ShellOptions = {},
): Promise<ToolResult<{ result: LinuxSandboxResult }>> {
  return wrap(async () => ({ result: await broker.runShell(command, args, options) }));
}
