import type { EmbeddingProvider } from "@office-agent/contracts";
import type { LibraryStore, SearchResult, StoredBlock } from "@office-agent/library";

export type HybridSearchResult = StoredBlock & {
  score: number;
  sources: Array<"lexical" | "semantic">;
};

function key(result: StoredBlock): string {
  return `${result.snapshotId}:${result.blockIndex}`;
}

function reciprocalRank(
  results: SearchResult[],
  source: HybridSearchResult["sources"][number],
  limit: number,
) {
  return results.slice(0, limit).map((result, index) => ({
    result,
    source,
    score: 1 / (60 + index + 1),
  }));
}

export class HybridRetriever {
  constructor(
    private readonly store: LibraryStore,
    private readonly embeddingProvider?: EmbeddingProvider,
  ) {}

  async indexSnapshot(snapshotId: string): Promise<void> {
    if (!this.embeddingProvider) {
      return;
    }
    const blocks = this.store.listBlocks(snapshotId);
    if (blocks.length === 0) {
      return;
    }
    const vectors = await this.embeddingProvider.embed(blocks.map((block) => block.text));
    if (vectors.length !== blocks.length) {
      throw new Error(
        "Embedding provider returned a vector count that does not match the block count",
      );
    }
    const provider = this.embeddingProvider;
    vectors.forEach((vector) => {
      if (vector.length !== provider.dimensions) {
        throw new Error("Embedding provider returned a vector with unexpected dimensions");
      }
    });
    this.store.recordEmbeddings(snapshotId, provider.id, vectors);
  }

  async search(query: string, limit = 20): Promise<HybridSearchResult[]> {
    const lexical = reciprocalRank(this.store.searchBlocks(query, limit * 2), "lexical", limit * 2);
    const semantic = this.embeddingProvider
      ? reciprocalRank(
          this.store.searchVectors(
            this.embeddingProvider.id,
            (await this.embeddingProvider.embed([query]))[0] ?? [],
            limit * 2,
          ),
          "semantic",
          limit * 2,
        )
      : [];
    const merged = new Map<string, HybridSearchResult>();
    for (const item of [...lexical, ...semantic]) {
      const itemKey = key(item.result);
      const existing = merged.get(itemKey);
      if (existing) {
        existing.score += item.score;
        if (!existing.sources.includes(item.source)) {
          existing.sources.push(item.source);
        }
      } else {
        const block: StoredBlock = {
          snapshotId: item.result.snapshotId,
          blockIndex: item.result.blockIndex,
          kind: item.result.kind,
          text: item.result.text,
          locator: item.result.locator,
        };
        merged.set(itemKey, { ...block, score: item.score, sources: [item.source] });
      }
    }
    return [...merged.values()].sort((left, right) => right.score - left.score).slice(0, limit);
  }
}
