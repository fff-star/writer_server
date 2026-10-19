import { describe, expect, it } from "vitest";
import { HttpOcrProvider, HttpVisualProvider } from "./providers.js";

const image = { data: new Uint8Array([0x89, 0x50]), mediaType: "image/png", fileName: "scan.png" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("HttpOcrProvider", () => {
  it("posts the image as multipart form data and validates the response", async () => {
    let seenBody: FormData | undefined;
    let seenAuthorization: string | null = null;
    const provider = new HttpOcrProvider({
      endpoint: "https://ocr.example.com/v1/recognize",
      apiKey: "secret-key",
      fetchImplementation: async (_input, init) => {
        seenBody = init?.body as FormData;
        seenAuthorization = new Headers(init?.headers).get("authorization");
        return jsonResponse({ text: "识别结果", confidence: 0.87, language: "chi_sim" });
      },
    });
    const result = await provider.recognize({ image, languages: ["chi_sim", "eng"] });
    expect(result).toEqual({ text: "识别结果", confidence: 0.87, language: "chi_sim" });
    expect(seenAuthorization).toBe("Bearer secret-key");
    expect(seenBody?.get("languages")).toBe("chi_sim,eng");
    const file = seenBody?.get("file");
    expect(file).toBeInstanceOf(Blob);
    expect((file as Blob).type).toBe("image/png");
  });

  it("rejects an invalid response shape", async () => {
    const provider = new HttpOcrProvider({
      endpoint: "https://ocr.example.com/v1/recognize",
      apiKey: "secret-key",
      fetchImplementation: async () => jsonResponse({ unexpected: true }),
    });
    await expect(provider.recognize({ image })).rejects.toThrow();
  });

  it("fails visibly on HTTP errors without leaking the API key", async () => {
    const provider = new HttpOcrProvider({
      endpoint: "https://ocr.example.com/v1/recognize",
      apiKey: "secret-key",
      fetchImplementation: async () => jsonResponse({ error: "secret-key" }, 401),
    });
    await expect(provider.recognize({ image })).rejects.toThrow(
      'OCR provider "http-ocr" failed with HTTP 401',
    );
    await expect(provider.recognize({ image })).rejects.not.toThrow(/secret-key/);
  });

  it("times out when the endpoint does not respond", async () => {
    const provider = new HttpOcrProvider({
      endpoint: "https://ocr.example.com/v1/recognize",
      apiKey: "secret-key",
      timeoutMs: 10,
      fetchImplementation: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation timed out.", "TimeoutError"));
          });
        }),
    });
    await expect(provider.recognize({ image })).rejects.toThrow(/timed out/);
  });
});

describe("HttpVisualProvider", () => {
  it("posts the image and validates the caption response", async () => {
    let seenBody: FormData | undefined;
    const provider = new HttpVisualProvider({
      endpoint: "https://vision.example.com/v1/describe",
      apiKey: "secret-key",
      id: "fake-vision",
      fetchImplementation: async (_input, init) => {
        seenBody = init?.body as FormData;
        return jsonResponse({ caption: "一张扫描的发票", tags: ["发票"] });
      },
    });
    const result = await provider.describe({ image, prompt: "描述图片内容" });
    expect(result).toEqual({ caption: "一张扫描的发票", tags: ["发票"] });
    expect(seenBody?.get("prompt")).toBe("描述图片内容");
    expect(provider.id).toBe("fake-vision");
  });

  it("fails visibly on HTTP errors", async () => {
    const provider = new HttpVisualProvider({
      endpoint: "https://vision.example.com/v1/describe",
      apiKey: "secret-key",
      fetchImplementation: async () => jsonResponse({}, 500),
    });
    await expect(provider.describe({ image })).rejects.toThrow(
      'Visual provider "http-visual" failed with HTTP 500',
    );
  });
});
