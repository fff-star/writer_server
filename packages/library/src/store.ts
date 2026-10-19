import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { chmod, copyFile, mkdir, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ExtractedBlock, ExtractionStatus, SourceLocator } from "@office-agent/contracts";

export type LibrarySnapshot = {
  id: string;
  sourceKey: string;
  sha256: string;
  originalName: string;
  originalPath: string;
  mediaType: string;
  extension: string;
  size: number;
  version: number;
  status: ExtractionStatus;
  error: string | null;
  importedAt: string;
};

export type ImportResult = {
  snapshot: LibrarySnapshot;
  duplicate: boolean;
  objectPath: string;
};

export type SearchResult = {
  snapshotId: string;
  blockIndex: number;
  kind: string;
  text: string;
  locator: SourceLocator;
  score: number;
};

const mediaTypes: Record<string, string> = {
  ".csv": "text/csv",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".md": "text/markdown",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".txt": "text/plain",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function rowToSnapshot(row: Record<string, unknown>): LibrarySnapshot {
  return {
    id: String(row["id"]),
    sourceKey: String(row["source_key"]),
    sha256: String(row["sha256"]),
    originalName: String(row["original_name"]),
    originalPath: String(row["original_path"]),
    mediaType: String(row["media_type"]),
    extension: String(row["extension"]),
    size: Number(row["size"]),
    version: Number(row["version"]),
    status: row["status"] as ExtractionStatus,
    error: row["error"] === null ? null : String(row["error"]),
    importedAt: String(row["imported_at"]),
  };
}

function ftsQuery(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term.replaceAll('"', '""')}"`)
    .join(" AND ");
}

export class LibraryStore {
  private constructor(
    private readonly root: string,
    private readonly database: DatabaseSync,
  ) {}

  static async open(root: string): Promise<LibraryStore> {
    const resolved = resolve(root);
    await mkdir(join(resolved, "objects"), { recursive: true });
    const database = new DatabaseSync(join(resolved, "library.db"));
    database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS snapshots (
        id TEXT PRIMARY KEY,
        source_key TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        original_name TEXT NOT NULL,
        original_path TEXT NOT NULL,
        media_type TEXT NOT NULL,
        extension TEXT NOT NULL,
        size INTEGER NOT NULL,
        version INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('imported', 'processing', 'indexed', 'partial', 'failed')),
        error TEXT,
        imported_at TEXT NOT NULL,
        UNIQUE (source_key, sha256),
        UNIQUE (source_key, version)
      );
      CREATE INDEX IF NOT EXISTS snapshots_status_idx ON snapshots(status);
      CREATE TABLE IF NOT EXISTS blocks (
        id TEXT PRIMARY KEY,
        snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
        block_index INTEGER NOT NULL,
        kind TEXT NOT NULL,
        text TEXT NOT NULL,
        locator_json TEXT NOT NULL,
        UNIQUE (snapshot_id, block_index)
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS blocks_fts USING fts5(
        text,
        content='blocks',
        content_rowid='rowid'
      );
      CREATE TRIGGER IF NOT EXISTS blocks_ai AFTER INSERT ON blocks BEGIN
        INSERT INTO blocks_fts(rowid, text) VALUES (new.rowid, new.text);
      END;
      CREATE TRIGGER IF NOT EXISTS blocks_ad AFTER DELETE ON blocks BEGIN
        INSERT INTO blocks_fts(blocks_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
      END;
      CREATE TRIGGER IF NOT EXISTS blocks_au AFTER UPDATE ON blocks BEGIN
        INSERT INTO blocks_fts(blocks_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
        INSERT INTO blocks_fts(rowid, text) VALUES (new.rowid, new.text);
      END;
    `);
    return new LibraryStore(resolved, database);
  }

  async importFile(input: string): Promise<ImportResult> {
    const originalPath = resolve(input);
    const info = await stat(originalPath);
    if (!info.isFile()) {
      throw new Error(`Import input is not a regular file: ${originalPath}`);
    }
    const sha256 = await sha256File(originalPath);
    const sourceKey = sha256Text(originalPath);
    const existing = this.database
      .prepare("SELECT * FROM snapshots WHERE source_key = ? AND sha256 = ?")
      .get(sourceKey, sha256) as Record<string, unknown> | undefined;
    if (existing) {
      return {
        snapshot: rowToSnapshot(existing),
        duplicate: true,
        objectPath: this.objectPath(sha256),
      };
    }

    const version =
      Number(
        (
          this.database
            .prepare("SELECT MAX(version) AS version FROM snapshots WHERE source_key = ?")
            .get(sourceKey) as {
            version: number | null;
          }
        ).version ?? 0,
      ) + 1;
    const snapshot: LibrarySnapshot = {
      id: randomUUID(),
      sourceKey,
      sha256,
      originalName: basename(originalPath),
      originalPath,
      mediaType: mediaTypes[extname(originalPath).toLowerCase()] ?? "application/octet-stream",
      extension: extname(originalPath).toLowerCase(),
      size: info.size,
      version,
      status: "imported",
      error: null,
      importedAt: new Date().toISOString(),
    };
    const objectPath = this.objectPath(sha256);
    await mkdir(join(this.root, "objects", sha256.slice(0, 2)), { recursive: true });
    await copyFile(originalPath, objectPath, constants.COPYFILE_EXCL);
    await chmod(objectPath, 0o444);

    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare(
          `INSERT INTO snapshots (
            id, source_key, sha256, original_name, original_path, media_type,
            extension, size, version, status, error, imported_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          snapshot.id,
          snapshot.sourceKey,
          snapshot.sha256,
          snapshot.originalName,
          snapshot.originalPath,
          snapshot.mediaType,
          snapshot.extension,
          snapshot.size,
          snapshot.version,
          snapshot.status,
          snapshot.error,
          snapshot.importedAt,
        );
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    return { snapshot, duplicate: false, objectPath };
  }

  recordBlocks(
    snapshotId: string,
    blocks: ExtractedBlock[],
    status: ExtractionStatus,
    error?: string,
  ): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare("DELETE FROM blocks WHERE snapshot_id = ?").run(snapshotId);
      const insert = this.database.prepare(
        "INSERT INTO blocks (id, snapshot_id, block_index, kind, text, locator_json) VALUES (?, ?, ?, ?, ?, ?)",
      );
      blocks.forEach((block, index) => {
        insert.run(
          randomUUID(),
          snapshotId,
          index,
          block.kind,
          block.text,
          JSON.stringify(block.locator),
        );
      });
      this.updateStatus(snapshotId, status, error);
      this.database.exec("COMMIT");
    } catch (caught) {
      this.database.exec("ROLLBACK");
      throw caught;
    }
  }

