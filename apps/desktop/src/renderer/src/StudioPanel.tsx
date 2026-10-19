import { useEffect, useState, type FormEvent } from "react";

type CitationSource = { label: string; locator: string; kind: "local" | "web" };

type Block =
  | { type: "heading"; id: string; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; id: string; text: string }
  | { type: "list"; id: string; ordered: boolean; items: string[] }
  | { type: "table"; id: string; header: string[]; rows: string[][] }
  | { type: "citation"; id: string; text: string; source: CitationSource };

type OfficeDocument = {
  schemaVersion: 1;
  title: string;
  style: "standard";
  blocks: Block[];
};

type DocumentSummary = { id: string; title: string; createdAt: string };

type DocumentVersion = {
  id: string;
  documentId: string;
  parentId: string | null;
  authorKind: "human" | "agent";
  createdAt: string;
  document: OfficeDocument;
};

type VersionEntry = { version: DocumentVersion; conflicts: string[] };

type DraftOutcome =
  | {
      available: true;
      result: { document: OfficeDocument; warnings: string[]; writerId: string };
    }
  | { available: false; reason: string };

type SaveOutcome = { saved: true; path: string } | { saved: false; reason: string };

type LibraryHit = {
  snapshotId: string;
  snapshotName: string;
  blockIndex: number;
  text: string;
};

const blockTypeLabels: Record<Block["type"], string> = {
  heading: "标题",
  paragraph: "段落",
  list: "列表",
  table: "表格",
  citation: "引用",
};

let blockCounter = 0;
function newBlockId(): string {
  blockCounter += 1;
  return `b${Date.now().toString(36)}-${blockCounter}`;
}

function createBlock(type: Block["type"]): Block {
  const id = newBlockId();
  switch (type) {
    case "heading":
      return { type, id, level: 2, text: "" };
    case "paragraph":
      return { type, id, text: "" };
    case "list":
      return { type, id, ordered: false, items: [] };
    case "table":
      return { type, id, header: [], rows: [] };
    case "citation":
      return {
        type,
        id,
        text: "",
        source: { label: "未命名来源", locator: "未设置", kind: "local" },
      };
  }
}

