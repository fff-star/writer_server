import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EmbeddingProvider } from "@office-agent/contracts";
import { LibraryStore } from "@office-agent/library";
import { afterEach, describe, expect, it } from "vitest";
import { HybridRetriever } from "./hybrid.js";

const temporary: string[] = [];

function vectorFor(text: string): number[] {
  if (text.toLowerCase().includes("travel") || text.includes("差旅") || text.includes("出差")) {
    return [0, 1];
  }
  return [1, 0];
}

const fakeEmbedding: EmbeddingProvider = {
  id: "fake-embedding",
  dimensions: 2,
  embed: async (texts) => texts.map(vectorFor),
};

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("HybridRetriever", () => {
  it("combines lexical matches with provider-backed semantic matches", async () => {
    const root = await mkdtemp(join(tmpdir(), "office-agent-hybrid-"));
    temporary.push(root);
    const input = join(root, "notes.txt");
    await writeFile(input, "预算报告\n出差费用");
    const store = await LibraryStore.open(join(root, "library"));
    const imported = await store.importFile(input);
    store.recordBlocks(
      imported.snapshot.id,
      [
        { kind: "text", text: "预算报告", locator: { kind: "line", line: 1 } },
        { kind: "text", text: "出差费用", locator: { kind: "line", line: 2 } },
      ],
      "indexed",
    );

    const retriever = new HybridRetriever(store, fakeEmbedding);
    await retriever.indexSnapshot(imported.snapshot.id);
    const lexical = await retriever.search("预算");
    expect(lexical[0]?.text).toBe("预算报告");
    expect(lexical[0]?.sources).toContain("lexical");

    const semantic = await retriever.search("travel reimbursement");
    expect(semantic[0]?.text).toBe("出差费用");
    expect(semantic[0]?.sources).toContain("semantic");
    store.close();
  });
});
