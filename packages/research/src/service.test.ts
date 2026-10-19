import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WebCache } from "./cache.js";
import { HttpFetchProvider, type FetchProvider, type SearchProvider } from "./providers.js";
import { ResearchService } from "./service.js";
import { assertPublicHttpUrl } from "./url.js";

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("ResearchService", () => {
  it("collects sources and reuses the local cache", async () => {
    const root = await mkdtemp(join(tmpdir(), "office-agent-research-"));
    temporary.push(root);
    const searchProvider: SearchProvider = {
      id: "fake-search",
      search: async () => [
        {
          title: "预算公开资料",
          url: "https://example.com/budget",
          snippet: "公开预算资料",
        },
      ],
    };
    let fetches = 0;
    const fetchProvider: FetchProvider = {
      fetchSource: async (url) => {
        fetches += 1;
        return {
          url,
          title: "预算公开资料",
          text: "第一季度预算为 1200 元",
          sha256: "a".repeat(64),
          fetchedAt: new Date().toISOString(),
        };
      },
    };
    const cache = await WebCache.open(join(root, "web-cache.db"));
    const service = new ResearchService(searchProvider, fetchProvider, cache);
    const first = await service.collect("预算");
    const second = await service.collect("预算");
    expect(first.sources[0]?.text).toContain("1200");
    expect(second.sources).toHaveLength(1);
    expect(fetches).toBe(1);
    cache.close();
  });
});

describe("HttpFetchProvider", () => {
  it("extracts text through a bounded public fetch", async () => {
    const fetchImplementation: typeof fetch = async () =>
      new Response(
        "<html><head><title>研究标题</title></head><body><script>bad()</script><p>第一季度预算 1200 元</p></body></html>",
        { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    const provider = new HttpFetchProvider(fetchImplementation, async () => [
      { address: "93.184.216.34", family: 4 },
    ]);
    const source = await provider.fetchSource("https://example.com/report");
    expect(source.title).toBe("研究标题");
    expect(source.text).toContain("1200");
    expect(source.text).not.toContain("bad()");
  });
});

describe("assertPublicHttpUrl", () => {
  it("rejects private and local targets", async () => {
    await expect(assertPublicHttpUrl("http://127.0.0.1/secret")).rejects.toThrow("Private");
    await expect(assertPublicHttpUrl("http://localhost/secret")).rejects.toThrow("Local");
    await expect(assertPublicHttpUrl("file:///tmp/secret")).rejects.toThrow("HTTP");
  });
});
