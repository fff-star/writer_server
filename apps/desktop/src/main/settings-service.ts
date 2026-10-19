import { safeStorage } from "electron";
import { join } from "node:path";
import { EncryptionUnavailableError, SecretStore, type SecretEncryptor } from "./secret-store";

export const KNOWN_SECRET_NAMES = [
  "brave-search-api-key",
  "ocr-api-key",
  "visual-api-key",
] as const;

class SafeStorageEncryptor implements SecretEncryptor {
  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  encrypt(plaintext: string): string {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new EncryptionUnavailableError();
    }
    return safeStorage.encryptString(plaintext).toString("base64");
  }

  decrypt(encoded: string): string {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new EncryptionUnavailableError();
    }
    return safeStorage.decryptString(Buffer.from(encoded, "base64"));
  }
}

export class SettingsService {
  private constructor(private readonly store: SecretStore) {}

  static create(userDataRoot: string): SettingsService {
    return new SettingsService(
      new SecretStore(join(userDataRoot, "settings", "secrets.json"), new SafeStorageEncryptor()),
    );
  }

  setSecret(name: string, value: string): Promise<void> {
    return this.store.setSecret(name, value);
  }

  hasSecret(name: string): Promise<boolean> {
    return this.store.hasSecret(name);
  }

  getSecret(name: string): Promise<string | null> {
    return this.store.getSecret(name);
  }

  deleteSecret(name: string): Promise<boolean> {
    return this.store.deleteSecret(name);
  }

  listSecretNames(): Promise<string[]> {
    return this.store.listSecretNames();
  }
}
