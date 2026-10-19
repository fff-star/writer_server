import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { WebSource } from "@office-agent/contracts";

export class WebCache {
  private constructor(private readonly database: DatabaseSync) {}

  static async open(path: string): Promise<WebCache> {
    const resolved = resolve(path);
    await mkdir(dirname(resolved), { recursive: true });
    const database = new DatabaseSync(resolved);
    database.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS web_sources (
        url TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        text TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        fetched_at TEXT NOT NULL
      );
    `);
    return new WebCache(database);
  }

  get(url: string, maxAgeMs: number, now = Date.now()): WebSource | undefined {
    const row = this.database.prepare("SELECT * FROM web_sources WHERE url = ?").get(url) as
      Record<string, unknown> | undefined;
    if (!row) {
      return undefined;
    }
    const fetchedAt = Date.parse(String(row["fetched_at"]));
    if (!Number.isFinite(fetchedAt) || now - fetchedAt > maxAgeMs) {
      return undefined;
    }
    return {
      url: String(row["url"]),
      title: String(row["title"]),
      text: String(row["text"]),
      sha256: String(row["sha256"]),
      fetchedAt: String(row["fetched_at"]),
    };
  }

  put(source: WebSource): void {
    this.database
      .prepare(
        `INSERT INTO web_sources (url, title, text, sha256, fetched_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(url) DO UPDATE SET
           title = excluded.title,
           text = excluded.text,
           sha256 = excluded.sha256,
           fetched_at = excluded.fetched_at`,
      )
      .run(source.url, source.title, source.text, source.sha256, source.fetchedAt);
  }

  close(): void {
    this.database.close();
  }
}
