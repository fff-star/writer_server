import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFileNoOverwrite, resolveWorkspacePath } from "./path-policy.js";

const temporary: string[] = [];

async function workspaceFixture() {
  const root = await mkdtemp(join(tmpdir(), "office-agent-policy-"));
  temporary.push(root);
  const workspace = join(root, "workspace");
  await mkdir(workspace);
  return { root, workspace };
}

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("workspace path policy", () => {
  it("creates files without overwriting existing content", async () => {
    const { workspace } = await workspaceFixture();
    const path = await createFileNoOverwrite(workspace, "result.txt", "first");
    await expect(readFile(path, "utf8")).resolves.toBe("first");
    await expect(createFileNoOverwrite(workspace, "result.txt", "second")).rejects.toMatchObject({
      code: "EEXIST",
    });
    await expect(readFile(path, "utf8")).resolves.toBe("first");
  });

  it("rejects lexical and symlink escapes", async () => {
    const { root, workspace } = await workspaceFixture();
    const outside = join(root, "secret.txt");
    await writeFile(outside, "secret");
    await expect(resolveWorkspacePath(workspace, "../secret.txt")).rejects.toThrow("escapes");
    await symlink(outside, join(workspace, "link.txt"));
    await expect(resolveWorkspacePath(workspace, "link.txt")).rejects.toThrow("escapes");
  });
});
