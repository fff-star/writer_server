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
  projectId: string;
};

export type Project = {
  id: string;
  name: string;
  createdAt: string;
};

export type MessageRole = "user" | "agent";

export type StoredMessage = {
  id: string;
  projectId: string;
  role: MessageRole;
  text: string;
  payload: unknown | null;
  createdAt: string;
};

const DEFAULT_PROJECT_ID = "default";
const DEFAULT_PROJECT_NAME = "未归档";

function rowToProject(row: Record<string, unknown>): Project {
  return {
    id: String(row["id"]),
    name: String(row["name"]),
    createdAt: String(row["created_at"]),
  };
}

function rowToMessage(row: Record<string, unknown>): StoredMessage {
  const payload = row["payload_json"];
  return {
    id: String(row["id"]),
    projectId: String(row["project_id"]),
    role: row["role"] as MessageRole,
    text: String(row["text"]),
    payload: payload === null ? null : JSON.parse(String(payload)),
    createdAt: String(row["created_at"]),
  };
}

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

function migrateDocumentsProjectId(database: DatabaseSync): void {
  const columns = database.prepare("PRAGMA table_info(documents)").all() as Array<
    Record<string, unknown>
  >;
  if (!columns.some((column) => column["name"] === "project_id")) {
    database.exec("ALTER TABLE documents ADD COLUMN project_id TEXT REFERENCES projects(id)");
  }
  const unassigned = database
    .prepare("SELECT COUNT(*) AS count FROM documents WHERE project_id IS NULL")
    .get() as Record<string, unknown>;
  if (Number(unassigned["count"]) > 0) {
    database
      .prepare("INSERT OR IGNORE INTO projects (id, name, created_at) VALUES (?, ?, ?)")
      .run(DEFAULT_PROJECT_ID, DEFAULT_PROJECT_NAME, new Date().toISOString());
    database
      .prepare("UPDATE documents SET project_id = ? WHERE project_id IS NULL")
      .run(DEFAULT_PROJECT_ID);
  }
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
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        project_id TEXT REFERENCES projects(id)
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
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'agent')),
        text TEXT NOT NULL,
        payload_json TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS messages_project_idx ON messages(project_id);
    `);
    migrateDocumentsProjectId(database);
    return new DocumentVersionStore(database);
  }

  createDocument(
    document: OfficeDocument,
    authorKind: VersionAuthorKind = "human",
    projectId?: string,
  ): DocumentVersion {
    const parsed = officeDocumentSchema.parse(document);
    const ownerId = projectId === undefined ? this.defaultProject().id : projectId;
    if (projectId !== undefined) {
      this.requireProject(projectId);
    }
    const documentId = randomUUID();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare("INSERT INTO documents (id, title, created_at, project_id) VALUES (?, ?, ?, ?)")
        .run(documentId, parsed.title, new Date().toISOString(), ownerId);
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
    projectId?: string,
  ): DocumentVersion {
    const parsed = officeDocumentSchema.parse(document);
    if (projectId !== undefined) {
      const owner = this.database
        .prepare("SELECT project_id FROM documents WHERE id = ?")
        .get(documentId) as Record<string, unknown> | undefined;
      if (!owner) {
        throw new Error(`Document does not exist: ${documentId}`);
      }
      if (String(owner["project_id"]) !== projectId) {
        throw new Error(`Document ${documentId} does not belong to project ${projectId}`);
      }
    }
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

  listDocuments(projectId?: string): DocumentSummary[] {
    const rows = projectId
      ? this.database
          .prepare(
            "SELECT id, title, created_at, project_id FROM documents WHERE project_id = ? ORDER BY created_at, id",
          )
          .all(projectId)
      : this.database
          .prepare(
            "SELECT id, title, created_at, project_id FROM documents ORDER BY created_at, id",
          )
          .all();
    return rows.map((row) => {
      const value = row as Record<string, unknown>;
      return {
        id: String(value["id"]),
        title: String(value["title"]),
        createdAt: String(value["created_at"]),
        projectId: String(value["project_id"]),
      };
    });
  }

  createProject(name: string): Project {
    const project: Project = { id: randomUUID(), name, createdAt: new Date().toISOString() };
    this.database
      .prepare("INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)")
      .run(project.id, project.name, project.createdAt);
    return project;
  }

  listProjects(): Project[] {
    const rows = this.database
      .prepare("SELECT id, name, created_at FROM projects ORDER BY created_at, rowid")
      .all();
    return rows.map((row) => rowToProject(row as Record<string, unknown>));
  }

  getProject(projectId: string): Project | undefined {
    const row = this.database
      .prepare("SELECT id, name, created_at FROM projects WHERE id = ?")
      .get(projectId) as Record<string, unknown> | undefined;
    return row ? rowToProject(row) : undefined;
  }

  renameProject(projectId: string, name: string): Project {
    const result = this.database
      .prepare("UPDATE projects SET name = ? WHERE id = ?")
      .run(name, projectId);
    if (result.changes === 0) {
      throw new Error(`Project does not exist: ${projectId}`);
    }
    const project = this.getProject(projectId);
    if (!project) {
      throw new Error(`Project does not exist: ${projectId}`);
    }
    return project;
  }

  appendMessage(
    projectId: string,
    role: MessageRole,
    text: string,
    payload?: unknown,
  ): StoredMessage {
    this.requireProject(projectId);
    const message: StoredMessage = {
      id: randomUUID(),
      projectId,
      role,
      text,
      payload: payload ?? null,
      createdAt: new Date().toISOString(),
    };
    this.database
      .prepare(
        `INSERT INTO messages (id, project_id, role, text, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        message.id,
        message.projectId,
        message.role,
        message.text,
        message.payload === null ? null : JSON.stringify(message.payload),
        message.createdAt,
      );
    return message;
  }

  listMessages(projectId: string): StoredMessage[] {
    const rows = this.database
      .prepare("SELECT * FROM messages WHERE project_id = ? ORDER BY rowid")
      .all(projectId);
    return rows.map((row) => rowToMessage(row as Record<string, unknown>));
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

  private requireProject(projectId: string): void {
    if (!this.getProject(projectId)) {
      throw new Error(`Project does not exist: ${projectId}`);
    }
  }

  private defaultProject(): Project {
    return (
      this.getProject(DEFAULT_PROJECT_ID) ??
      this.createProjectWithId(DEFAULT_PROJECT_ID, DEFAULT_PROJECT_NAME)
    );
  }

  private createProjectWithId(id: string, name: string): Project {
    const project: Project = { id, name, createdAt: new Date().toISOString() };
    this.database
      .prepare("INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)")
      .run(project.id, project.name, project.createdAt);
    return project;
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
