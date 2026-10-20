import { describe, expect, it } from "vitest";
import type { IElement } from "@hufe921/canvas-editor";
import type { DocumentBlock, OfficeDocument } from "@office-agent/document";
import { blocksToElements, elementsToBlocks, type BlockExtension } from "./document-elements";

function documentWith(blocks: DocumentBlock[]): OfficeDocument {
  return { schemaVersion: 1, title: "测试文档", style: "standard", blocks };
}

function roundTrip(document: OfficeDocument): DocumentBlock[] {
  return elementsToBlocks(blocksToElements(document), document);
}

const citationBlock: DocumentBlock = {
  type: "citation",
  id: "cite1",
  text: "尽调报告指出现金流稳定。",
  source: { label: "2024 年报", locator: "local:snapshot-1:3", kind: "local" },
};

describe("blocksToElements / elementsToBlocks", () => {
  it("round-trips heading levels 1-3", () => {
    const document = documentWith([
      { type: "heading", id: "h1", level: 1, text: "一级标题" },
      { type: "heading", id: "h2", level: 2, text: "二级标题" },
      { type: "heading", id: "h3", level: 3, text: "三级标题" },
    ]);
    expect(roundTrip(document)).toEqual(document.blocks);
  });

  it("round-trips a single-line paragraph", () => {
    const document = documentWith([{ type: "paragraph", id: "p1", text: "这是一个段落。" }]);
    expect(roundTrip(document)).toEqual(document.blocks);
  });

  it("round-trips a multi-line paragraph", () => {
    const document = documentWith([
      { type: "paragraph", id: "p1", text: "第一行\n第二行\n\n第四行" },
    ]);
    expect(roundTrip(document)).toEqual(document.blocks);
  });

  it("round-trips unordered and ordered lists", () => {
    const document = documentWith([
      { type: "list", id: "l1", ordered: false, items: ["苹果", "香蕉"] },
      { type: "list", id: "l2", ordered: true, items: ["第一步", "第二步", "第三步"] },
    ]);
    expect(roundTrip(document)).toEqual(document.blocks);
  });

  it("round-trips a list with empty and multi-line items", () => {
    const document = documentWith([
      { type: "list", id: "l1", ordered: false, items: ["", "跨行\n续行"] },
    ]);
    expect(roundTrip(document)).toEqual(document.blocks);
  });

  it("round-trips a table with header and rows", () => {
    const document = documentWith([
      {
        type: "table",
        id: "t1",
        header: ["季度", "收入"],
        rows: [
          ["Q1", "100"],
          ["Q2", "200"],
        ],
      },
    ]);
    expect(roundTrip(document)).toEqual(document.blocks);
  });

  it("round-trips ragged and header-less tables without padding leakage", () => {
    const document = documentWith([
      {
        type: "table",
        id: "t1",
        header: ["名称"],
        rows: [["甲", "额外列"], ["乙"]],
      },
      {
        type: "table",
        id: "t2",
        header: [],
        rows: [["仅数据", "行"]],
      },
    ]);
    expect(roundTrip(document)).toEqual(document.blocks);
  });

  it("round-trips a citation with its locator intact", () => {
    const document = documentWith([citationBlock]);
    expect(roundTrip(document)).toEqual(document.blocks);
  });

  it("keeps the citation source when the user edits the citation text", () => {
    const document = documentWith([citationBlock]);
    const elements = blocksToElements(document);
    const edited = elements.map((element) =>
      element.value === citationBlock.text ? { ...element, value: "改写后的引文。" } : element,
    );
    const blocks = elementsToBlocks(edited, document);
    expect(blocks).toEqual([{ ...citationBlock, text: "改写后的引文。" } satisfies DocumentBlock]);
  });

  it("restores a citation whose extension markers were destroyed but text survived", () => {
    const document = documentWith([{ type: "paragraph", id: "p1", text: "前文。" }, citationBlock]);
    // Simulate a getValue() stream where the citation paragraph lost all of
    // its extension metadata (e.g. the user retyped the line character by
    // character) while the text stayed identical.
    const flattened: IElement[] = [
      { value: "前文。", extension: { block: "p1", kind: "paragraph" } },
      { value: "\n" },
      { value: citationBlock.text },
    ];
    const blocks = elementsToBlocks(flattened, document);
    expect(blocks).toEqual(document.blocks);
  });

  it("returns an empty block list for an empty document", () => {
    const document = documentWith([]);
    expect(roundTrip(document)).toEqual([]);
  });

  it("round-trips a mixed document end to end", () => {
    const document = documentWith([
      { type: "heading", id: "h1", level: 1, text: "季度预算汇总" },
      { type: "paragraph", id: "p1", text: "本页用于验证中文分页编辑。" },
      { type: "list", id: "l1", ordered: true, items: ["收入", "支出"] },
      {
        type: "table",
        id: "t1",
        header: ["季度", "收入"],
        rows: [["Q1", "100"]],
      },
      citationBlock,
      { type: "paragraph", id: "p2", text: "结尾段落。" },
    ]);
    expect(roundTrip(document)).toEqual(document.blocks);
  });

  it("preserves blocks that have no canvas representation", () => {
    const document = documentWith([
      { type: "paragraph", id: "p1", text: "可见段落。" },
      { type: "list", id: "l1", ordered: false, items: [] },
      { type: "table", id: "t1", header: [], rows: [] },
    ]);
    expect(roundTrip(document)).toEqual(document.blocks);
  });

  it("assigns fresh ids to content the editor created without metadata", () => {
    const document = documentWith([{ type: "paragraph", id: "p1", text: "原有段落。" }]);
    const flattened: IElement[] = [
      { value: "原有段落。", extension: { block: "p1", kind: "paragraph" } },
      { value: "\n" },
      { value: "用户新输入的一行。" },
    ];
    const blocks = elementsToBlocks(flattened, document);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ type: "paragraph", id: "p1", text: "原有段落。" });
    const inserted = blocks[1];
    expect(inserted?.type).toBe("paragraph");
    expect(inserted && "text" in inserted && inserted.text).toBe("用户新输入的一行。");
    expect(inserted?.id).toBeTruthy();
    expect(inserted?.id).not.toBe("p1");
  });

  it("recovers block identity from a zipped title container without extension", () => {
    const document = documentWith([{ type: "heading", id: "h1", level: 2, text: "标题" }]);
    // Simulate getValue() output: the title container is rebuilt without
    // extension, but the child text element keeps it.
    const extension: BlockExtension = { block: "h1", kind: "heading" };
    const zipped: IElement[] = [
      {
        type: "title" as NonNullable<IElement["type"]>,
        value: "",
        level: "second" as NonNullable<IElement["level"]>,
        titleId: "h1",
        valueList: [{ value: "标题", extension }],
      },
    ];
    expect(elementsToBlocks(zipped, document)).toEqual(document.blocks);
  });

  it("keeps list identity from listId when extension is lost on new items", () => {
    const document = documentWith([{ type: "list", id: "l1", ordered: true, items: ["第一项"] }]);
    // Simulate the editor adding an item: the new marker inherits the listId
    // but no extension.
    const extension: BlockExtension = { block: "l1", kind: "list" };
    const zipped: IElement[] = [
      {
        type: "list" as NonNullable<IElement["type"]>,
        value: "",
        listType: "ol" as NonNullable<IElement["listType"]>,
        listStyle: "decimal" as NonNullable<IElement["listStyle"]>,
        listId: "l1",
        valueList: [
          { value: "\n第一项", extension, listId: "l1" },
          { value: "\n第二项", listId: "l1" },
        ],
      },
    ];
    const blocks = elementsToBlocks(zipped, document);
    expect(blocks).toEqual([
      {
        type: "list",
        id: "l1",
        ordered: true,
        items: ["第一项", "第二项"],
      } satisfies DocumentBlock,
    ]);
  });

  it("degrades a citation to a paragraph only when the locator is unrecoverable", () => {
    const document = documentWith([citationBlock]);
    const flattened: IElement[] = [{ value: "完全不同的文字。" }];
    const blocks = elementsToBlocks(flattened, document);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "paragraph", text: "完全不同的文字。" });
  });
});
