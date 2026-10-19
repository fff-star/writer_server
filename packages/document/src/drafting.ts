import { z } from "zod";
import type { LibrarySearchResult, ResearchBundle } from "@office-agent/contracts";
import { officeDocumentSchema } from "./model.js";
import type { DocumentBlock, OfficeDocument } from "./model.js";

export type LocalEvidenceProvider = {
  search(query: string, limit?: number): Promise<LibrarySearchResult[]>;
};

export type WebEvidenceProvider = {
  collect(query: string): Promise<ResearchBundle>;
};

export type EvidenceItem = {
  refId: string;
  kind: "local" | "web";
  label: string;
  locator: string;
  text: string;
};

export type DraftRequest = {
  topic: string;
  brief?: string;
  outline?: string[];
  localLimit?: number;
  webLimit?: number;
};

export type DraftPrompt = {
  language: "zh-CN";
  request: DraftRequest;
  evidence: EvidenceItem[];
  text: string;
};

export type DraftWriter = {
  id: string;
  write(prompt: DraftPrompt): Promise<string>;
};

export type DraftResult = {
  document: OfficeDocument;
  evidence: EvidenceItem[];
  warnings: string[];
  writerId: string;
};

export class DraftingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftingError";
  }
}

const writerBlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("heading"),
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    text: z.string(),
  }),
  z.object({ type: z.literal("paragraph"), text: z.string() }),
  z.object({ type: z.literal("list"), ordered: z.boolean(), items: z.array(z.string()) }),
  z.object({
    type: z.literal("table"),
    header: z.array(z.string()),
    rows: z.array(z.array(z.string())),
  }),
  z.object({ type: z.literal("citation"), text: z.string(), refId: z.string().min(1) }),
]);
const writerDraftSchema = z.object({
  title: z.string().min(1),
  blocks: z.array(writerBlockSchema),
});
type WriterDraft = z.infer<typeof writerDraftSchema>;

function extractJson(output: string): unknown {
  const trimmed = output.trim();
  const fenced = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  const candidate = fenced ? fenced[1]!.trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        // fall through to the error below
      }
    }
    throw new DraftingError("写作结果不是可解析的 JSON 输出");
  }
}

export function localLocator(snapshotId: string, blockIndex: number): string {
  return `local:${snapshotId}:${blockIndex}`;
}

export function buildEvidence(
  localResults: LibrarySearchResult[],
  bundle: ResearchBundle | undefined,
  webLimit: number,
): EvidenceItem[] {
  const items: EvidenceItem[] = localResults.map((result, index) => ({
    refId: `L${index + 1}`,
    kind: "local",
    label: result.snapshotName,
    locator: localLocator(result.snapshotId, result.blockIndex),
    text: result.text,
  }));
  const sources = bundle?.sources.slice(0, webLimit) ?? [];
  sources.forEach((source, index) => {
    items.push({
      refId: `W${index + 1}`,
      kind: "web",
      label: source.title || source.url,
      locator: source.url,
      text: source.text,
    });
  });
  return items;
}

export function buildPromptText(request: DraftRequest, evidence: EvidenceItem[]): string {
  const lines: string[] = [
    "你是一名中文公文写作助手。请根据下列证据,围绕主题撰写一篇简体中文(zh-CN)草稿。",
    `主题:${request.topic}`,
  ];
  if (request.brief) {
    lines.push(`写作要求:${request.brief}`);
  }
  if (request.outline && request.outline.length > 0) {
    lines.push("大纲:", ...request.outline.map((item, index) => `${index + 1}. ${item}`));
  }
  lines.push(
    "",
    "证据列表(引用时只能使用这些编号,不得编造来源):",
    ...evidence.map((item) => {
      const kind = item.kind === "local" ? "本地" : "网络";
      return `[${item.refId}] (${kind}) ${item.label} — ${item.locator}\n${item.text}`;
    }),
    "",
    "硬性要求:",
    "1. 全文使用简体中文,语言正式。",
    "2. 每一处事实性陈述之后必须紧跟一个 citation 块,且 refId 必须来自上面的证据编号。",
    "3. 不得引用证据列表之外的来源,不得编造数据。",
    "4. 只输出 JSON,不要输出任何其他文字。JSON 结构如下:",
    '{"title":"标题","blocks":[{"type":"heading","level":1,"text":"..."},' +
      '{"type":"paragraph","text":"..."},{"type":"list","ordered":false,"items":["..."]},' +
      '{"type":"table","header":["..."],"rows":[["..."]]},' +
      '{"type":"citation","text":"引文或事实陈述","refId":"L1"}]}',
  );
  return lines.join("\n");
}

