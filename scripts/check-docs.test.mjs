import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { checkDocs } from "./check-docs.mjs";

const temporaryDirectories = [];

async function fixture(files) {
  const root = await mkdtemp(join(tmpdir(), "office-agent-docs-"));
  temporaryDirectories.push(root);
  for (const [path, content] of Object.entries(files)) {
    const destination = join(root, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content, "utf8");
  }
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("checkDocs", () => {
  it("accepts linked English documentation", async () => {
    const root = await fixture({
      "README.md": "Read the [documentation](docs/README.md).\n",
      "docs/README.md": "Read the [guide](guide.md).\n",
      "docs/guide.md": "This short guide is linked and written in English.\n",
    });
    const result = await checkDocs({ root });
    expect(result.violations).toEqual([]);
    expect(result.fileCount).toBe(3);
  });

  it("rejects files over the English word limit", async () => {
    const root = await fixture({
      "docs/README.md": "Read the [guide](guide.md).\n",
      "docs/guide.md": `${"word ".repeat(5001)}\n`,
    });
    const result = await checkDocs({ root });
    expect(result.violations.some((item) => item.includes("5000-word limit"))).toBe(true);
  });

  it("rejects non-English scripts", async () => {
    const root = await fixture({
      "docs/README.md": "Read the [guide](guide.md).\n",
      "docs/guide.md": "这是中文文档。\n",
    });
    const result = await checkDocs({ root });
    expect(result.violations.some((item) => item.includes("non-English script"))).toBe(true);
  });

  it("rejects broken links and orphaned documents", async () => {
    const root = await fixture({
      "docs/README.md": "Read the [missing guide](missing.md).\n",
      "docs/orphan.md": "This file is not reachable from the index.\n",
    });
    const result = await checkDocs({ root });
    expect(result.violations.some((item) => item.includes("broken local link"))).toBe(true);
    expect(result.violations.some((item) => item.includes("orphaned documentation"))).toBe(true);
  });
});
