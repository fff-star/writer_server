import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

export async function createIsolatedPiSession() {
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

  return createAgentSession({
    cwd,
    modelRuntime,
    settingsManager,
    resourceLoader,
    sessionManager: SessionManager.inMemory(),
    noTools: "all",
  });
}
