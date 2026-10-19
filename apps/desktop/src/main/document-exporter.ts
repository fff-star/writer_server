import { officeDocumentSchema, renderDocumentHtml } from "@office-agent/document";
import { BrowserWindow } from "electron";

export async function exportDocumentPdf(input: unknown): Promise<string> {
  const document = officeDocumentSchema.parse(input);
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
    const pdf = await window.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
    });
    return pdf.toString("base64");
  } finally {
    window.destroy();
  }
}