function CitationPicker(props: { onPick: (label: string, locator: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LibraryHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState("");

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) {
      return;
    }
    setSearching(true);
    try {
      setResults((await window.officeAgent.library.search(query.trim())) as LibraryHit[]);
      setNote("");
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="citation-picker">
      <form className="library-search" onSubmit={search}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="检索资料库以选择来源"
          aria-label="检索资料库以选择来源"
        />
        <button type="submit" disabled={searching}>
          检索
        </button>
      </form>
      {note && <p className="library-message">{note}</p>}
      {results.length > 0 && (
        <div className="citation-picker-results">
          {results.map((result, index) => (
            <article key={`${result.snapshotId}-${result.blockIndex}-${index}`}>
              <span>{result.text}</span>
              <button
                type="button"
                onClick={() =>
                  props.onPick(
                    result.snapshotName,
                    `local:${result.snapshotId}:${result.blockIndex}`,
                  )
                }
              >
                引用
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function BlockEditor(props: {
  block: Block;
  onChange: (block: Block) => void;
  onRemove: () => void;
}) {
  const { block } = props;
  return (
    <div className="studio-block" data-block-type={block.type}>
      <div className="studio-block-head">
        <span>{blockTypeLabels[block.type]}</span>
        <button type="button" onClick={props.onRemove}>
          删除
        </button>
      </div>
      {block.type === "heading" && (
        <>
          <select
            value={block.level}
            onChange={(event) =>
              props.onChange({ ...block, level: Number(event.target.value) as 1 | 2 | 3 })
            }
            aria-label="标题级别"
          >
            <option value={1}>一级标题</option>
            <option value={2}>二级标题</option>
            <option value={3}>三级标题</option>
          </select>
          <input
            value={block.text}
            onChange={(event) => props.onChange({ ...block, text: event.target.value })}
            placeholder="标题文字"
            aria-label="标题文字"
          />
        </>
      )}
      {block.type === "paragraph" && (
        <textarea
          value={block.text}
          onChange={(event) => props.onChange({ ...block, text: event.target.value })}
          placeholder="段落文字"
          aria-label="段落文字"
        />
      )}
      {block.type === "list" && (
        <>
          <label className="studio-inline-option">
            <input
              type="checkbox"
              checked={block.ordered}
              onChange={(event) => props.onChange({ ...block, ordered: event.target.checked })}
            />
            有序列表
          </label>
          <textarea
            value={block.items.join("\n")}
            onChange={(event) =>
              props.onChange({ ...block, items: event.target.value.split("\n") })
            }
            placeholder="每行一个列表项"
            aria-label="列表项"
          />
        </>
      )}
      {block.type === "table" && (
        <>
          <input
            value={block.header.join(" | ")}
            onChange={(event) =>
              props.onChange({
                ...block,
                header: event.target.value.split("|").map((c) => c.trim()),
              })
            }
            placeholder="表头，用 | 分隔"
            aria-label="表头"
          />
          <textarea
            value={block.rows.map((row) => row.join(" | ")).join("\n")}
            onChange={(event) =>
              props.onChange({
                ...block,
                rows: event.target.value
                  .split("\n")
                  .filter((line) => line.length > 0)
                  .map((line) => line.split("|").map((c) => c.trim())),
              })
            }
            placeholder="每行一条记录，单元格用 | 分隔"
            aria-label="表格内容"
          />
        </>
      )}
      {block.type === "citation" && (
        <>
          <textarea
            value={block.text}
            onChange={(event) => props.onChange({ ...block, text: event.target.value })}
            placeholder="引文或事实陈述"
            aria-label="引文或事实陈述"
          />
          <div className="studio-citation-source">
            <select
              value={block.source.kind}
              onChange={(event) =>
                props.onChange({
                  ...block,
                  source: { ...block.source, kind: event.target.value as "local" | "web" },
                })
              }
              aria-label="来源类型"
            >
              <option value="local">本地资料</option>
              <option value="web">网络来源</option>
            </select>
            <input
              value={block.source.label}
              onChange={(event) =>
                props.onChange({ ...block, source: { ...block.source, label: event.target.value } })
              }
              placeholder="来源名称"
              aria-label="来源名称"
            />
            <input
              value={block.source.locator}
              onChange={(event) =>
                props.onChange({
                  ...block,
                  source: { ...block.source, locator: event.target.value },
                })
              }
              placeholder="来源定位（如 local:快照ID:块序号 或 URL）"
              aria-label="来源定位"
            />
          </div>
          <CitationPicker
            onPick={(label, locator) =>
              props.onChange({ ...block, source: { label, locator, kind: "local" } })
            }
          />
        </>
      )}
    </div>
  );
}

export function StudioPanel() {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<OfficeDocument | null>(null);
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [draftTopic, setDraftTopic] = useState("");
  const [agentDraft, setAgentDraft] = useState<OfficeDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("选择或新建文档开始编辑");

  const refreshDocuments = async () => {
    setDocuments((await window.officeAgent.studio.listDocuments()) as DocumentSummary[]);
  };

  const loadVersions = async (documentId: string) => {
    const list = (await window.officeAgent.studio.listVersions(documentId)) as DocumentVersion[];
    const entries = await Promise.all(
      list.map(async (version) => ({
        version,
        conflicts: await window.officeAgent.studio.listConflicts(version.id),
      })),
    );
    setVersions(entries);
  };

  const selectDocument = async (documentId: string) => {
    setBusy(true);
    try {
      const latest = (await window.officeAgent.studio.latestVersion(
        documentId,
      )) as DocumentVersion | null;
      if (!latest) {
        setMessage("该文档还没有任何版本");
        return;
      }
      setSelectedId(documentId);
      setDraft(latest.document);
      setDraftTopic(latest.document.title);
      setAgentDraft(null);
      await loadVersions(documentId);
      setMessage(`正在编辑「${latest.document.title}」`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refreshDocuments();
  }, []);

  const createDocument = async (event: FormEvent) => {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title) {
      return;
    }
    setBusy(true);
    try {
      const version = (await window.officeAgent.studio.createDocument({
        schemaVersion: 1,
        title,
        style: "standard",
        blocks: [],
      })) as DocumentVersion;
      setNewTitle("");
      await refreshDocuments();
      setMessage(`已创建「${title}」`);
      await selectDocument(version.documentId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const updateBlock = (id: string, next: Block) => {
    setDraft((current) =>
      current
        ? { ...current, blocks: current.blocks.map((block) => (block.id === id ? next : block)) }
        : current,
    );
  };

  const removeBlock = (id: string) => {
    setDraft((current) =>
      current ? { ...current, blocks: current.blocks.filter((block) => block.id !== id) } : current,
    );
  };

  const addBlock = (type: Block["type"]) => {
    setDraft((current) =>
      current ? { ...current, blocks: [...current.blocks, createBlock(type)] } : current,
    );
  };

  const saveVersion = async () => {
    if (!selectedId || !draft) {
      return;
    }
    setBusy(true);
    try {
      const version = (await window.officeAgent.studio.appendVersion(
        selectedId,
        draft,
      )) as DocumentVersion;
      await loadVersions(selectedId);
      await refreshDocuments();
      setMessage(`已保存人工版本（${version.createdAt}）`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const requestDraft = async (event: FormEvent) => {
    event.preventDefault();
    const topic = draftTopic.trim();
    if (!topic) {
      return;
    }
    setBusy(true);
    try {
      const outcome = (await window.officeAgent.studio.draft({ topic })) as DraftOutcome;
      if (!outcome.available) {
        setAgentDraft(null);
        setMessage(`自动起草不可用：${outcome.reason}`);
        return;
      }
      setAgentDraft(outcome.result.document);
      setMessage(
        `草稿已生成（${outcome.result.writerId}），警告 ${outcome.result.warnings.length} 条`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const mergeAgentDraft = async () => {
    if (!selectedId || !agentDraft) {
      return;
    }
    setBusy(true);
    try {
      const result = (await window.officeAgent.studio.appendAgentRevision(
        selectedId,
        agentDraft,
      )) as { version: DocumentVersion; conflicts: string[] };
      setAgentDraft(null);
      setDraft(result.version.document);
      await loadVersions(selectedId);
      setMessage(
        result.conflicts.length > 0
          ? `已合并 Agent 修订，存在 ${result.conflicts.length} 个冲突块：${result.conflicts.join("、")}`
          : "已合并 Agent 修订，无冲突",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const exportFile = async (kind: "docx" | "pdf") => {
    if (!selectedId) {
      return;
    }
    setBusy(true);
    try {
      const outcome = (
        kind === "docx"
          ? await window.officeAgent.studio.exportDocx({ documentId: selectedId })
          : await window.officeAgent.exportDocumentPdfFile({
              documentId: selectedId,
            })
      ) as SaveOutcome;
      setMessage(outcome.saved ? `已导出到 ${outcome.path}` : "已取消导出");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="studio-panel" aria-labelledby="studio-title">
      <div className="library-heading">
        <div>
          <p className="eyebrow">DOCUMENT STUDIO</p>
          <h2 id="studio-title">文档工作台</h2>
        </div>
      </div>
      <p className="library-message" data-testid="studio-message">
        {message}
      </p>
      <form className="library-search" onSubmit={createDocument}>
        <input
          value={newTitle}
          onChange={(event) => setNewTitle(event.target.value)}
          placeholder="新文档标题"
          aria-label="新文档标题"
        />
        <button type="submit" disabled={busy || !newTitle.trim()}>
          新建文档
        </button>
      </form>
      {documents.length > 0 && (
        <div className="snapshot-list">
          {documents.map((document) => (
            <article
              key={document.id}
              className="studio-doc"
              data-selected={document.id === selectedId}
              onClick={() => void selectDocument(document.id)}
            >
              <strong>{document.title}</strong>
              <span>{document.createdAt}</span>
            </article>
          ))}
        </div>
      )}
      {draft && (
        <div className="studio-editor">
          <div className="library-search">
            <input
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              placeholder="文档标题"
              aria-label="文档标题"
            />
          </div>
          <div className="studio-toolbar">
            <button type="button" onClick={() => addBlock("heading")} disabled={busy}>
              添加标题
            </button>
            <button type="button" onClick={() => addBlock("paragraph")} disabled={busy}>
              添加段落
            </button>
            <button type="button" onClick={() => addBlock("list")} disabled={busy}>
              添加列表
            </button>
            <button type="button" onClick={() => addBlock("table")} disabled={busy}>
              添加表格
            </button>
            <button type="button" onClick={() => addBlock("citation")} disabled={busy}>
              添加引用
            </button>
          </div>
          <div className="studio-blocks">
            {draft.blocks.map((block) => (
              <BlockEditor
                key={block.id}
                block={block}
                onChange={(next) => updateBlock(block.id, next)}
                onRemove={() => removeBlock(block.id)}
              />
            ))}
          </div>
          <div className="studio-toolbar">
            <button type="button" onClick={saveVersion} disabled={busy}>
              保存版本
            </button>
            <button type="button" onClick={() => void exportFile("docx")} disabled={busy}>
              导出 DOCX
            </button>
            <button type="button" onClick={() => void exportFile("pdf")} disabled={busy}>
              导出 PDF
            </button>
          </div>
          <form className="library-search" onSubmit={requestDraft}>
            <input
              value={draftTopic}
              onChange={(event) => setDraftTopic(event.target.value)}
              placeholder="起草主题"
              aria-label="起草主题"
            />
            <button type="submit" disabled={busy || !draftTopic.trim()}>
              请求 Agent 草稿
            </button>
          </form>
          {agentDraft && (
            <div className="studio-toolbar">
              <button type="button" onClick={mergeAgentDraft} disabled={busy}>
                合并 Agent 修订
              </button>
            </div>
          )}
          {versions.length > 0 && (
            <div className="snapshot-list">
              {versions.map(({ version, conflicts }, index) => (
                <article key={version.id}>
                  <strong>
                    版本 {index + 1} · {version.authorKind === "human" ? "人工" : "Agent"} ·{" "}
                    {version.createdAt}
                  </strong>
                  <span>
                    父版本 {version.parentId ?? "无"}
                    {conflicts.length > 0 ? ` · 冲突块：${conflicts.join("、")}` : ""}
                  </span>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
