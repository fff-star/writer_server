import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ExtractionOptions,
  OcrProvider,
  OcrRequest,
  OcrResult,
  VisualProvider,
  VisualRequest,
  VisualResult,
} from "@office-agent/ingestion";
import { LibraryService, type ExtractionOptionsResolver } from "./library-service";

const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function stubOcrProvider(text: string): OcrProvider & {
  recognize: ReturnType<typeof vi.fn<(request: OcrRequest) => Promise<OcrResult>>>;
} {
  return {
    id: "stub-ocr",
    recognize: vi.fn<(request: OcrRequest) => Promise<OcrResult>>(() => Promise.resolve({ text })),
  };
}

function stubVisualProvider(caption: string): VisualProvider & {
  describe: ReturnType<typeof vi.fn<(request: VisualRequest) => Promise<VisualResult>>>;
} {
  return {
    id: "stub-visual",
    describe: vi.fn<(request: VisualRequest) => Promise<VisualResult>>(() =>
      Promise.resolve({ caption }),
    ),
  };
}

let root: string | undefined;
let service: LibraryService | undefined;

function paths(): { libraryRoot: string; tempDir: string; inputsDir: string } {
  if (!root) {
    throw new Error("test root is not initialized");
  }
  return {
    libraryRoot: join(root, "library"),
    tempDir: join(root, "temp"),
    inputsDir: join(root, "inputs"),
  };
}

async function createService(resolver?: ExtractionOptionsResolver): Promise<LibraryService> {
  const { libraryRoot, tempDir } = paths();
  service = await LibraryService.create(libraryRoot, tempDir, resolver);
  return service;
}

async function writeInput(name: string, content: Buffer | string): Promise<string> {
  const { inputsDir } = paths();
  await mkdir(inputsDir, { recursive: true });
  const path = join(inputsDir, name);
  await writeFile(path, content);
  return path;
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "office-agent-library-test-"));
});

afterEach(async () => {
  service?.close();
  service = undefined;
  if (root) {
    await rm(root, { recursive: true, force: true });
    root = undefined;
  }
});

describe("LibraryService extraction provider threading", () => {
  it("passes resolver providers to extraction and records their output", async () => {
    const ocr = stubOcrProvider("差旅 报销 标准");
    const visual = stubVisualProvider("报销 流程 示意图");
    const resolver = vi.fn<ExtractionOptionsResolver>(() => Promise.resolve({ ocr, visual }));
    const library = await createService(resolver);
    const input = await writeInput("receipt.png", pngBytes);

    const result = await library.importPaths([input]);

    expect(result).toMatchObject({ imported: 1, duplicates: 0, failed: 0 });
    expect(result.snapshots[0]?.status).toBe("indexed");
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(ocr.recognize).toHaveBeenCalledTimes(1);
    expect(visual.describe).toHaveBeenCalledTimes(1);
    const request = ocr.recognize.mock.calls[0]?.[0];
    expect(request?.image.mediaType).toBe("image/png");
    expect(Buffer.from(request?.image.data ?? []).equals(pngBytes)).toBe(true);
    const texts = library.blocks().map((block) => block.text);
    expect(texts).toContain("差旅 报销 标准");
    expect(texts).toContain("报销 流程 示意图");
    const hits = library.search("流程");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.snapshotName).toBe("receipt.png");
  });

  it("re-resolves extraction options for every import batch", async () => {
    const firstOcr = stubOcrProvider("第一批 文字");
    const secondOcr = stubOcrProvider("第二批 文字");
    const batches: ExtractionOptions[] = [{ ocr: firstOcr }, { ocr: secondOcr }];
    let call = 0;
    const resolver = vi.fn<ExtractionOptionsResolver>(() => {
      const options = batches[call] ?? {};
      call += 1;
      return Promise.resolve(options);
    });
    const library = await createService(resolver);
    const firstInput = await writeInput("first.png", pngBytes);
    const secondInput = await writeInput("second.png", Buffer.concat([pngBytes, Buffer.from([0])]));

    await library.importPaths([firstInput]);
    await library.importPaths([secondInput]);

    expect(resolver).toHaveBeenCalledTimes(2);
    expect(firstOcr.recognize).toHaveBeenCalledTimes(1);
    expect(secondOcr.recognize).toHaveBeenCalledTimes(1);
    const texts = library.blocks().map((block) => block.text);
    expect(texts).toContain("第一批 文字");
    expect(texts).toContain("第二批 文字");
  });

  it("counts failed extractions in the import summary", async () => {
    const library = await createService();
    const unsupported = await writeInput("notes.xyz", "plain bytes");
    const missing = join(paths().inputsDir, "missing.txt");

    const result = await library.importPaths([unsupported, missing]);

    expect(result.imported).toBe(1);
    expect(result.failed).toBe(2);
    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0]?.status).toBe("failed");
    expect(result.snapshots[0]?.error).toContain("Unsupported extension");
  });
});
