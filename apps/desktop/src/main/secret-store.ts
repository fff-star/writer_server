import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface SecretEncryptor {
  isAvailable(): boolean;
  encrypt(plaintext: string): string;
  decrypt(encoded: string): string;
}

export class EncryptionUnavailableError extends Error {
  constructor() {
    super("Secure storage encryption is unavailable; refusing to handle secrets unencrypted");
    this.name = "EncryptionUnavailableError";
  }
}

type SecretsFile = {
  version: 1;
  secrets: Record<string, string>;
};

function parseSecretsFile(raw: string, filePath: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Secrets file at ${filePath} is corrupted; refusing to overwrite it`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`Secrets file at ${filePath} is corrupted; refusing to overwrite it`);
  }
  const file = parsed as Partial<SecretsFile>;
  if (file.version !== 1 || typeof file.secrets !== "object" || file.secrets === null) {
    throw new Error(`Secrets file at ${filePath} has an unsupported shape`);
  }
  for (const value of Object.values(file.secrets)) {
    if (typeof value !== "string") {
      throw new Error(`Secrets file at ${filePath} has an unsupported shape`);
    }
  }
  return { ...file.secrets };
}

export class SecretStore {
  private secrets: Record<string, string> | null = null;

  constructor(
    private readonly filePath: string,
    private readonly encryptor: SecretEncryptor,
  ) {}

  async setSecret(name: string, value: string): Promise<void> {
    if (!this.encryptor.isAvailable()) {
      throw new EncryptionUnavailableError();
    }
    const secrets = await this.load();
    secrets[name] = this.encryptor.encrypt(value);
    await this.save(secrets);
  }

  async hasSecret(name: string): Promise<boolean> {
    return Object.hasOwn(await this.load(), name);
  }

  async getSecret(name: string): Promise<string | null> {
    const encoded = (await this.load())[name];
    if (encoded === undefined) {
      return null;
    }
    if (!this.encryptor.isAvailable()) {
      throw new EncryptionUnavailableError();
    }
    return this.encryptor.decrypt(encoded);
  }

  async deleteSecret(name: string): Promise<boolean> {
    const secrets = await this.load();
    if (!Object.hasOwn(secrets, name)) {
      return false;
    }
    delete secrets[name];
    await this.save(secrets);
    return true;
  }

  async listSecretNames(): Promise<string[]> {
    return Object.keys(await this.load()).sort();
  }

  private async load(): Promise<Record<string, string>> {
    if (this.secrets) {
      return this.secrets;
    }
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.secrets = {};
        return this.secrets;
      }
      throw error;
    }
    this.secrets = parseSecretsFile(raw, this.filePath);
    return this.secrets;
  }

  private async save(secrets: Record<string, string>): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    const file: SecretsFile = { version: 1, secrets };
    await writeFile(this.filePath, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
    await chmod(this.filePath, 0o600);
    this.secrets = secrets;
  }
}
