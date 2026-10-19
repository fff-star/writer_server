import { HttpOcrProvider, HttpVisualProvider } from "@office-agent/ingestion";
import type { ExtractionOptions } from "@office-agent/ingestion";
import { EncryptionUnavailableError } from "./secret-store";
import type { SettingsService } from "./settings-service";

export const OCR_ENDPOINT_ENV = "OFFICE_AGENT_OCR_ENDPOINT";
export const VISUAL_ENDPOINT_ENV = "OFFICE_AGENT_VISUAL_ENDPOINT";
export const OCR_SECRET_NAME = "ocr-api-key";
export const VISUAL_SECRET_NAME = "visual-api-key";

async function readSecret(settings: SettingsService, name: string): Promise<string | null> {
  try {
    return await settings.getSecret(name);
  } catch (error) {
    if (error instanceof EncryptionUnavailableError) {
      return null;
    }
    throw error;
  }
}

export async function resolveExtractionProviders(
  settings: SettingsService,
): Promise<ExtractionOptions> {
  const options: ExtractionOptions = {};
  const ocrEndpoint = process.env[OCR_ENDPOINT_ENV];
  const ocrKey = await readSecret(settings, OCR_SECRET_NAME);
  if (ocrEndpoint && ocrKey) {
    options.ocr = new HttpOcrProvider({ endpoint: ocrEndpoint, apiKey: ocrKey });
  }
  const visualEndpoint = process.env[VISUAL_ENDPOINT_ENV];
  const visualKey = await readSecret(settings, VISUAL_SECRET_NAME);
  if (visualEndpoint && visualKey) {
    options.visual = new HttpVisualProvider({ endpoint: visualEndpoint, apiKey: visualKey });
  }
  return options;
}
