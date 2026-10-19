import type { ResearchBundle, WebSource } from "@office-agent/contracts";
import type { WebCache } from "./cache.js";
import type { FetchProvider, SearchProvider } from "./providers.js";

export type ResearchCollection = ResearchBundle & {
  failures: Array<{ url: string; error: string }>;
};

export class ResearchService {
  constructor(
    private readonly searchProvider: SearchProvider,
    private readonly fetchProvider: FetchProvider,
    private readonly cache: WebCache,
    private readonly maxAgeMs = 86_400_000,
  ) {}

  async collect(query: string, limit = 5): Promise<ResearchCollection> {
    const results = await this.searchProvider.search(query, limit);
    const sources: WebSource[] = [];
    const failures: Array<{ url: string; error: string }> = [];
    for (const result of results) {
      try {
        const cached = this.cache.get(result.url, this.maxAgeMs);
        const source = cached ?? (await this.fetchProvider.fetchSource(result.url));
        if (!cached) {
          this.cache.put(source);
        }
        sources.push(source);
      } catch (error) {
        failures.push({
          url: result.url,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { query, results, sources, failures };
  }
}
