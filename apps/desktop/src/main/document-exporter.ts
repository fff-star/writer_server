import { writeFile } from "node:fs/promises";
import {
  exportDocx,
  officeDocumentSchema,
  renderDocumentHtml,
  type OfficeDocument,
} from "@office-agent/document";
import { BrowserWindow, dialog, type FileFilter } from "electron";

export type ExportSaveResult =
  { saved: true; path: string } | { saved: false; reason: "cancelled" };

async function renderPdfBuffer(document: OfficeDocument): Promise<Buffer> {
  const html = renderDocumentHtml(document);
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  try {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return await window.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    window.destroy();
  }
}

async function saveWithDialog(
  window: BrowserWindow,
  defaultPath: string,
  filters: FileFilter[],
  contents: Buffer,
): Promise<ExportSaveResult> {
  const result = await dialog.showSaveDialog(window, {
    title: "导出文档",
    defaultPath,
    filters,
  });
  if (result.canceled || !result.filePath) {
    return { saved: false, reason: "cancelled" };
  }
  await writeFile(result.filePath, contents);
  return { saved: true, path: result.filePath };
}

export async function exportDocumentPdf(input: unknown): Promise<string> {
  const pdf = await renderPdfBuffer(officeDocumentSchema.parse(input));
  return pdf.toString("base64");
}

export async function exportDocumentPdfToFile(
  window: BrowserWindow,
  input: unknown,
): Promise<ExportSaveResult> {
  const document = officeDocumentSchema.parse(input);
  const pdf = await renderPdfBuffer(document);
  return saveWithDialog(
    window,
    `${document.title}.pdf`,
    [{ name: "PDF 文档", extensions: ["pdf"] }],
    pdf,
  );
}

export async function exportDocumentDocx(
  window: BrowserWindow,
  input: unknown,
): Promise<ExportSaveResult> {
  const document = officeDocumentSchema.parse(input);
  const docx = await exportDocx(document);
  return saveWithDialog(
    window,
    `${document.title}.docx`,
    [{ name: "Word 文档", extensions: ["docx"] }],
    docx,
  );
}
