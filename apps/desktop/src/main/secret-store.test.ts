import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EncryptionUnavailableError, SecretStore, type SecretEncryptor } from "./secret-store";

const reversibleEncryptor: SecretEncryptor = {
  isAvailable: () => true,
  encrypt: (plaintext) => `enc:${Buffer.from(plaintext, "utf8").toString("base64")}`,
  decrypt: (encoded) => {
    if (!encoded.startsWith("enc:")) {
      throw new Error("ciphertext not produced by this encryptor");
    }
    return Buffer.from(encoded.slice(4), "base64").toString("utf8");
  },
};

const unavailableEncryptor: SecretEncryptor = {
  isAvailable: () => false,
  encrypt: () => {
    throw new EncryptionUnavailableError();
  },
  decrypt: () => {
    throw new EncryptionUnavailableError();
  },
};

describe("SecretStore", () => {
  let directory: string;
  let filePath: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "office-agent-secrets-"));
    filePath = join(directory, "settings", "secrets.json");
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("stores, reads, lists, and deletes secrets", async () => {
    const store = new SecretStore(filePath, reversibleEncryptor);
    expect(await store.hasSecret("brave-search-api-key")).toBe(false);
    expect(await store.getSecret("brave-search-api-key")).toBeNull();

    await store.setSecret("brave-search-api-key", "test-key-1");
    await store.setSecret("other-key", "test-key-2");

    expect(await store.hasSecret("brave-search-api-key")).toBe(true);
    expect(await store.getSecret("brave-search-api-key")).toBe("test-key-1");
    expect(await store.listSecretNames()).toEqual(["brave-search-api-key", "other-key"]);

    expect(await store.deleteSecret("brave-search-api-key")).toBe(true);
    expect(await store.deleteSecret("brave-search-api-key")).toBe(false);
    expect(await store.getSecret("brave-search-api-key")).toBeNull();
    expect(await store.listSecretNames()).toEqual(["other-key"]);
  });

  it("never writes plaintext secrets to disk and restricts file permissions", async () => {
    const store = new SecretStore(filePath, reversibleEncryptor);
    await store.setSecret("brave-search-api-key", "super-secret-value");

    const raw = await readFile(filePath, "utf8");
    expect(raw).not.toContain("super-secret-value");
    expect(JSON.parse(raw)).toEqual({
      version: 1,
      secrets: { "brave-search-api-key": "enc:c3VwZXItc2VjcmV0LXZhbHVl" },
    });
    const stats = await stat(filePath);
    expect(stats.mode & 0o777).toBe(0o600);
  });

  it("persists secrets across store instances", async () => {
    const first = new SecretStore(filePath, reversibleEncryptor);
    await first.setSecret("brave-search-api-key", "persisted-key");

    const second = new SecretStore(filePath, reversibleEncryptor);
    expect(await second.getSecret("brave-search-api-key")).toBe("persisted-key");
    expect(await second.listSecretNames()).toEqual(["brave-search-api-key"]);
  });

  it("fails closed when encryption is unavailable", async () => {
    const store = new SecretStore(filePath, unavailableEncryptor);
    await expect(store.setSecret("brave-search-api-key", "value")).rejects.toBeInstanceOf(
      EncryptionUnavailableError,
    );
    await expect(stat(filePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("fails closed when reading without an available encryptor", async () => {
    const writer = new SecretStore(filePath, reversibleEncryptor);
    await writer.setSecret("brave-search-api-key", "value");

    const reader = new SecretStore(filePath, unavailableEncryptor);
    expect(await reader.hasSecret("brave-search-api-key")).toBe(true);
    await expect(reader.getSecret("brave-search-api-key")).rejects.toBeInstanceOf(
      EncryptionUnavailableError,
    );
  });

  it("refuses to load or overwrite a corrupted secrets file", async () => {
    await mkdir(join(directory, "settings"), { recursive: true });
    await writeFile(filePath, "not json at all", { mode: 0o600 });

    const store = new SecretStore(filePath, reversibleEncryptor);
    await expect(store.listSecretNames()).rejects.toThrow(/corrupted/);
    await expect(store.setSecret("brave-search-api-key", "value")).rejects.toThrow(/corrupted/);
    expect(await readFile(filePath, "utf8")).toBe("not json at all");
  });

  it("rejects secrets files with an unsupported shape", async () => {
    await mkdir(join(directory, "settings"), { recursive: true });
    await writeFile(filePath, JSON.stringify({ version: 2, secrets: {} }), { mode: 0o600 });

    const store = new SecretStore(filePath, reversibleEncryptor);
    await expect(store.listSecretNames()).rejects.toThrow(/unsupported shape/);
  });
});
