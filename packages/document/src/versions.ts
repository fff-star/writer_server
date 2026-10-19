import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { mergeAgentRevision, officeDocumentSchema } from "./model.js";
import type { OfficeDocument } from "./model.js";

export type VersionAuthorKind = "human" | "agent";

export type DocumentVersion = {
  id: string;
  documentId: string;
  parentId: string | null;
  authorKind: VersionAuthorKind;
  createdAt: string;
  document: OfficeDocument;
};

export type DocumentSummary = {
  id: string;
  title: string;
  createdAt: string;
};

export type AgentRevisionResult = {
  version: DocumentVersion;
  conflicts: string[];
};

function rowToVersion(row: Record<string, unknown>): DocumentVersion {
  return {
    id: String(row["id"]),
    documentId: String(row["document_id"]),
    parentId: row["parent_id"] === null ? null : String(row["parent_id"]),
    authorKind: row["author_kind"] as VersionAuthorKind,
    createdAt: String(row["created_at"]),
    document: officeDocumentSchema.parse(JSON.parse(String(row["document_json"]))),
  };
}

export class DocumentVersionStore {
  private constructor(private readonly database: DatabaseSync) {}

  static async open(root: string): Promise<DocumentVersionStore> {
    const resolved = resolve(root);
    await mkdir(resolved, { recursive: true });
    const database = new DatabaseSync(join(resolved, "versions.db"));
    database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS versions (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        parent_id TEXT REFERENCES versions(id),
        author_kind TEXT NOT NULL CHECK (author_kind IN ('human', 'agent')),
        created_at TEXT NOT NULL,
        document_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS versions_document_idx ON versions(document_id);
      CREATE TABLE IF NOT EXISTS conflicts (
        version_id TEXT NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
        block_id TEXT NOT NULL,
        PRIMARY KEY (version_id, block_id)
      );
    `);
    return new DocumentVersionStore(database);
  }

  createDocument(
    document: OfficeDocument,
    authorKind: VersionAuthorKind = "human",
  ): DocumentVersion {
    const parsed = officeDocumentSchema.parse(document);
    const documentId = randomUUID();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare("INSERT INTO documents (id, title, created_at) VALUES (?, ?, ?)")
        .run(documentId, parsed.title, new Date().toISOString());
      const version = this.insertVersion(documentId, null, authorKind, parsed);
      this.database.exec("COMMIT");
      return version;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  appendVersion(
    documentId: string,
    document: OfficeDocument,
    authorKind: VersionAuthorKind = "human",
  ): DocumentVersion {
    const parsed = officeDocumentSchema.parse(document);
    const parent = this.requireLatest(documentId);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const version = this.insertVersion(documentId, parent.id, authorKind, parsed);
      this.database
        .prepare("UPDATE documents SET title = ? WHERE id = ?")
        .run(parsed.title, documentId);
      this.database.exec("COMMIT");
      return version;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  appendAgentRevision(
    documentId: string,
    agentDraft: OfficeDocument,
    baseVersionId?: string,
  ): AgentRevisionResult {
    const agent = officeDocumentSchema.parse(agentDraft);
    const current = this.requireLatest(documentId);
    const base = baseVersionId ? this.requireVersionInDocument(documentId, baseVersionId) : current;
    const merged = mergeAgentRevision(base.document, current.document, agent);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const version = this.insertVersion(documentId, current.id, "agent", merged.document);
      this.database
        .prepare("UPDATE documents SET title = ? WHERE id = ?")
        .run(merged.document.title, documentId);
      const insert = this.database.prepare(
        "INSERT INTO conflicts (version_id, block_id) VALUES (?, ?)",
      );
      for (const blockId of merged.conflicts) {
        insert.run(version.id, blockId);
      }
      this.database.exec("COMMIT");
      return { version, conflicts: merged.conflicts };
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  listDocuments(): DocumentSummary[] {
    const rows = this.database
      .prepare("SELECT id, title, created_at FROM documents ORDER BY created_at, id")
      .all();
    return rows.map((row) => {
      const value = row as Record<string, unknown>;
      return {
        id: String(value["id"]),
        title: String(value["title"]),
        createdAt: String(value["created_at"]),
      };
    });
  }

  listVersions(documentId: string): DocumentVersion[] {
    const rows = this.database
      .prepare("SELECT * FROM versions WHERE document_id = ? ORDER BY rowid")
      .all(documentId);
    return rows.map((row) => rowToVersion(row as Record<string, unknown>));
  }

  getVersion(versionId: string): DocumentVersion | undefined {
    const row = this.database.prepare("SELECT * FROM versions WHERE id = ?").get(versionId) as
      Record<string, unknown> | undefined;
    return row ? rowToVersion(row) : undefined;
  }

  latestVersion(documentId: string): DocumentVersion | undefined {
    const row = this.database
      .prepare("SELECT * FROM versions WHERE document_id = ? ORDER BY rowid DESC LIMIT 1")
      .get(documentId) as Record<string, unknown> | undefined;
    return row ? rowToVersion(row) : undefined;
  }

  getConflicts(versionId: string): string[] {
    const rows = this.database
      .prepare("SELECT block_id FROM conflicts WHERE version_id = ? ORDER BY block_id")
      .all(versionId);
    return rows.map((row) => String((row as Record<string, unknown>)["block_id"]));
  }

  close(): void {
    this.database.close();
  }

  private insertVersion(
    documentId: string,
    parentId: string | null,
    authorKind: VersionAuthorKind,
    document: OfficeDocument,
  ): DocumentVersion {
    const version: DocumentVersion = {
      id: randomUUID(),
      documentId,
      parentId,
      authorKind,
      createdAt: new Date().toISOString(),
      document,
    };
    this.database
      .prepare(
        `INSERT INTO versions (id, document_id, parent_id, author_kind, created_at, document_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        version.id,
        version.documentId,
        version.parentId,
        version.authorKind,
        version.createdAt,
        JSON.stringify(version.document),
      );
    return version;
  }

  private requireLatest(documentId: string): DocumentVersion {
    const latest = this.latestVersion(documentId);
    if (!latest) {
      throw new Error(`Document has no versions: ${documentId}`);
    }
    return latest;
  }

  private requireVersionInDocument(documentId: string, versionId: string): DocumentVersion {
    const version = this.getVersion(versionId);
    if (!version || version.documentId !== documentId) {
      throw new Error(`Version ${versionId} does not belong to document ${documentId}`);
    }
    return version;
  }
}
