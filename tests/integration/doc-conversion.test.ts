import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { extractDocxText } from "../../packages/ingestion/src/docx.js";
import {
  convertLegacyDoc,
  convertWithLibreOffice,
} from "../../packages/ingestion/src/libreoffice.js";

let root: string | undefined;

afterEach(async () => {
  if (root) {
    await rm(root, { recursive: true, force: true });
    root = undefined;
  }
});

describe("legacy DOC conversion", () => {
  it("preserves the source and extracts text, tables, and PDF output", async () => {
    root = await mkdtemp(join(tmpdir(), "office-agent-doc-"));
    const html = join(root, "budget.html");
    await writeFile(
      html,
      "<!doctype html><meta charset='utf-8'><h1>季度预算汇总</h1><table><tr><th>季度</th><th>金额</th></tr><tr><td>第一季度</td><td>1200</td></tr></table>",
    );
    const legacy = await convertWithLibreOffice({
      input: html,
      outputDirectory: root,
      format: "doc",
      filter: "MS Word 97",
    });
    const legacyHash = createHash("sha256")
      .update(await readFile(legacy.outputPath))
      .digest("hex");

    const converted = await convertLegacyDoc(legacy.outputPath, root, "docx");
    const extracted = await extractDocxText(converted.outputPath);
    expect(extracted).toContain("季度预算汇总");
    expect(extracted).toContain("第一季度");
    expect(extracted).toContain("1200");
    expect(converted.originalSha256).toBe(legacyHash);

    const pdf = await convertLegacyDoc(legacy.outputPath, root, "pdf");
    const signature = await readFile(pdf.outputPath);
    expect(signature.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(pdf.originalSha256).toBe(legacyHash);
  }, 60_000);
});
