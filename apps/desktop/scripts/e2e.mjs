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
    const studioDocument = {
      schemaVersion: 1,
      title: "端到端验证文档",
      style: "standard",
      blocks: [{ type: "paragraph", id: "p1", text: "原始内容" }],
    };
    const createdVersion = await window.officeAgent.studio.createDocument(studioDocument);
    const appendedVersion = await window.officeAgent.studio.appendVersion(
      createdVersion.documentId,
      {
        ...studioDocument,
        blocks: [{ type: "paragraph", id: "p1", text: "人工修改" }],
      },
    );
    const agentRevision = await window.officeAgent.studio.appendAgentRevision(
      createdVersion.documentId,
      {
        ...studioDocument,
        blocks: [{ type: "paragraph", id: "p1", text: "代理修改" }],
      },
      createdVersion.id,
    );
    const conflicts = await window.officeAgent.studio.listConflicts(agentRevision.version.id);
    const studioDocuments = await window.officeAgent.studio.listDocuments();
    const draftOutcome = await window.officeAgent.studio.draft({ topic: "预算" });
    return {
      info,
      pdfBase64,
      librarySnapshots,
      budgetAnalysis,
      studio: {
        createdVersion,
        appendedVersion,
        agentRevision,
        conflicts,
        studioDocuments,
        draftOutcome,
      },
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

  const studio = result.studio;
  if (!studio.createdVersion.id || studio.appendedVersion.parentId !== studio.createdVersion.id) {
    throw new Error(`Studio version IPC failed: ${JSON.stringify(studio)}`);
  }
  if (!studio.agentRevision.conflicts.includes("p1") || !studio.conflicts.includes("p1")) {
    throw new Error(`Studio merge conflicts not recorded: ${JSON.stringify(studio)}`);
  }
  if (
    !Array.isArray(studio.studioDocuments) ||
    !studio.studioDocuments.some((entry) => entry.id === studio.createdVersion.documentId)
  ) {
    throw new Error("Studio document list IPC did not include the created document");
  }
  if (studio.draftOutcome.available !== false || typeof studio.draftOutcome.reason !== "string") {
    throw new Error(
      `Studio draft should report unavailable: ${JSON.stringify(studio.draftOutcome)}`,
    );
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
    `${JSON.stringify({ ok: true, isolation: true, pdf: true, pagedEditor: true, studio: true })}\n`,
  );
} finally {
  await application.close();
}
