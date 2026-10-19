import { resolve } from "node:path";
import { _electron as electron } from "playwright";

const appDirectory = resolve(import.meta.dirname, "..");
const executablePath = process.env["OFFICE_AGENT_EXECUTABLE"];
const application = await electron.launch({
  ...(executablePath
    ? { executablePath, args: ["--disable-gpu"] }
    : { args: [appDirectory, "--disable-gpu"] }),
  cwd: appDirectory,
  env: {
    ...process.env,
    NODE_ENV: "production",
  },
});

try {
  const page = await application.firstWindow();
  await page.waitForSelector("h1");
  await page.waitForSelector('[data-testid="paged-editor"] canvas');
  const result = await page.evaluate(async () => {
    const info = await window.officeAgent.getAppInfo();
    const pdfBase64 = await window.officeAgent.exportDocumentPdf({
      schemaVersion: 1,
      title: "测试报告",
      style: "standard",
      blocks: [{ type: "paragraph", id: "p", text: "中文 PDF 导出验证" }],
    });
    const librarySnapshots = await window.officeAgent.library.list();
    const budgetAnalysis = await window.officeAgent.analysis.analyzeBudget("预算");
    return {
      info,
      pdfBase64,
      librarySnapshots,
      budgetAnalysis,
      requireType: typeof window.require,
      processType: typeof window.process,
      moduleType: typeof window.module,
    };
  });

  if (result.info.stage !== "foundation") {
    throw new Error(`Unexpected application stage: ${result.info.stage}`);
  }
  if (
    result.requireType !== "undefined" ||
    result.processType !== "undefined" ||
    result.moduleType !== "undefined"
  ) {
    throw new Error(`Renderer isolation failed: ${JSON.stringify(result)}`);
  }
  if (!result.pdfBase64.startsWith("JVBER")) {
    throw new Error("PDF export did not return a PDF document");
  }
  if (!Array.isArray(result.librarySnapshots)) {
    throw new Error("Library IPC did not return a snapshot list");
  }
  if (
    !Array.isArray(result.budgetAnalysis.budget.quarters) ||
    !Array.isArray(result.budgetAnalysis.subagents)
  ) {
    throw new Error("Budget analysis IPC returned an invalid evidence report");
  }

  const canvas = page.locator('[data-testid="paged-editor"] canvas').first();
  const bounds = await canvas.boundingBox();
  if (!bounds) {
    throw new Error("Paged editor canvas has no layout bounds");
  }
  await page.mouse.click(bounds.x + 100, bounds.y + 100);
  await page.keyboard.insertText("人工修改");
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="document-text"]')?.textContent?.includes("人工修改"),
  );

  process.stdout.write(
    `${JSON.stringify({ ok: true, isolation: true, pdf: true, pagedEditor: true })}\n`,
  );
} finally {
  await application.close();
}
