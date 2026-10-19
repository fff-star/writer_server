import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
});
