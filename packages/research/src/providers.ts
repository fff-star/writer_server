import { createHash } from "node:crypto";
import type { WebSearchResult, WebSource } from "@office-agent/contracts";
import { z } from "zod";
import { htmlToText } from "./html.js";
import { assertPublicHttpUrl, type AddressLookup } from "./url.js";

export type SearchProvider = {
  id: string;
  search: (query: string, limit: number) => Promise<WebSearchResult[]>;
};

export type FetchProvider = {
  fetchSource: (url: string) => Promise<WebSource>;
};

const braveResponseSchema = z.object({
  web: z
    .object({
      results: z.array(
        z.object({
          title: z.string(),
          url: z.string(),
          description: z.string().optional(),
          age: z.string().optional(),
        }),
      ),
    })
    .optional(),
});

export class BraveSearchProvider implements SearchProvider {
  readonly id = "brave";

  constructor(
    private readonly apiKey: string,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  async search(query: string, limit: number): Promise<WebSearchResult[]> {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(limit));
    const response = await this.fetchImplementation(url, {
      headers: {
        accept: "application/json",
        "x-subscription-token": this.apiKey,
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`Brave search failed with HTTP ${response.status}`);
    }
    const body = braveResponseSchema.parse(await response.json());
    return (body.web?.results ?? []).slice(0, limit).map((item) => ({
      title: item.title,
      url: item.url,
      snippet: item.description ?? "",
      ...(item.age ? { publishedAt: item.age } : {}),
    }));
  }
}

export class HttpFetchProvider implements FetchProvider {
  constructor(
    private readonly fetchImplementation: typeof fetch = fetch,
    private readonly lookupAddress?: AddressLookup,
    private readonly maxBytes = 1_000_000,
  ) {}

  async fetchSource(value: string): Promise<WebSource> {
    const url = await assertPublicHttpUrl(value, this.lookupAddress);
    const response = await this.fetchImplementation(url, {
      redirect: "follow",
      headers: { accept: "text/html,text/plain;q=0.9" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`Fetch failed with HTTP ${response.status}`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      throw new Error(`Unsupported web content type: ${contentType || "unknown"}`);
    }
    if (!response.body) {
      throw new Error("Fetch response has no body");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) {
        break;
      }
      if (!chunk) {
        continue;
      }
      size += chunk.byteLength;
      if (size > this.maxBytes) {
        await reader.cancel();
        throw new Error("Web source exceeds the one megabyte limit");
      }
      chunks.push(chunk);
    }
    const content = new TextDecoder().decode(Buffer.concat(chunks));
    const extracted = contentType.includes("text/plain")
      ? { title: url.hostname, text: content.trim() }
      : htmlToText(content);
    return {
      url: url.toString(),
      title: extracted.title || url.hostname,
      text: extracted.text,
      sha256: createHash("sha256").update(content).digest("hex"),
      fetchedAt: new Date().toISOString(),
    };
  }
}
