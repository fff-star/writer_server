import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EvidenceService } from "./evidence-service";
import type { LibraryService } from "./library-service";
import { EncryptionUnavailableError } from "./secret-store";
import type { SettingsService } from "./settings-service";

const ENV_KEY = "BRAVE_SEARCH_API_KEY";

const stubLibrary = { blocks: () => [] } as unknown as LibraryService;

function stubSettings(secrets: Record<string, string>): SettingsService {
  return {
    getSecret: (name: string) => Promise.resolve(secrets[name] ?? null),
  } as unknown as SettingsService;
}

function rejectingSettings(error: Error): SettingsService {
  return { getSecret: () => Promise.reject(error) } as unknown as SettingsService;
}

let root: string | undefined;
let service: EvidenceService | undefined;
let savedKey: string | undefined;

function userDataRoot(): string {
  if (!root) {
    throw new Error("test root is not initialized");
  }
  return root;
}

beforeEach(async () => {
  savedKey = process.env[ENV_KEY];
  delete process.env[ENV_KEY];
  root = await mkdtemp(join(tmpdir(), "office-agent-evidence-test-"));
});

afterEach(async () => {
  service?.close();
  service = undefined;
  if (savedKey === undefined) {
    delete process.env[ENV_KEY];
  } else {
    process.env[ENV_KEY] = savedKey;
  }
  savedKey = undefined;
  if (root) {
    await rm(root, { recursive: true, force: true });
    root = undefined;
  }
});

async function createService(settings?: SettingsService): Promise<EvidenceService> {
  service = await EvidenceService.create(stubLibrary, userDataRoot(), settings);
  return service;
}

describe("EvidenceService key resolution", () => {
  it("reports research as unavailable when no key is configured anywhere", async () => {
    const evidence = await createService();
    expect(evidence.hasResearch()).toBe(false);
    const report = await evidence.analyzeBudget("汇总预算");
    expect(report.budget.quarters).toEqual([]);
    expect(report.web).toEqual({
      available: false,
      reason: "BRAVE_SEARCH_API_KEY is not configured",
    });
    await expect(evidence.collectResearch("差旅政策")).rejects.toThrow(
      "BRAVE_SEARCH_API_KEY is not configured",
    );
  });

  it("treats a missing stored secret as no key", async () => {
    const evidence = await createService(stubSettings({}));
    expect(evidence.hasResearch()).toBe(false);
  });

  it("enables research from the environment key", async () => {
    process.env[ENV_KEY] = "env-key";
    const evidence = await createService();
    expect(evidence.hasResearch()).toBe(true);
    expect(existsSync(join(userDataRoot(), "research", "web-cache.db"))).toBe(true);
  });

  it("enables research from the stored key without an environment key", async () => {
    const evidence = await createService(stubSettings({ "brave-search-api-key": "stored-key" }));
    expect(evidence.hasResearch()).toBe(true);
  });

  it("prefers the stored key over the environment key", async () => {
    // The stored key wins via nullish coalescing: an empty stored key still
    // shadows the environment key, and an empty key disables research.
    process.env[ENV_KEY] = "env-key";
    const evidence = await createService(stubSettings({ "brave-search-api-key": "" }));
    expect(evidence.hasResearch()).toBe(false);
  });

  it("falls back to the environment key when secure storage is unavailable", async () => {
    process.env[ENV_KEY] = "env-key";
    const evidence = await createService(rejectingSettings(new EncryptionUnavailableError()));
    expect(evidence.hasResearch()).toBe(true);
  });

  it("treats unavailable secure storage without an environment key as no key", async () => {
    const evidence = await createService(rejectingSettings(new EncryptionUnavailableError()));
    expect(evidence.hasResearch()).toBe(false);
  });

  it("propagates unexpected settings errors", async () => {
    process.env[ENV_KEY] = "env-key";
    await expect(createService(rejectingSettings(new Error("disk read failed")))).rejects.toThrow(
      "disk read failed",
    );
  });
});
