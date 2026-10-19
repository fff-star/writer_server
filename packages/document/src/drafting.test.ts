import { describe, expect, it } from "vitest";
import type { LibrarySearchResult, ResearchBundle } from "@office-agent/contracts";
import { DraftingError, DraftingService, buildEvidence, localLocator } from "./drafting.js";
import type { DraftPrompt, DraftWriter } from "./drafting.js";
import { officeDocumentSchema } from "./model.js";

const localResults: LibrarySearchResult[] = [
  {
    snapshotId: "snap-1",
    snapshotName: "预算表.xlsx",
    blockIndex: 0,
    kind: "table-row",
    text: "第一季度预算 1200 万元",
    locator: { kind: "row", sheet: "预算", row: 2 },
    score: 0.9,
  },
];

const bundle: ResearchBundle = {
  query: "预算",
  results: [],
  sources: [
    {
      url: "https://example.com/budget",
      title: "预算管理办法",
      text: "预算应当遵循公开透明原则。",
      sha256: "a".repeat(64),
      fetchedAt: "2026-10-19T00:00:00.000Z",
    },
  ],
};

function fakeWriter(output: string | ((prompt: DraftPrompt) => string)): DraftWriter {
  return {
    id: "fake-writer",
    write: async (prompt) => (typeof output === "function" ? output(prompt) : output),
  };
}

const localProvider = { search: async () => localResults };
const webProvider = { collect: async () => bundle };

describe("buildEvidence", () => {
  it("assigns stable refIds and traceable locators", () => {
    const evidence = buildEvidence(localResults, bundle, 5);
    expect(evidence).toHaveLength(2);
    expect(evidence[0]).toMatchObject({
      refId: "L1",
      kind: "local",
      locator: localLocator("snap-1", 0),
    });
    expect(evidence[1]).toMatchObject({
      refId: "W1",
      kind: "web",
      locator: "https://example.com/budget",
    });
  });

  it("respects the web limit and tolerates a missing bundle", () => {
    expect(buildEvidence([], bundle, 0)).toHaveLength(0);
    expect(buildEvidence(localResults, undefined, 5)).toHaveLength(1);
  });
});

describe("DraftingService", () => {
  it("produces a schema-valid grounded draft with citations matching the evidence", async () => {
    const writer = fakeWriter((prompt) => {
      expect(prompt.language).toBe("zh-CN");
      expect(prompt.text).toContain("[L1]");
      expect(prompt.text).toContain("[W1]");
      expect(prompt.text).toContain("预算");
      return JSON.stringify({
        title: "预算情况说明",
        blocks: [
          { type: "heading", level: 1, text: "预算情况说明" },
          { type: "paragraph", text: "现将预算情况说明如下。" },
          { type: "citation", text: "第一季度预算 1200 万元", refId: "L1" },
          { type: "citation", text: "预算应当遵循公开透明原则", refId: "W1" },
        ],
      });
    });
    const service = new DraftingService(writer, localProvider, webProvider);
    const result = await service.draft({ topic: "预算", outline: ["总体情况", "下一步"] });

    expect(result.writerId).toBe("fake-writer");
    expect(result.warnings).toEqual([]);
    expect(() => officeDocumentSchema.parse(result.document)).not.toThrow();
    const citations = result.document.blocks.filter((block) => block.type === "citation");
    expect(citations).toHaveLength(2);
    expect(citations[0]!.source).toEqual({
      label: "预算表.xlsx",
      locator: localLocator("snap-1", 0),
      kind: "local",
    });
    expect(citations[1]!.source).toEqual({
      label: "预算管理办法",
      locator: "https://example.com/budget",
      kind: "web",
    });
    const locators = new Set(result.evidence.map((item) => item.locator));
    for (const citation of citations) {
      expect(locators.has(citation.source.locator)).toBe(true);
    }
  });

  it("rejects citations that point at fabricated locators", async () => {
    const writer = fakeWriter(
      JSON.stringify({
        title: "草稿",
        blocks: [
          { type: "citation", text: "真实引用", refId: "L1" },
          { type: "citation", text: "编造的引用", refId: "L99" },
        ],
      }),
    );
    const service = new DraftingService(writer, localProvider, webProvider);
    const result = await service.draft({ topic: "预算" });

    const citations = result.document.blocks.filter((block) => block.type === "citation");
    expect(citations).toHaveLength(1);
    expect(citations[0]!.source.locator).toBe(localLocator("snap-1", 0));
    expect(result.warnings.some((warning) => warning.includes("L99"))).toBe(true);
    expect(() => officeDocumentSchema.parse(result.document)).not.toThrow();
  });

  it("accepts fenced JSON output", async () => {
    const writer = fakeWriter(
      '说明如下:\n```json\n{"title":"草稿","blocks":[{"type":"paragraph","text":"正文"}]}\n```',
    );
    const service = new DraftingService(writer, localProvider, webProvider);
    const result = await service.draft({ topic: "预算" });
    expect(result.document.title).toBe("草稿");
    expect(result.warnings).toContain("草稿未包含任何有效引用块");
  });

  it("throws when the writer output is not parseable JSON", async () => {
    const service = new DraftingService(fakeWriter("这不是 JSON"), localProvider);
    await expect(service.draft({ topic: "预算" })).rejects.toThrow(DraftingError);
  });

  it("throws when the writer output violates the draft schema", async () => {
    const service = new DraftingService(
      fakeWriter(JSON.stringify({ title: "", blocks: [{ type: "paragraph" }] })),
      localProvider,
    );
    await expect(service.draft({ topic: "预算" })).rejects.toThrow(DraftingError);
  });

  it("works without any evidence providers", async () => {
    const writer = fakeWriter(
      JSON.stringify({
        title: "空证据草稿",
        blocks: [{ type: "paragraph", text: "没有证据时的正文。" }],
      }),
    );
    const service = new DraftingService(writer);
    const result = await service.draft({ topic: "预算" });
    expect(result.evidence).toEqual([]);
    expect(result.document.blocks).toHaveLength(1);
  });
});