  updateStatus(snapshotId: string, status: ExtractionStatus, error?: string): void {
    this.database
      .prepare("UPDATE snapshots SET status = ?, error = ? WHERE id = ?")
      .run(status, error ?? null, snapshotId);
  }

  listSnapshots(): LibrarySnapshot[] {
    const rows = this.database
      .prepare("SELECT * FROM snapshots ORDER BY imported_at, source_key, version")
      .all();
    return rows.map((row) => rowToSnapshot(row as Record<string, unknown>));
  }

  getSnapshot(id: string): LibrarySnapshot | undefined {
    const row = this.database.prepare("SELECT * FROM snapshots WHERE id = ?").get(id) as
      Record<string, unknown> | undefined;
    return row ? rowToSnapshot(row) : undefined;
  }

  searchBlocks(query: string, limit = 20): SearchResult[] {
    const terms = query.trim().split(/\s+/).filter(Boolean);
    const match = ftsQuery(query);
    if (!match) {
      return [];
    }
    const hasNonAscii = [...query].some((character) => character.charCodeAt(0) > 127);
    const rows = hasNonAscii
      ? this.database
          .prepare(
            `SELECT snapshot_id, block_index, kind, text, locator_json, 0 AS score
             FROM blocks
             WHERE ${terms.map(() => "text LIKE ? ESCAPE '\\'").join(" AND ")}
             LIMIT ?`,
          )
          .all(
            ...terms.map((term) => `%${term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`),
            limit,
          )
      : this.database
          .prepare(
            `SELECT b.snapshot_id, b.block_index, b.kind, b.text, b.locator_json, bm25(blocks_fts) AS score
             FROM blocks_fts
             JOIN blocks b ON b.rowid = blocks_fts.rowid
             WHERE blocks_fts MATCH ?
             ORDER BY score
             LIMIT ?`,
          )
          .all(match, limit);
    return rows.map((row) => {
      const value = row as Record<string, unknown>;
      return {
        snapshotId: String(value["snapshot_id"]),
        blockIndex: Number(value["block_index"]),
        kind: String(value["kind"]),
        text: String(value["text"]),
        locator: JSON.parse(String(value["locator_json"])) as SourceLocator,
        score: Number(value["score"]),
      };
    });
  }

  objectPath(sha256: string): string {
    return join(this.root, "objects", sha256.slice(0, 2), sha256);
  }

  close(): void {
    this.database.close();
  }
}
