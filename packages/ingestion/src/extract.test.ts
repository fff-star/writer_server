import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { afterEach, describe, expect, it } from "vitest";
import { extractDocument } from "./extract.js";

const temporary: string[] = [];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "office-agent-extract-"));
  temporary.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("extractDocument", () => {
  it("extracts text lines and CSV cells", async () => {
    const root = await fixture();
    const text = join(root, "notes.txt");
    await writeFile(text, "第一季度预算\n异常项：差旅费");
    const textResult = await extractDocument(text, root);
    expect(textResult.status).toBe("indexed");
    expect(textResult.blocks[1]?.locator).toEqual({ kind: "line", line: 2 });

    const csv = join(root, "budget.csv");
    await writeFile(csv, "季度,金额\n第一季度,1200\n");
    const csvResult = await extractDocument(csv, root);
    expect(csvResult.status).toBe("indexed");
    expect(csvResult.blocks.at(-1)?.locator).toEqual({ kind: "cell", row: 2, cell: "B2" });
  });

  it("extracts XLSX cells and DOCX paragraph blocks", async () => {
    const root = await fixture();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("预算");
    sheet.getCell("A1").value = "季度";
    sheet.getCell("B2").value = 1200;
    const xlsx = join(root, "budget.xlsx");
    await workbook.xlsx.writeFile(xlsx);
    const xlsxResult = await extractDocument(xlsx, root);
    expect(xlsxResult.status).toBe("indexed");
    expect(xlsxResult.blocks.at(-1)?.locator).toMatchObject({
      kind: "cell",
      sheet: "预算",
      cell: "B2",
    });

    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>季度预算汇总</w:t></w:r></w:p></w:body></w:document>',
    );
    const docx = join(root, "report.docx");
    await writeFile(docx, await zip.generateAsync({ type: "nodebuffer" }));
    const docxResult = await extractDocument(docx, root);
    expect(docxResult.status).toBe("indexed");
    expect(docxResult.blocks[0]).toMatchObject({
      text: "季度预算汇总",
      locator: { kind: "block", block: "paragraph-1" },
    });
  });

  it("extracts PDF pages and marks images partial without a visual provider", async () => {
    const root = await fixture();
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([600, 400]);
    page.drawText("Quarterly budget 1200", { x: 50, y: 350, size: 18 });
    const pdfPath = join(root, "budget.pdf");
    await writeFile(pdfPath, await pdf.save());
    const pdfResult = await extractDocument(pdfPath, root);
    expect(pdfResult.status).toBe("indexed");
    expect(pdfResult.blocks[0]?.locator).toEqual({ kind: "page", page: 1 });
    expect(pdfResult.blocks[0]?.text).toContain("Quarterly");

    const image = join(root, "scan.png");
    await writeFile(image, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const imageResult = await extractDocument(image, root);
    expect(imageResult.status).toBe("partial");
    expect(imageResult.error).toContain("visual");
  });
});
