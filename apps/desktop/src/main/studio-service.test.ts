import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LibrarySearchResult } from "@office-agent/contracts";
import type { DraftWriter, LocalEvidenceProvider } from "@office-agent/document";
import { StudioService } from "./studio-service";

const baseDocument = {
  schemaVersion: 1,
  title: "测试文档",
  style: "standard",
  blocks: [{ type: "paragraph", id: "p1", text: "原始内容" }],
} as const;

let root: string | undefined;
let service: StudioService | undefined;

async function openService(
  overrides: Partial<{
    local: LocalEvidenceProvider;
    writer: DraftWriter | null;
  }> = {},
): Promise<StudioService> {
  root = await mkdtemp(join(tmpdir(), "office-agent-studio-test-"));
  service = await StudioService.open(root, {
    local: overrides.local ?? { search: () => Promise.resolve([]) },
    writer: overrides.writer ?? null,
  });
  return service;
}

afterEach(async () => {
  service?.close();
  service = undefined;
  if (root) {
    await rm(root, { recursive: true, force: true });
    root = undefined;
  }
});

describe("StudioService", () => {
  it("creates documents and appends validated human versions", async () => {
    const studio = await openService();
    const created = studio.createDocument(baseDocument);
    expect(studio.listDocuments().map((entry) => entry.id)).toEqual([created.documentId]);
    expect(studio.latestVersion(created.documentId)?.document.title).toBe("测试文档");

    const edited = {
      ...baseDocument,
      blocks: [{ type: "paragraph", id: "p1", text: "人工修改" }],
    };
    const appended = studio.appendVersion(created.documentId, edited);
    expect(appended.parentId).toBe(created.id);
    expect(appended.authorKind).toBe("human");
    expect(studio.listVersions(created.documentId)).toHaveLength(2);
    const stored = studio.getVersion(appended.id)?.document.blocks[0];
    expect(stored?.type === "paragraph" && stored.text).toBe("人工修改");
  });

  it("rejects invalid document payloads before storing", async () => {
    const studio = await openService();
    expect(() => studio.createDocument({ title: "" })).toThrow();
    const created = studio.createDocument(baseDocument);
    expect(() => studio.appendVersion(created.documentId, { schemaVersion: 2 })).toThrow();
    expect(studio.listVersions(created.documentId)).toHaveLength(1);
  });

  it("merges agent revisions and records block conflicts", async () => {
    const studio = await openService();
    const created = studio.createDocument(baseDocument);
    studio.appendVersion(created.documentId, {
      ...baseDocument,
      blocks: [{ type: "paragraph", id: "p1", text: "人工修改" }],
    });
    const revision = studio.appendAgentRevision(
      created.documentId,
      { ...baseDocument, blocks: [{ type: "paragraph", id: "p1", text: "代理修改" }] },
      created.id,
    );
    expect(revision.version.authorKind).toBe("agent");
    expect(revision.conflicts).toEqual(["p1"]);
    expect(studio.listConflicts(revision.version.id)).toEqual(["p1"]);
    const mergedBlock = revision.version.document.blocks[0];
    expect(mergedBlock?.type === "paragraph" && mergedBlock.text).toBe("人工修改");
  });

  it("reports drafting as unavailable when no writer is configured", async () => {
    const studio = await openService();
    const outcome = await studio.draft({ topic: "预算执行情况" });
    expect(outcome.available).toBe(false);
    if (!outcome.available) {
      expect(outcome.reason).toContain("not configured");
    }
  });

  it("validates draft requests", async () => {
    const studio = await openService({ writer: { id: "stub", write: () => Promise.resolve("") } });
    await expect(studio.draft({ topic: "" })).rejects.toThrow();
    await expect(studio.draft("预算")).rejects.toThrow();
    await expect(studio.draft({ topic: "预算", localLimit: 0 })).rejects.toThrow();
  });

  it("drafts with an injected writer and local evidence", async () => {
    const hits: LibrarySearchResult[] = [
      {
        snapshotId: "snap-1",
        snapshotName: "预算表.xlsx",
        blockIndex: 3,
        kind: "table-cell",
        text: "第一季度支出 1200",
        locator: { kind: "cell", cell: "B2" },
        score: 1,
      },
    ];
    const writer: DraftWriter = {
      id: "stub-writer",
      write: () =>
        Promise.resolve(
          JSON.stringify({
            title: "预算简报",
            blocks: [
              { type: "paragraph", text: "第一季度支出为 1200 元。" },
              { type: "citation", text: "第一季度支出 1200", refId: "L1" },
            ],
          }),
        ),
    };
    const studio = await openService({
      writer,
      local: { search: () => Promise.resolve(hits) },
    });
    const outcome = await studio.draft({ topic: "预算" });
    expect(outcome.available).toBe(true);
    if (outcome.available) {
      expect(outcome.result.writerId).toBe("stub-writer");
      expect(outcome.result.document.title).toBe("预算简报");
      const citation = outcome.result.document.blocks.find((block) => block.type === "citation");
      expect(citation?.type === "citation" && citation.source.label).toBe("预算表.xlsx");
      expect(citation?.type === "citation" && citation.source.locator).toBe("local:snap-1:3");
    }
  });

  it("resolves export payloads from a document id or an inline document", async () => {
    const studio = await openService();
    const created = studio.createDocument(baseDocument);
    expect(studio.resolveDocument({ documentId: created.documentId }).title).toBe("测试文档");
    expect(studio.resolveDocument({ document: baseDocument }).title).toBe("测试文档");
    expect(() => studio.resolveDocument({ documentId: "missing" })).toThrow();
    expect(() => studio.resolveDocument({})).toThrow();
    expect(() => studio.resolveDocument({ document: { title: "" } })).toThrow();
  });

  it("creates, lists, and renames projects with validation", async () => {
    const studio = await openService();
    expect(() => studio.createProject({ name: "" })).toThrow();
    expect(() => studio.createProject("项目")).toThrow();
    const project = studio.createProject({ name: "季度报告" });
    expect(studio.listProjects().map((entry) => entry.id)).toEqual([project.id]);
    expect(studio.renameProject(project.id, { name: "年度报告" }).name).toBe("年度报告");
    expect(() => studio.renameProject("missing", { name: "x" })).toThrow();
  });

  it("binds documents to projects and keeps the default-project fallback", async () => {
    const studio = await openService();
    const project = studio.createProject({ name: "项目甲" });
    const bound = studio.createDocument(baseDocument, project.id);
    const unbound = studio.createDocument(baseDocument);

    expect(studio.listDocuments(project.id).map((entry) => entry.id)).toEqual([bound.documentId]);
    expect(studio.listDocuments()).toHaveLength(2);
    const fallbackId = studio
      .listDocuments()
      .find((entry) => entry.id === unbound.documentId)?.projectId;
    expect(studio.listProjects().some((entry) => entry.id === fallbackId)).toBe(true);

    expect(() => studio.createDocument(baseDocument, "missing")).toThrow();
    expect(() => studio.appendVersion(bound.documentId, baseDocument, project.id)).not.toThrow();
    expect(() =>
      studio.appendVersion(bound.documentId, baseDocument, unbound.documentId),
    ).toThrow();
  });

  it("appends and lists conversation messages with validation", async () => {
    const studio = await openService();
    const project = studio.createProject({ name: "项目甲" });
    expect(() => studio.appendMessage(project.id, { role: "system", text: "x" })).toThrow();
    expect(() => studio.appendMessage(project.id, { role: "user", text: "" })).toThrow();
    expect(() => studio.appendMessage("missing", { role: "user", text: "x" })).toThrow();

    studio.appendMessage(project.id, { role: "user", text: "汇总预算" });
    studio.appendMessage(project.id, {
      role: "agent",
      text: "识别到 1 个季度预算。",
      payload: { rows: [{ title: "Q1", detail: "100" }] },
    });
    const messages = studio.listMessages(project.id);
    expect(messages.map((entry) => entry.role)).toEqual(["user", "agent"]);
    expect(messages[1]?.payload).toEqual({ rows: [{ title: "Q1", detail: "100" }] });
  });
});
