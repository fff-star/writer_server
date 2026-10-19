import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { exportDocx } from "./docx-export.js";
import type { OfficeDocument } from "./model.js";

describe("exportDocx", () => {
  it("exports Chinese content, tables, and citations from the canonical model", async () => {
    const document: OfficeDocument = {
      schemaVersion: 1,
      title: "季度报告",
      style: "standard",
      blocks: [
        { type: "heading", id: "title", level: 1, text: "季度预算汇总" },
        { type: "paragraph", id: "body", text: "人工修改保留在导出文档中。" },
        {
          type: "table",
          id: "budget",
          header: ["季度", "金额"],
          rows: [["第一季度", "1200"]],
        },
        {
          type: "citation",
          id: "source",
          text: "数据来源",
          source: { label: "预算表", locator: "Sheet1!B2", kind: "local" },
        },
      ],
    };
    const buffer = await exportDocx(document);
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file("word/document.xml")?.async("string");
    expect(xml).toContain("季度预算汇总");
    expect(xml).toContain("人工修改保留在导出文档中");
    expect(xml).toContain("第一季度");
    expect(xml).toContain("Sheet1!B2");
  });
});
