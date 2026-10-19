import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LibraryStore } from "./store.js";

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "office-agent-library-"));
  temporary.push(root);
  const input = join(root, "budget.txt");
  await mkdir(join(root, "library"));
  await writeFile(input, "第一季度预算 1200");
  const store = await LibraryStore.open(join(root, "library"));
  return { input, root, store };
}

describe("LibraryStore", () => {
  it("deduplicates unchanged imports and versions changed content", async () => {
    const { input, store } = await fixture();
    const first = await store.importFile(input);
    const duplicate = await store.importFile(input);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.snapshot.id).toBe(first.snapshot.id);

    await writeFile(input, "第一季度预算 1300");
    const second = await store.importFile(input);
    expect(second.duplicate).toBe(false);
    expect(second.snapshot.version).toBe(2);
    await expect(readFile(first.objectPath, "utf8")).resolves.toBe("第一季度预算 1200");
    store.close();
  });

  it("records blocks and finds their source locators", async () => {
    const { input, store } = await fixture();
    const imported = await store.importFile(input);
    store.recordBlocks(
      imported.snapshot.id,
      [
        {
          kind: "paragraph",
          text: "第一季度预算 1200",
          locator: { kind: "line", line: 1 },
        },
      ],
      "indexed",
    );

    const results = store.searchBlocks("预算");
    expect(results).toHaveLength(1);
    expect(results[0]?.snapshotId).toBe(imported.snapshot.id);
    expect(results[0]?.locator).toEqual({ kind: "line", line: 1 });
    store.close();
  });

  it("stores embeddings and ranks vector matches", async () => {
    const { input, store } = await fixture();
    const imported = await store.importFile(input);
    store.recordBlocks(
      imported.snapshot.id,
      [
        { kind: "paragraph", text: "预算", locator: { kind: "line", line: 1 } },
        { kind: "paragraph", text: "差旅", locator: { kind: "line", line: 2 } },
      ],
      "indexed",
    );
    store.recordEmbeddings(imported.snapshot.id, "fake-embedding", [
      [1, 0],
      [0, 1],
    ]);
    const results = store.searchVectors("fake-embedding", [1, 0]);
    expect(results[0]?.blockIndex).toBe(0);
    expect(results[0]?.score).toBeCloseTo(1);
    store.close();
  });
});
