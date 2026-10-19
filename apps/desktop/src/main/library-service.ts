import { mkdir } from "node:fs/promises";
import type {
  LibraryImportSummary,
  LibrarySearchResult,
  LibrarySnapshotSummary,
} from "@office-agent/contracts";
import { extractDocument } from "@office-agent/ingestion";
import type { ExtractionOptions } from "@office-agent/ingestion";
import { LibraryStore } from "@office-agent/library";
import type { LibrarySnapshot, StoredBlock } from "@office-agent/library";
import { dialog, type BrowserWindow } from "electron";

const supportedExtensions = [
  "doc",
  "docx",
  "pdf",
  "xlsx",
  "csv",
  "txt",
  "md",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "bmp",
  "tif",
  "tiff",
];

function summary(snapshot: LibrarySnapshot): LibrarySnapshotSummary {
  return {
    id: snapshot.id,
    originalName: snapshot.originalName,
    mediaType: snapshot.mediaType,
    extension: snapshot.extension,
    size: snapshot.size,
    version: snapshot.version,
    status: snapshot.status,
    error: snapshot.error,
    importedAt: snapshot.importedAt,
  };
}

export type ExtractionOptionsResolver = () => Promise<ExtractionOptions>;

export class LibraryService {
  private constructor(
    private readonly store: LibraryStore,
    private readonly temporaryDirectory: string,
    private readonly resolveExtractionOptions: ExtractionOptionsResolver,
  ) {}

  static async create(
    libraryRoot: string,
    temporaryDirectory: string,
    resolveExtractionOptions: ExtractionOptionsResolver = () => Promise.resolve({}),
  ): Promise<LibraryService> {
    await mkdir(temporaryDirectory, { recursive: true });
    return new LibraryService(
      await LibraryStore.open(libraryRoot),
      temporaryDirectory,
      resolveExtractionOptions,
    );
  }

  async importWithDialog(window: BrowserWindow): Promise<LibraryImportSummary> {
    const result = await dialog.showOpenDialog(window, {
      title: "选择要导入的资料",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "支持的办公文件", extensions: supportedExtensions },
        { name: "所有文件", extensions: ["*"] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { imported: 0, duplicates: 0, failed: 0, snapshots: [] };
    }
    return this.importPaths(result.filePaths);
  }

  async importPaths(paths: string[]): Promise<LibraryImportSummary> {
    const result: LibraryImportSummary = {
      imported: 0,
      duplicates: 0,
      failed: 0,
      snapshots: [],
    };
    const extractionOptions = await this.resolveExtractionOptions();
    for (const path of paths) {
      try {
        const imported = await this.store.importFile(path);
        const extraction = await extractDocument(
          imported.objectPath,
          this.temporaryDirectory,
          imported.snapshot.extension,
          extractionOptions,
        );
        this.store.recordBlocks(
          imported.snapshot.id,
          extraction.blocks,
          extraction.status,
          extraction.error,
        );
        const snapshot = this.store.getSnapshot(imported.snapshot.id) ?? imported.snapshot;
        result.snapshots.push(summary(snapshot));
        if (imported.duplicate) {
          result.duplicates += 1;
        } else {
          result.imported += 1;
        }
        if (extraction.status === "failed") {
          result.failed += 1;
        }
      } catch {
        result.failed += 1;
      }
    }
    return result;
  }

  listSnapshots(): LibrarySnapshotSummary[] {
    return this.store.listSnapshots().map(summary);
  }

  search(query: string): LibrarySearchResult[] {
    const snapshots = new Map(
      this.store.listSnapshots().map((snapshot) => [snapshot.id, snapshot]),
    );
    return this.store.searchBlocks(query).flatMap((result) => {
      const snapshot = snapshots.get(result.snapshotId);
      if (!snapshot) {
        return [];
      }
      return [
        {
          snapshotId: result.snapshotId,
          snapshotName: snapshot.originalName,
          blockIndex: result.blockIndex,
          kind: result.kind,
          text: result.text,
          locator: result.locator,
          score: result.score,
        },
      ];
    });
  }

  blocks(): StoredBlock[] {
    return this.store.listBlocks();
  }

  close(): void {
    this.store.close();
  }
}
