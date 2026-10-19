import { z } from "zod";

export type ProviderImage = {
  data: Uint8Array;
  mediaType: string;
  fileName?: string;
};

export type OcrRequest = {
  image: ProviderImage;
  languages?: string[];
};

export type OcrResult = {
  text: string;
  confidence?: number;
  language?: string;
};

export type OcrProvider = {
  id: string;
  recognize: (request: OcrRequest) => Promise<OcrResult>;
};

export type VisualRequest = {
  image: ProviderImage;
  prompt?: string;
};

export type VisualResult = {
  caption: string;
  tags?: string[];
};

export type VisualProvider = {
  id: string;
  describe: (request: VisualRequest) => Promise<VisualResult>;
};

export type PdfPageRasterizer = {
  id: string;
  renderPages: (path: string) => Promise<ProviderImage[]>;
};

const httpOcrResponseSchema = z.object({
  text: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  language: z.string().optional(),
});

export type HttpProviderOptions = {
  endpoint: string;
  apiKey: string;
  id?: string;
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
};

function imageFormData(image: ProviderImage): FormData {
  const form = new FormData();
  form.set("file", new Blob([image.data], { type: image.mediaType }), image.fileName ?? "image");
  return form;
}

export class HttpOcrProvider implements OcrProvider {
  readonly id: string;

  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly fetchImplementation: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: HttpProviderOptions) {
    this.id = options.id ?? "http-ocr";
    this.endpoint = options.endpoint;
    this.apiKey = options.apiKey;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async recognize(request: OcrRequest): Promise<OcrResult> {
    const form = imageFormData(request.image);
    if (request.languages && request.languages.length > 0) {
      form.set("languages", request.languages.join(","));
    }
    const response = await this.fetchImplementation(this.endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: form,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`OCR provider "${this.id}" failed with HTTP ${response.status}`);
    }
    const body = httpOcrResponseSchema.parse(await response.json());
    return {
      text: body.text,
      ...(body.confidence !== undefined ? { confidence: body.confidence } : {}),
      ...(body.language !== undefined ? { language: body.language } : {}),
    };
  }
}

const httpVisualResponseSchema = z.object({
  caption: z.string(),
  tags: z.array(z.string()).optional(),
});

export class HttpVisualProvider implements VisualProvider {
  readonly id: string;

  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly fetchImplementation: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: HttpProviderOptions) {
    this.id = options.id ?? "http-visual";
    this.endpoint = options.endpoint;
    this.apiKey = options.apiKey;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async describe(request: VisualRequest): Promise<VisualResult> {
    const form = imageFormData(request.image);
    if (request.prompt) {
      form.set("prompt", request.prompt);
    }
    const response = await this.fetchImplementation(this.endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: form,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`Visual provider "${this.id}" failed with HTTP ${response.status}`);
    }
    const body = httpVisualResponseSchema.parse(await response.json());
    return {
      caption: body.caption,
      ...(body.tags !== undefined ? { tags: body.tags } : {}),
    };
  }
}
