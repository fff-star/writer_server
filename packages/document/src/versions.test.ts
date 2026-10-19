import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { DocumentVersionStore } from "./versions.js";
import type { OfficeDocument } from "./model.js";

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function openStore() {
  const root = await mkdtemp(join(tmpdir(), "office-agent-versions-"));
  temporary.push(root);
  const store = await DocumentVersionStore.open(root);
  return { root, store };
}

function document(text: string, title = "草稿"): OfficeDocument {
  return {
    schemaVersion: 1,
    title,
    style: "standard",
    blocks: [
      { type: "heading", id: "title", level: 1, text: title },
      { type: "paragraph", id: "summary", text },
    ],
  };
}

describe("DocumentVersionStore", () => {
  it("links versions into an ordered chain with authors and parents", async () => {
    const { store } = await openStore();
    const first = store.createDocument(document("初稿"));
    const second = store.appendVersion(first.documentId, document("修改稿", "修改稿"), "human");

    expect(first.parentId).toBeNull();
    expect(first.authorKind).toBe("human");
    expect(second.parentId).toBe(first.id);

    const versions = store.listVersions(first.documentId);
    expect(versions.map((version) => version.id)).toEqual([first.id, second.id]);
    expect(store.latestVersion(first.documentId)?.id).toBe(second.id);
    expect(store.getVersion(first.id)?.document.blocks[1]).toMatchObject({ text: "初稿" });
    expect(store.listDocuments()[0]?.title).toBe("修改稿");
    store.close();
  });

  it("preserves manual edits across an agent revision and records conflicts", async () => {
    const { store } = await openStore();
    const base = store.createDocument(document("原始内容"));
    const manual = store.appendVersion(base.documentId, document("人工修改"), "human");

    const agentDraft = document("代理修改");
    agentDraft.blocks.push({
      type: "citation",
      id: "cite-1",
      text: "第一季度预算 1200 万元",
      source: { label: "预算表.xlsx", locator: "local:snap-1:0", kind: "local" },
    });
    const result = store.appendAgentRevision(base.documentId, agentDraft, base.id);

    expect(result.conflicts).toEqual(["summary"]);
    expect(store.getConflicts(result.version.id)).toEqual(["summary"]);
    expect(result.version.authorKind).toBe("agent");
    expect(result.version.parentId).toBe(manual.id);

    const merged = result.version.document;
    expect(merged.blocks.find((block) => block.id === "summary")).toMatchObject({
      text: "人工修改",
    });
    expect(merged.blocks.find((block) => block.id === "cite-1")).toMatchObject({
      type: "citation",
    });
    store.close();
  });

  it("persists versions across reopening the store", async () => {
    const { root, store } = await openStore();
    const first = store.createDocument(document("初稿"));
    store.appendVersion(first.documentId, document("修改稿"), "human");
    store.close();

    const reopened = await DocumentVersionStore.open(root);
    const versions = reopened.listVersions(first.documentId);
    expect(versions).toHaveLength(2);
    expect(versions[1]?.parentId).toBe(first.id);
    expect(reopened.latestVersion(first.documentId)?.document.blocks[1]).toMatchObject({
      text: "修改稿",
    });
    reopened.close();
  });

  it("rejects documents that violate the schema", async () => {
    const { store } = await openStore();
    const invalid = { schemaVersion: 1, title: "", style: "standard", blocks: [] };
    expect(() => store.createDocument(invalid as OfficeDocument)).toThrow();
    store.close();
  });

  it("fails when appending to an unknown document or a foreign base version", async () => {
    const { store } = await openStore();
    const first = store.createDocument(document("甲"));
    const second = store.createDocument(document("乙"));

    expect(() => store.appendVersion("missing", document("x"))).toThrow();
    expect(() => store.appendAgentRevision(first.documentId, document("x"), second.id)).toThrow();
    store.close();
  });

  it("migrates an old database without project_id into the default project", async () => {
    const root = await mkdtemp(join(tmpdir(), "office-agent-versions-"));
    temporary.push(root);
    const database = new DatabaseSync(join(root, "versions.db"));
    database.exec(`
      CREATE TABLE documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE versions (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        parent_id TEXT REFERENCES versions(id),
        author_kind TEXT NOT NULL CHECK (author_kind IN ('human', 'agent')),
        created_at TEXT NOT NULL,
        document_json TEXT NOT NULL
      );
      CREATE TABLE conflicts (
        version_id TEXT NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
        block_id TEXT NOT NULL,
        PRIMARY KEY (version_id, block_id)
      );
      INSERT INTO documents (id, title, created_at) VALUES ('doc-1', '旧文档', '2024-01-01T00:00:00.000Z');
    `);
    database
      .prepare(
        `INSERT INTO versions (id, document_id, parent_id, author_kind, created_at, document_json)
         VALUES ('v-1', 'doc-1', NULL, 'human', '2024-01-01T00:00:00.000Z', ?)`,
      )
      .run(JSON.stringify(document("旧内容", "旧文档")));
    database.close();

    const store = await DocumentVersionStore.open(root);
    const fallback = store.listProjects().find((project) => project.name === "未归档");
    expect(fallback).toBeDefined();
    const documents = store.listDocuments();
    expect(documents).toHaveLength(1);
    expect(documents[0]?.projectId).toBe(fallback?.id);
    expect(store.listDocuments(fallback?.id)).toHaveLength(1);
    expect(store.latestVersion("doc-1")?.document.blocks[1]).toMatchObject({ text: "旧内容" });
    store.close();
  });

  it("scopes documents to projects and falls back to the default project", async () => {
    const { store } = await openStore();
    const alpha = store.createProject("项目甲");
    const beta = store.createProject("项目乙");

    const inAlpha = store.createDocument(document("甲稿"), "human", alpha.id);
    const inBeta = store.createDocument(document("乙稿"), "human", beta.id);
    const unassigned = store.createDocument(document("散稿"));

    expect(store.listDocuments(alpha.id).map((entry) => entry.id)).toEqual([inAlpha.documentId]);
    expect(store.listDocuments(beta.id).map((entry) => entry.id)).toEqual([inBeta.documentId]);
    expect(store.listDocuments()).toHaveLength(3);

    const fallbackId = unassigned.documentId
      ? (store.listDocuments().find((entry) => entry.id === unassigned.documentId)?.projectId ?? "")
      : "";
    expect(store.getProject(fallbackId)?.name).toBe("未归档");

    expect(() => store.createDocument(document("x"), "human", "missing")).toThrow();
    expect(() =>
      store.appendVersion(inAlpha.documentId, document("x"), "human", beta.id),
    ).toThrow();
    expect(
      store.appendVersion(inAlpha.documentId, document("甲改"), "human", alpha.id).document
        .blocks[1],
    ).toMatchObject({ text: "甲改" });
    store.close();
  });

  it("renames projects and rejects unknown projects", async () => {
    const { store } = await openStore();
    const project = store.createProject("旧名");
    expect(store.renameProject(project.id, "新名").name).toBe("新名");
    expect(store.getProject(project.id)?.name).toBe("新名");
    expect(() => store.renameProject("missing", "x")).toThrow();
    store.close();
  });

  it("persists conversation messages in order per project", async () => {
    const { root, store } = await openStore();
    const alpha = store.createProject("项目甲");
    const beta = store.createProject("项目乙");

    store.appendMessage(alpha.id, "user", "汇总预算");
    store.appendMessage(alpha.id, "agent", "识别到 2 个季度预算。", {
      citations: [{ label: "来源", locator: "local:snap:0" }],
    });
    store.appendMessage(beta.id, "user", "你好");
    expect(() => store.appendMessage("missing", "user", "x")).toThrow();
    store.close();

    const reopened = await DocumentVersionStore.open(root);
    const messages = reopened.listMessages(alpha.id);
    expect(messages.map((message) => message.role)).toEqual(["user", "agent"]);
    expect(messages[1]?.payload).toEqual({
      citations: [{ label: "来源", locator: "local:snap:0" }],
    });
    expect(reopened.listMessages(beta.id).map((message) => message.text)).toEqual(["你好"]);
    reopened.close();
  });
});
