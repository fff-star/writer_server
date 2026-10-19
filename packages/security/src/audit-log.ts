import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type AuditEvent = {
  sequence: number;
  timestamp: string;
  type: string;
  outcome: "allowed" | "denied" | "failed" | "completed";
  details: Record<string, unknown>;
  previousHash: string;
  hash: string;
};

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /key|token|secret|authorization|password/i.test(key) ? "[redacted]" : redact(item),
      ]),
    );
  }
  return value;
}

export class AuditLog {
  private constructor(
    private readonly path: string,
    private sequence: number,
    private previousHash: string,
  ) {}

  static async create(path: string): Promise<AuditLog> {
    let sequence = 0;
    let previousHash = "0".repeat(64);
    try {
      const content = await readFile(path, "utf8");
      const lines = content.trim().split("\n").filter(Boolean);
      const last = lines.at(-1);
      if (last) {
        const event = JSON.parse(last) as AuditEvent;
        sequence = event.sequence;
        previousHash = event.hash;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
    return new AuditLog(path, sequence, previousHash);
  }

  async append(
    type: string,
    outcome: AuditEvent["outcome"],
    details: Record<string, unknown>,
  ): Promise<AuditEvent> {
    const unsigned = {
      sequence: this.sequence + 1,
      timestamp: new Date().toISOString(),
      type,
      outcome,
      details: redact(details) as Record<string, unknown>,
      previousHash: this.previousHash,
    };
    const hash = createHash("sha256").update(JSON.stringify(unsigned)).digest("hex");
    const event = { ...unsigned, hash };
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(event)}\n`, { flag: "a", mode: 0o600 });
    this.sequence = event.sequence;
    this.previousHash = event.hash;
    return event;
  }
}
