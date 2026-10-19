import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { afterEach, describe, expect, it } from "vitest";
import { extractDocument } from "./extract.js";
import type { OcrProvider, PdfPageRasterizer, VisualProvider } from "./providers.js";

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

  it("keeps the exact image stub when no providers are configured", async () => {
    const root = await fixture();
    const image = join(root, "scan.png");
    await writeFile(image, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const result = await extractDocument(image, root);
    expect(result).toEqual({
      status: "partial",
      blocks: [
        {
          kind: "image",
          text: ".png image requires OCR and visual analysis.",
          locator: { kind: "file" },
        },
      ],
      error: "OCR and visual providers are not configured",
    });
  });

  it("indexes image OCR text and visual caption when providers are configured", async () => {
    const root = await fixture();
    const image = join(root, "scan.png");
    await writeFile(image, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const requests: { languages?: string[] }[] = [];
    const ocr: OcrProvider = {
      id: "fake-ocr",
      recognize: async (request) => {
        requests.push(request);
        return { text: "第一季度预算 1200", confidence: 0.92, language: "chi_sim" };
      },
    };
    const visual: VisualProvider = {
      id: "fake-visual",
      describe: async () => ({ caption: "扫描的预算表格", tags: ["表格"] }),
    };
    const result = await extractDocument(image, root, undefined, {
      ocr,
      visual,
      ocrLanguages: ["chi_sim", "eng"],
    });
    expect(result.status).toBe("indexed");
    expect(result.error).toBeUndefined();
    expect(result.blocks).toEqual([
      { kind: "text", text: "第一季度预算 1200", locator: { kind: "file" } },
      { kind: "image", text: "扫描的预算表格", locator: { kind: "file" } },
    ]);
    expect(requests[0]?.languages).toEqual(["chi_sim", "eng"]);
  });

  it("marks the image partial with an explicit error when a provider fails", async () => {
    const root = await fixture();
    const image = join(root, "scan.png");
    await writeFile(image, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const ocr: OcrProvider = {
      id: "broken-ocr",
      recognize: async () => {
        throw new Error("HTTP 503");
      },
    };
    const result = await extractDocument(image, root, undefined, { ocr });
    expect(result.status).toBe("partial");
    expect(result.error).toContain('OCR provider "broken-ocr" failed: HTTP 503');
    expect(result.blocks[0]?.kind).toBe("image");
  });

  it("indexes a visual caption alone when only the visual provider is configured", async () => {
    const root = await fixture();
    const image = join(root, "photo.webp");
    await writeFile(image, Buffer.from([0x52, 0x49, 0x46, 0x46]));
    const visual: VisualProvider = {
      id: "fake-visual",
      describe: async (request) => {
        expect(request.image.mediaType).toBe("image/webp");
        return { caption: "办公室白板照片" };
      },
    };
    const result = await extractDocument(image, root, undefined, { visual });
    expect(result.status).toBe("indexed");
    expect(result.blocks).toEqual([
      { kind: "image", text: "办公室白板照片", locator: { kind: "file" } },
    ]);
  });

  it("OCRs a scanned PDF when a rasterizer and OCR provider are configured", async () => {
    const root = await fixture();
    const pdf = await PDFDocument.create();
    pdf.addPage([600, 400]);
    pdf.addPage([600, 400]);
    const pdfPath = join(root, "scanned.pdf");
    await writeFile(pdfPath, await pdf.save());
    const rasterizer: PdfPageRasterizer = {
      id: "fake-rasterizer",
      renderPages: async () => [
        { data: new Uint8Array([1]), mediaType: "image/png" },
        { data: new Uint8Array([2]), mediaType: "image/png" },
      ],
    };
    const ocr: OcrProvider = {
      id: "fake-ocr",
      recognize: async (request) => ({
        text: request.image.data[0] === 1 ? "第一页内容" : "第二页内容",
      }),
    };
    const result = await extractDocument(pdfPath, root, undefined, {
      ocr,
      pdfRasterizer: rasterizer,
    });
    expect(result.status).toBe("indexed");
    expect(result.blocks).toEqual([
      { kind: "text", text: "第一页内容", locator: { kind: "page", page: 1 } },
      { kind: "text", text: "第二页内容", locator: { kind: "page", page: 2 } },
    ]);
  });

  it("keeps the scanned PDF stub without a rasterizer", async () => {
    const root = await fixture();
    const pdf = await PDFDocument.create();
    pdf.addPage([600, 400]);
    const pdfPath = join(root, "scanned.pdf");
    await writeFile(pdfPath, await pdf.save());
    const ocr: OcrProvider = {
      id: "fake-ocr",
      recognize: async () => ({ text: "不应该调用" }),
    };
    const withoutProviders = await extractDocument(pdfPath, root);
    expect(withoutProviders).toEqual({
      status: "partial",
      blocks: [
        {
          kind: "metadata",
          text: "PDF contains no extractable text; OCR is required.",
          locator: { kind: "file" },
        },
      ],
      error: "OCR provider is not configured",
    });
    const withoutRasterizer = await extractDocument(pdfPath, root, undefined, { ocr });
    expect(withoutRasterizer.status).toBe("partial");
    expect(withoutRasterizer.error).toBe("OCR provider is not configured");
  });

  it("marks the scanned PDF partial when OCR fails on a rendered page", async () => {
    const root = await fixture();
    const pdf = await PDFDocument.create();
    pdf.addPage([600, 400]);
    const pdfPath = join(root, "scanned.pdf");
    await writeFile(pdfPath, await pdf.save());
    const rasterizer: PdfPageRasterizer = {
      id: "fake-rasterizer",
      renderPages: async () => [{ data: new Uint8Array([1]), mediaType: "image/png" }],
    };
    const ocr: OcrProvider = {
      id: "broken-ocr",
      recognize: async () => {
        throw new Error("timed out");
      },
    };
    const result = await extractDocument(pdfPath, root, undefined, {
      ocr,
      pdfRasterizer: rasterizer,
    });
    expect(result.status).toBe("partial");
    expect(result.error).toContain('OCR provider "broken-ocr" failed on page 1: timed out');
  });
});
