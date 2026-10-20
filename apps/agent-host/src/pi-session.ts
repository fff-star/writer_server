import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import {
  createFileTool,
  editFileTool,
  listDirectoryTool,
  readFileTool,
  rollbackChangeTool,
  runShellTool,
} from "@office-agent/security";
import type { PolicyBroker, ToolResult } from "@office-agent/security";
import { Type } from "typebox";

export type WorkspaceToolOptions = {
  broker: PolicyBroker;
  shellEnabled: boolean;
};

export type IsolatedPiSessionOptions = {
  workspaceTools?: WorkspaceToolOptions;
};

// Workspace-tools results are already LLM-safe values: denials arrive as
// { ok: false, reason }, never as thrown PolicyDeniedError instances.
function toModelResult(result: ToolResult<object>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
    details: result,
  };
}

export function createWorkspaceToolDefinitions(options: WorkspaceToolOptions): ToolDefinition[] {
  const { broker } = options;
  const tools: ToolDefinition[] = [
    defineTool({
      name: "workspace_list",
      label: "List workspace directory",
      description: "List the entries of a directory inside the agent workspace.",
      promptSnippet: "list workspace directories",
      parameters: Type.Object({
        path: Type.String({ description: "Directory path relative to the workspace root" }),
      }),
      execute: async (_toolCallId, params) =>
        toModelResult(await listDirectoryTool(broker, params.path)),
    }),
    defineTool({
      name: "workspace_read",
      label: "Read workspace file",
      description: "Read a UTF-8 text file inside the agent workspace.",
      promptSnippet: "read workspace files",
      parameters: Type.Object({
        path: Type.String({ description: "File path relative to the workspace root" }),
      }),
      execute: async (_toolCallId, params) =>
        toModelResult(await readFileTool(broker, params.path)),
    }),
    defineTool({
      name: "workspace_create",
      label: "Create workspace file",
      description:
        "Create a new file inside the agent workspace. Fails instead of overwriting an existing file.",
      promptSnippet: "create new workspace files",
      parameters: Type.Object({
        path: Type.String({ description: "File path relative to the workspace root" }),
        content: Type.String({ description: "File content to write" }),
      }),
      execute: async (_toolCallId, params) =>
        toModelResult(await createFileTool(broker, params.path, params.content)),
    }),
    defineTool({
      name: "workspace_edit",
      label: "Edit workspace file",
      description:
        "Replace the content of an existing workspace file. Returns a changeId that workspace_rollback can restore.",
      promptSnippet: "edit workspace files with rollback support",
      parameters: Type.Object({
        path: Type.String({ description: "File path relative to the workspace root" }),
        content: Type.String({ description: "New file content" }),
      }),
      execute: async (_toolCallId, params) =>
        toModelResult(await editFileTool(broker, params.path, params.content)),
    }),
    defineTool({
      name: "workspace_rollback",
      label: "Roll back workspace edit",
      description:
        "Restore a file to its content before a workspace_edit call, using that call's changeId.",
      promptSnippet: "roll back workspace edits by changeId",
      parameters: Type.Object({
        changeId: Type.String({ description: "Change id returned by workspace_edit" }),
      }),
      execute: async (_toolCallId, params) =>
        toModelResult(await rollbackChangeTool(broker, params.changeId)),
    }),
  ];
  if (options.shellEnabled) {
    tools.push(
      defineTool({
        name: "workspace_shell",
        label: "Run sandboxed shell command",
        description:
          "Run a shell command inside the workspace sandbox. Only available when the sandbox probe passed.",
        promptSnippet: "run sandboxed shell commands in the workspace",
        parameters: Type.Object({
          command: Type.String({ description: "Command to execute" }),
          args: Type.Optional(Type.Array(Type.String(), { description: "Command arguments" })),
          timeoutMs: Type.Optional(Type.Number({ description: "Timeout in milliseconds" })),
        }),
        execute: async (_toolCallId, params) =>
          toModelResult(
            await runShellTool(
              broker,
              params.command,
              params.args ?? [],
              params.timeoutMs === undefined ? {} : { timeoutMs: params.timeoutMs },
            ),
          ),
      }),
    );
  }
  return tools;
}

export async function createIsolatedPiSession(options: IsolatedPiSessionOptions = {}) {
  const cwd = process.cwd();
  const settingsManager = SettingsManager.inMemory();
  const modelRuntime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
    refreshOnCreate: false,
  });
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: cwd,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await resourceLoader.reload();

  const customTools = options.workspaceTools
    ? createWorkspaceToolDefinitions(options.workspaceTools)
    : undefined;

  return createAgentSession({
    cwd,
    modelRuntime,
    settingsManager,
    resourceLoader,
    sessionManager: SessionManager.inMemory(),
    // noTools: "all" activates nothing; "builtin" keeps built-ins off while the
    // explicitly registered custom tools stay active.
    noTools: customTools ? "builtin" : "all",
    ...(customTools ? { customTools } : {}),
  });
}