export class DraftingService {
  constructor(
    private readonly writer: DraftWriter,
    private readonly local?: LocalEvidenceProvider,
    private readonly web?: WebEvidenceProvider,
  ) {}

  async assembleEvidence(request: DraftRequest): Promise<EvidenceItem[]> {
    const localLimit = request.localLimit ?? 8;
    const webLimit = request.webLimit ?? 5;
    const localResults = this.local ? await this.local.search(request.topic, localLimit) : [];
    const bundle = this.web ? await this.web.collect(request.topic) : undefined;
    return buildEvidence(localResults, bundle, webLimit);
  }

  buildPrompt(request: DraftRequest, evidence: EvidenceItem[]): DraftPrompt {
    return {
      language: "zh-CN",
      request,
      evidence,
      text: buildPromptText(request, evidence),
    };
  }

  parseWriterOutput(
    output: string,
    evidence: EvidenceItem[],
  ): {
    document: OfficeDocument;
    warnings: string[];
  } {
    const parsed = writerDraftSchema.safeParse(extractJson(output));
    if (!parsed.success) {
      throw new DraftingError(`写作结果不符合草稿结构: ${parsed.error.message}`);
    }
    return this.toDocument(parsed.data, evidence);
  }

  async draft(request: DraftRequest): Promise<DraftResult> {
    const evidence = await this.assembleEvidence(request);
    const prompt = this.buildPrompt(request, evidence);
    const output = await this.writer.write(prompt);
    const { document, warnings } = this.parseWriterOutput(output, evidence);
    return { document, evidence, warnings, writerId: this.writer.id };
  }

  private toDocument(
    draft: WriterDraft,
    evidence: EvidenceItem[],
  ): { document: OfficeDocument; warnings: string[] } {
    const byRef = new Map(evidence.map((item) => [item.refId, item]));
    const warnings: string[] = [];
    const blocks: DocumentBlock[] = [];
    let counter = 0;
    const nextId = () => `b${++counter}`;

    for (const block of draft.blocks) {
      if (block.type === "citation") {
        const item = byRef.get(block.refId);
        if (!item) {
          warnings.push(`已丢弃引用块:未知的证据编号 ${block.refId}(绝不编造来源)`);
          continue;
        }
        blocks.push({
          type: "citation",
          id: nextId(),
          text: block.text,
          source: { label: item.label, locator: item.locator, kind: item.kind },
        });
      } else if (block.type === "heading") {
        blocks.push({ type: "heading", id: nextId(), level: block.level, text: block.text });
      } else if (block.type === "paragraph") {
        blocks.push({ type: "paragraph", id: nextId(), text: block.text });
      } else if (block.type === "list") {
        blocks.push({ type: "list", id: nextId(), ordered: block.ordered, items: block.items });
      } else {
        blocks.push({ type: "table", id: nextId(), header: block.header, rows: block.rows });
      }
    }

    if (evidence.length > 0 && !blocks.some((block) => block.type === "citation")) {
      warnings.push("草稿未包含任何有效引用块");
    }

    return {
      document: officeDocumentSchema.parse({
        schemaVersion: 1,
        title: draft.title,
        style: "standard",
        blocks,
      }),
      warnings,
    };
  }
}
