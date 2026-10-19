import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import type { ExtractedBlock, ExtractionStatus } from "@office-agent/contracts";
import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { convertLegacyDoc } from "./libreoffice.js";
import type { OcrProvider, PdfPageRasterizer, ProviderImage, VisualProvider } from "./providers.js";

export type ExtractionResult = {
  status: Exclude<ExtractionStatus, "imported" | "processing">;
  blocks: ExtractedBlock[];
  error?: string;
};

export type ExtractionOptions = {
  ocr?: OcrProvider;
  visual?: VisualProvider;
  pdfRasterizer?: PdfPageRasterizer;
  ocrLanguages?: string[];
};

const imageMediaTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
};

function decodeXml(value: string): string {
  return value.replace(/&(#x?\d+|amp|lt|gt|quot|apos);/g, (entity) => {
    const entities: Record<string, string> = {
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": '"',
      "&apos;": "'",
      "&#39;": "'",
      "&#34;": '"',
    };
    return entities[entity] ?? entity;
  });
}

function columnName(index: number): string {
  let value = index;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function textBlocks(content: string, extension: string): ExtractedBlock[] {
  return content
    .split(/\r?\n/)
    .map((text, index) => ({ text: text.trim(), line: index + 1 }))
    .filter((item) => item.text.length > 0)
    .map((item) => ({
      kind: extension === ".md" ? ("paragraph" as const) : ("text" as const),
      text: item.text,
      locator: { kind: "line" as const, line: item.line },
    }));
}

async function extractDocxBlocks(path: string): Promise<ExtractedBlock[]> {
  const { readFile: read } = await import("node:fs/promises");
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await read(path));
  const document = zip.file("word/document.xml");
  if (!document) {
    throw new Error(`DOCX document body is missing: ${path}`);
  }
  const xml = await document.async("string");
  const paragraphs = [...xml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)];
  return paragraphs
    .map((paragraph, index) => {
      const text = [...paragraph[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
        .map((match) => decodeXml(match[1] ?? ""))
        .join("")
        .trim();
      return { text, index: index + 1 };
    })
    .filter((item) => item.text.length > 0)
    .map((item) => ({
      kind: "paragraph" as const,
      text: item.text,
      locator: { kind: "block" as const, block: `paragraph-${item.index}` },
    }));
}

async function extractCsvBlocks(path: string): Promise<ExtractedBlock[]> {
  const records = parse(await readFile(path, "utf8"), {
    relax_column_count: true,
    skip_empty_lines: true,
  }) as string[][];
  const blocks: ExtractedBlock[] = [];
  records.forEach((record, rowIndex) => {
    record.forEach((value, columnIndex) => {
      const text = String(value).trim();
      if (text) {
        blocks.push({
          kind: "table-cell",
          text,
          locator: {
            kind: "cell",
            row: rowIndex + 1,
            cell: `${columnName(columnIndex + 1)}${rowIndex + 1}`,
          },
        });
      }
    });
  });
  return blocks;
}

async function extractXlsxBlocks(path: string): Promise<ExtractedBlock[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const blocks: ExtractedBlock[] = [];
  workbook.eachSheet((sheet) => {
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const text = cell.text.trim();
        if (text) {
          blocks.push({
            kind: "table-cell",
            text,
            locator: {
              kind: "cell",
              sheet: sheet.name,
              row: rowNumber,
              cell: cell.address,
            },
          });
        }
      });
    });
  });
  return blocks;
}

async function extractPdfBlocks(path: string): Promise<ExtractedBlock[]> {
  const data = new Uint8Array(await readFile(path));
  const task = getDocument({
    data,
    useWorkerFetch: false,
    disableFontFace: true,
  });
  const pdf = await task.promise;
  try {
    const blocks: ExtractedBlock[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) {
        blocks.push({
          kind: "text",
          text,
          locator: { kind: "page", page: pageNumber },
        });
      }
    }
    return blocks;
  } finally {
    await task.destroy();
  }
}

