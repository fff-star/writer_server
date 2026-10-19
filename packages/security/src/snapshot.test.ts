import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createWorkspaceSnapshot,
  restoreWorkspaceSnapshot,
  snapshotMatchesWorkspace,
} from "./snapshot.js";

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("workspace snapshots", () => {
  it("uses independent copies and restores all tracked changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "office-agent-snapshot-"));
    temporary.push(root);
    const workspace = join(root, "workspace");
    await mkdir(workspace);
    await writeFile(join(workspace, "keep.txt"), "original");
    await writeFile(join(workspace, "remove.txt"), "restore me");

    const snapshot = await createWorkspaceSnapshot(workspace, join(root, "snapshots"));
    await writeFile(join(workspace, "keep.txt"), "changed");
    await writeFile(join(workspace, "new.txt"), "new");
    await rm(join(workspace, "remove.txt"));

    await expect(snapshotMatchesWorkspace(workspace, snapshot)).resolves.toBe(false);
    await expect(readFile(join(snapshot.root, "keep.txt"), "utf8")).resolves.toBe("original");

    await restoreWorkspaceSnapshot(workspace, snapshot);
    await expect(snapshotMatchesWorkspace(workspace, snapshot)).resolves.toBe(true);
    await expect(readFile(join(workspace, "keep.txt"), "utf8")).resolves.toBe("original");
    await expect(readFile(join(workspace, "remove.txt"), "utf8")).resolves.toBe("restore me");
    expect(existsSync(join(workspace, "new.txt"))).toBe(false);
  });
});
