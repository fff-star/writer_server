import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright";

const appDirectory = resolve(import.meta.dirname, "..");
const artifactsDir = resolve(import.meta.dirname, "../../../artifacts/e2e");
const executablePath = process.env["OFFICE_AGENT_EXECUTABLE"];
const application = await electron.launch({
  ...(executablePath ? { executablePath } : { args: [appDirectory] }),
  cwd: appDirectory,
  env: {
    ...process.env,
    NODE_ENV: "production",
  },
});

let page;
const consoleLines = [];
try {
  page = await application.firstWindow();
  page.on("console", (message) => consoleLines.push(`[${message.type()}] ${message.text()}`));
  page.on("pageerror", (error) => consoleLines.push(`[pageerror] ${error.message}`));
  await application.context().tracing.start({ screenshots: true, snapshots: true });
  await page.waitForSelector("h1");
  await page.click('[data-testid="new-project"]');
  await page.fill('[data-testid="project-name-input"]', "端到端验证项目");
  await page.click('[data-testid="project-create-submit"]');
  await page.waitForSelector('[data-testid="tab-editor"]');
  await page.click('[data-testid="tab-editor"]');
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

  await page.waitForSelector("text=编辑器已加载");
  const canvas = page.locator('[data-testid="paged-editor"] canvas').first();
  let typed = false;
  for (let attempt = 0; attempt < 3 && !typed; attempt += 1) {
    await canvas.click();
    await page.keyboard.insertText("人工修改");
    typed = await page
      .waitForFunction(
        () =>
          document
            .querySelector('[data-testid="document-text"]')
            ?.textContent?.includes("人工修改"),
        undefined,
        { timeout: 10_000 },
      )
      .then(() => true)
      .catch(() => false);
  }
  if (!typed) {
    throw new Error("Paged editor did not reflect typed text after 3 attempts");
  }

  process.stdout.write(
    `${JSON.stringify({ ok: true, isolation: true, pdf: true, pagedEditor: true, studio: true })}\n`,
  );
  await application.context().tracing.stop();
} catch (error) {
  await mkdir(artifactsDir, { recursive: true });
  if (page) {
    await page.screenshot({ path: join(artifactsDir, "failure.png") }).catch(() => {});
    await writeFile(join(artifactsDir, "failure.html"), await page.content()).catch(() => {});
  }
  await writeFile(join(artifactsDir, "renderer-console.log"), consoleLines.join("\n")).catch(
    () => {},
  );
  await application
    .context()
    .tracing.stop({ path: join(artifactsDir, "trace.zip") })
    .catch(() => {});
  console.error(`e2e failure artifacts written to ${artifactsDir}`);
  throw error;
} finally {
  await application.close();
}
