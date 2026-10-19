import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";
import { extractDocument } from "../../packages/ingestion/src/extract.js";
import { LibraryStore } from "../../packages/library/src/store.js";

let root: string | undefined;

afterEach(async () => {
  if (root) {
    await rm(root, { recursive: true, force: true });
    root = undefined;
  }
});

describe("500-file managed library ingestion", () => {
  it("accounts for every synthetic source and records searchable locators", async () => {
    root = await mkdtemp(join(tmpdir(), "office-agent-library-500-"));
    const corpus = join(root, "corpus");
    await mkdir(corpus);
    const inputs: string[] = [];

    for (let index = 0; index < 490; index += 1) {
      const path = join(corpus, `document-${index.toString().padStart(3, "0")}.txt`);
      await writeFile(
        path,
        `预算专项-${index.toString().padStart(3, "0")}\n第一季度支出 ${1000 + index}`,
      );
      inputs.push(path);
    }
    for (let index = 0; index < 5; index += 1) {
      const path = join(corpus, `table-${index}.csv`);
      await writeFile(path, `季度,金额\n表格专项-${index},${2000 + index}\n`);
      inputs.push(path);
    }
    for (let index = 0; index < 5; index += 1) {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("预算");
      sheet.getCell("A1").value = "季度";
      sheet.getCell("B2").value = `工作簿专项-${index}`;
      const path = join(corpus, `workbook-${index}.xlsx`);
      await workbook.xlsx.writeFile(path);
      inputs.push(path);
    }

    const store = await LibraryStore.open(join(root, "library"));
    const started = performance.now();
    try {
      for (const input of inputs) {
        const imported = await store.importFile(input);
        const extraction = await extractDocument(
          imported.objectPath,
          root,
          imported.snapshot.extension,
        );
        store.recordBlocks(
          imported.snapshot.id,
          extraction.blocks,
          extraction.status,
          extraction.error,
        );
      }
      const durationMs = Math.round(performance.now() - started);
      const snapshots = store.listSnapshots();
      expect(snapshots).toHaveLength(500);
      expect(new Set(snapshots.map((snapshot) => snapshot.status))).toEqual(new Set(["indexed"]));

      const textResult = store.searchBlocks("预算专项-042");
      expect(textResult).toHaveLength(1);
      expect(textResult[0]?.locator).toEqual({ kind: "line", line: 1 });

      const csvResult = store.searchBlocks("表格专项-3");
      expect(csvResult).toHaveLength(1);
      expect(csvResult[0]?.locator).toMatchObject({ kind: "cell", cell: "A2" });

      const xlsxResult = store.searchBlocks("工作簿专项-4");
      expect(xlsxResult).toHaveLength(1);
      expect(xlsxResult[0]?.locator).toMatchObject({ kind: "cell", sheet: "预算", cell: "B2" });
      console.info(`Imported and indexed 500 files in ${durationMs}ms`);
      expect(durationMs).toBeLessThan(120_000);
    } finally {
      store.close();
    }
  }, 120_000);
});
