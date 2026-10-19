import { afterEach, describe, expect, it } from "vitest";
import { HttpOcrProvider, HttpVisualProvider } from "@office-agent/ingestion";
import {
  OCR_ENDPOINT_ENV,
  VISUAL_ENDPOINT_ENV,
  resolveExtractionProviders,
} from "./extraction-providers";
import { EncryptionUnavailableError } from "./secret-store";
import type { SettingsService } from "./settings-service";

function stubSettings(secrets: Record<string, string>): SettingsService {
  return {
    getSecret: (name: string) => Promise.resolve(secrets[name] ?? null),
  } as unknown as SettingsService;
}

const brokenSettings = {
  getSecret: () => Promise.reject(new EncryptionUnavailableError()),
} as unknown as SettingsService;

const envKeys = [OCR_ENDPOINT_ENV, VISUAL_ENDPOINT_ENV];
const savedEnv = new Map<string, string | undefined>();

afterEach(() => {
  for (const key of envKeys) {
    const saved = savedEnv.get(key);
    if (saved === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved;
    }
  }
  savedEnv.clear();
});

function setEnv(key: string, value: string | undefined) {
  if (!savedEnv.has(key)) {
    savedEnv.set(key, process.env[key]);
  }
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

describe("resolveExtractionProviders", () => {
  it("constructs providers only when both endpoint and secret exist", async () => {
    setEnv(OCR_ENDPOINT_ENV, "https://ocr.example.com/recognize");
    setEnv(VISUAL_ENDPOINT_ENV, "https://visual.example.com/describe");
    const options = await resolveExtractionProviders(
      stubSettings({ "ocr-api-key": "ocr-key", "visual-api-key": "visual-key" }),
    );
    expect(options.ocr).toBeInstanceOf(HttpOcrProvider);
    expect(options.visual).toBeInstanceOf(HttpVisualProvider);
  });

  it("omits a provider when its endpoint is missing", async () => {
    setEnv(OCR_ENDPOINT_ENV, undefined);
    setEnv(VISUAL_ENDPOINT_ENV, undefined);
    const options = await resolveExtractionProviders(
      stubSettings({ "ocr-api-key": "ocr-key", "visual-api-key": "visual-key" }),
    );
    expect(options.ocr).toBeUndefined();
    expect(options.visual).toBeUndefined();
  });

  it("omits a provider when its secret is missing", async () => {
    setEnv(OCR_ENDPOINT_ENV, "https://ocr.example.com/recognize");
    setEnv(VISUAL_ENDPOINT_ENV, "https://visual.example.com/describe");
    const options = await resolveExtractionProviders(stubSettings({}));
    expect(options.ocr).toBeUndefined();
    expect(options.visual).toBeUndefined();
  });

  it("degrades silently when secure storage is unavailable", async () => {
    setEnv(OCR_ENDPOINT_ENV, "https://ocr.example.com/recognize");
    setEnv(VISUAL_ENDPOINT_ENV, "https://visual.example.com/describe");
    const options = await resolveExtractionProviders(brokenSettings);
    expect(options.ocr).toBeUndefined();
    expect(options.visual).toBeUndefined();
  });
});