async function extractImageBlocks(
  image: ProviderImage,
  extension: string,
  options: ExtractionOptions,
): Promise<ExtractionResult> {
  const stubBlock: ExtractedBlock = {
    kind: "image",
    text: `${extension} image requires OCR and visual analysis.`,
    locator: { kind: "file" },
  };
  if (!options.ocr && !options.visual) {
    return {
      status: "partial",
      blocks: [stubBlock],
      error: "OCR and visual providers are not configured",
    };
  }
  const blocks: ExtractedBlock[] = [];
  const failures: string[] = [];
  if (options.ocr) {
    try {
      const result = await options.ocr.recognize({
        image,
        ...(options.ocrLanguages ? { languages: options.ocrLanguages } : {}),
      });
      if (result.text.trim()) {
        blocks.push({ kind: "text", text: result.text.trim(), locator: { kind: "file" } });
      }
    } catch (error) {
      failures.push(
        `OCR provider "${options.ocr.id}" failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (options.visual) {
    try {
      const result = await options.visual.describe({ image });
      if (result.caption.trim()) {
        blocks.push({ kind: "image", text: result.caption.trim(), locator: { kind: "file" } });
      }
    } catch (error) {
      failures.push(
        `Visual provider "${options.visual.id}" failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (blocks.length === 0) {
    return {
      status: "partial",
      blocks: [stubBlock],
      error:
        failures.length > 0 ? failures.join("; ") : "OCR and visual providers returned no content",
    };
  }
  return {
    status: failures.length > 0 ? "partial" : "indexed",
    blocks,
    ...(failures.length > 0 ? { error: failures.join("; ") } : {}),
  };
}

async function extractScannedPdfBlocks(
  path: string,
  options: ExtractionOptions,
): Promise<ExtractionResult> {
  const stubBlock: ExtractedBlock = {
    kind: "metadata",
    text: "PDF contains no extractable text; OCR is required.",
    locator: { kind: "file" },
  };
  if (!options.ocr || !options.pdfRasterizer) {
    return {
      status: "partial",
      blocks: [stubBlock],
      error: "OCR provider is not configured",
    };
  }
  let pages: ProviderImage[];
  try {
    pages = await options.pdfRasterizer.renderPages(path);
  } catch (error) {
    return {
      status: "partial",
      blocks: [stubBlock],
      error: `PDF rasterizer "${options.pdfRasterizer.id}" failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const blocks: ExtractedBlock[] = [];
  for (const [index, page] of pages.entries()) {
    let result;
    try {
      result = await options.ocr.recognize({
        image: page,
        ...(options.ocrLanguages ? { languages: options.ocrLanguages } : {}),
      });
    } catch (error) {
      return {
        status: "partial",
        blocks: [stubBlock],
        error: `OCR provider "${options.ocr.id}" failed on page ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    const text = result.text.trim();
    if (text) {
      blocks.push({ kind: "text", text, locator: { kind: "page", page: index + 1 } });
    }
  }
  if (blocks.length === 0) {
    return {
      status: "partial",
      blocks: [stubBlock],
      error: `OCR provider "${options.ocr.id}" returned no text for ${pages.length} rendered page(s)`,
    };
  }
  return { status: "indexed", blocks };
}

export async function extractDocument(
  path: string,
  temporaryDirectory: string,
  extensionOverride?: string,
  options: ExtractionOptions = {},
): Promise<ExtractionResult> {
  const extension = (extensionOverride ?? extname(path)).toLowerCase();
  try {
    switch (extension) {
      case ".txt":
      case ".md": {
        const blocks = textBlocks(await readFile(path, "utf8"), extension);
        return { status: "indexed", blocks };
      }
      case ".csv": {
        return { status: "indexed", blocks: await extractCsvBlocks(path) };
      }
      case ".xlsx": {
        return { status: "indexed", blocks: await extractXlsxBlocks(path) };
      }
      case ".docx": {
        return { status: "indexed", blocks: await extractDocxBlocks(path) };
      }
      case ".doc": {
        const converted = await convertLegacyDoc(path, temporaryDirectory, "docx");
        return { status: "indexed", blocks: await extractDocxBlocks(converted.outputPath) };
      }
      case ".pdf": {
        const blocks = await extractPdfBlocks(path);
        if (blocks.length === 0) {
          return await extractScannedPdfBlocks(path, options);
        }
        return { status: "indexed", blocks };
      }
      case ".jpg":
      case ".jpeg":
      case ".png":
      case ".webp":
      case ".bmp":
      case ".tif":
      case ".tiff": {
        const image: ProviderImage = {
          data: new Uint8Array(await readFile(path)),
          mediaType: imageMediaTypes[extension] ?? "application/octet-stream",
          fileName: basename(path),
        };
        return await extractImageBlocks(image, extension, options);
      }
      default:
        return { status: "failed", blocks: [], error: `Unsupported extension: ${extension}` };
    }
  } catch (error) {
    return {
      status: "failed",
      blocks: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
