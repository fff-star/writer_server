import { useEffect, useRef, useState, type FormEvent } from "react";

type Citation = { label: string; locator: string };

type ResultRow = { title: string; detail: string };

type AgentPayload = {
  rows?: ResultRow[];
  list?: string[];
  citations?: Citation[];
};

type AgentMessage = {
  id: string;
  role: "agent";
  text: string;
  rows?: ResultRow[];
  list?: string[];
  citations?: Citation[];
};

type Message = { id: string; role: "user"; text: string } | AgentMessage;

type StoredMessage = {
  id: string;
  projectId: string;
  role: "user" | "agent";
  text: string;
  payload: AgentPayload | null;
  createdAt: string;
};

type BudgetQuarter = { quarter: string; totalCents: string; calculation: string };

type BudgetAnomaly = {
  kind: "increase" | "decrease" | "negative";
  quarter: string;
  message: string;
};

type BudgetResponse = {
  budget: { quarters: BudgetQuarter[]; anomalies: BudgetAnomaly[] };
  web:
    | {
        available: true;
        collection: {
          sources: Array<{ title: string; url: string }>;
          failures: Array<{ url: string; error: string }>;
        };
      }
    | { available: false; reason: string };
};

type LibraryHit = {
  snapshotName: string;
  text: string;
  locator: Record<string, string | number | undefined>;
};

type DraftOutcome =
  | { available: true; result: { warnings: string[]; writerId: string } }
  | { available: false; reason: string };

let messageCounter = 0;
function newMessageId(): string {
  messageCounter += 1;
  return `m${Date.now().toString(36)}-${messageCounter}`;
}

function amount(cents: string): string {
  const value = BigInt(cents);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? "-" : ""}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}

function locatorText(locator: LibraryHit["locator"]): string {
  if (locator["kind"] === "cell") {
    return `${locator["sheet"] ? `${locator["sheet"]}!` : ""}${locator["cell"]}`;
  }
  if (locator["kind"] === "page") {
    return `第 ${locator["page"]} 页`;
  }
  if (locator["kind"] === "line") {
    return `第 ${locator["line"]} 行`;
  }
  if (locator["kind"] === "block") {
    return String(locator["block"]);
  }
  return String(locator["kind"] ?? "文件");
}

function errorText(action: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `${action}失败：${detail}。请检查资料库与设置后重试。`;
}

function agentPayload(message: AgentMessage): AgentPayload | null {
  const payload: AgentPayload = {};
  if (message.rows && message.rows.length > 0) {
    payload.rows = message.rows;
  }
  if (message.list && message.list.length > 0) {
    payload.list = message.list;
  }
  if (message.citations && message.citations.length > 0) {
    payload.citations = message.citations;
  }
  return Object.keys(payload).length > 0 ? payload : null;
}

function storedToMessage(stored: StoredMessage): Message {
  if (stored.role === "user") {
    return { id: stored.id, role: "user", text: stored.text };
  }
  const payload = stored.payload ?? {};
  return {
    id: stored.id,
    role: "agent",
    text: stored.text,
    ...(payload.rows ? { rows: payload.rows } : {}),
    ...(payload.list ? { list: payload.list } : {}),
    ...(payload.citations ? { citations: payload.citations } : {}),
  };
}

async function budgetReply(query: string): Promise<AgentMessage> {
  const report = (await window.officeAgent.analysis.analyzeBudget(query)) as BudgetResponse;
  const rows: ResultRow[] = [
    ...report.budget.quarters.map((quarter) => ({
      title: `${quarter.quarter} · ${amount(quarter.totalCents)} 元`,
      detail: quarter.calculation,
    })),
    ...report.budget.anomalies.map((anomaly) => ({
      title: `${anomaly.quarter} 异常`,
      detail: anomaly.message,
    })),
  ];
  const citations: Citation[] = report.web.available
    ? report.web.collection.sources.map((source) => ({ label: source.title, locator: source.url }))
    : [];
  let text = `识别到 ${report.budget.quarters.length} 个季度预算、${report.budget.anomalies.length} 条异常。`;
  if (report.budget.quarters.length === 0) {
    text = "资料库中没有可识别的季度预算。请先在资料库中导入包含预算数据的文件。";
  }
  if (!report.web.available) {
    text += `联网来源不可用：${report.web.reason}。`;
  }
  return { id: newMessageId(), role: "agent", text, rows, citations };
}

async function searchReply(query: string): Promise<AgentMessage> {
  const hits = (await window.officeAgent.library.search(query)) as LibraryHit[];
  if (hits.length === 0) {
    return {
      id: newMessageId(),
      role: "agent",
      text: "没有找到匹配的资料。请先在资料库中导入文件，或换一个关键词。",
    };
  }
  return {
    id: newMessageId(),
    role: "agent",
    text: `找到 ${hits.length} 条匹配资料。`,
    rows: hits.map((hit) => ({
      title: hit.text,
      detail: `${hit.snapshotName} · ${locatorText(hit.locator)}`,
    })),
  };
}

async function researchReply(query: string): Promise<AgentMessage> {
  const report = (await window.officeAgent.analysis.analyzeBudget(query)) as BudgetResponse;
  if (!report.web.available) {
    return {
      id: newMessageId(),
      role: "agent",
      text: `联网研究不可用：${report.web.reason}。`,
    };
  }
  const { sources, failures } = report.web.collection;
  return {
    id: newMessageId(),
    role: "agent",
    text: `联网检索完成，获得 ${sources.length} 个来源${failures.length > 0 ? `，${failures.length} 个获取失败` : ""}。`,
    rows: failures.map((failure) => ({ title: "获取失败", detail: failure.url })),
    citations: sources.map((source) => ({ label: source.title, locator: source.url })),
  };
}

async function draftReply(query: string): Promise<AgentMessage> {
  const outcome = (await window.officeAgent.studio.draft({ topic: query })) as DraftOutcome;
  if (!outcome.available) {
    return { id: newMessageId(), role: "agent", text: outcome.reason };
  }
  return {
    id: newMessageId(),
    role: "agent",
    text: `草稿已生成（${outcome.result.writerId}），警告 ${outcome.result.warnings.length} 条。草稿暂不回写文档，请在文档标签页中继续。`,
  };
}

function fallbackReply(): AgentMessage {
  return {
    id: newMessageId(),
    role: "agent",
    text: "直接说出你想做的事，目前可以：",
    list: [
      "汇总预算并标记异常，例如“汇总各季度预算”",
      "在资料库中搜索资料，例如“搜索报销标准”",
      "就某个主题联网检索，例如“研究差旅政策”",
      "起草文档草稿，例如“起草季度总结”（需先在设置中配置模型）",
    ],
  };
}

async function dispatch(query: string): Promise<AgentMessage> {
  if (query.includes("预算") || query.includes("汇总")) {
    return budgetReply(query);
  }
  if (query.includes("搜索") || query.includes("查找") || query.includes("资料")) {
    return searchReply(query);
  }
  if (query.includes("研究") || query.includes("网页") || query.includes("检索")) {
    return researchReply(query);
  }
  if (query.includes("起草") || query.includes("写作") || query.includes("写")) {
    return draftReply(query);
  }
  return fallbackReply();
}

function AgentBubble({ message }: { message: AgentMessage }) {
  return (
    <div className="message message-agent">
      <p className="message-text">{message.text}</p>
      {message.list && (
        <ul className="message-list">
          {message.list.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      {message.rows && message.rows.length > 0 && (
        <div className="message-rows">
          {message.rows.map((row, index) => (
            <div className="message-row" key={`${row.title}-${index}`}>
              <strong>{row.title}</strong>
              <span>{row.detail}</span>
            </div>
          ))}
        </div>
      )}
      {message.citations && message.citations.length > 0 && (
        <div className="message-citations">
          {message.citations.map((citation, index) => (
            <div className="message-citation" key={`${citation.locator}-${index}`}>
              <span className="citation-marker">[{index + 1}]</span>
              <span className="citation-label">{citation.label}</span>
              <span className="citation-locator">{citation.locator}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ConversationView({ projectId }: { projectId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const thread = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    window.officeAgent.conversation
      .list(projectId)
      .then((stored) => {
        if (!cancelled) {
          setMessages((stored as StoredMessage[]).map(storedToMessage));
          setLoadError("");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(errorText("加载对话记录", error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    const node = thread.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [messages]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const query = input.trim();
    if (!query || busy) {
      return;
    }
    setInput("");
    setBusy(true);
    const pendingId = newMessageId();
    try {
      const storedUser = (await window.officeAgent.conversation.append(projectId, {
        role: "user",
        text: query,
      })) as StoredMessage;
      setMessages((current) => [
        ...current,
        { id: storedUser.id, role: "user", text: query },
        { id: pendingId, role: "agent", text: "正在处理…" },
      ]);
      const reply = await dispatch(query);
      const storedReply = (await window.officeAgent.conversation.append(projectId, {
        role: "agent",
        text: reply.text,
        payload: agentPayload(reply),
      })) as StoredMessage;
      setMessages((current) =>
        current.map((entry) => (entry.id === pendingId ? { ...reply, id: storedReply.id } : entry)),
      );
    } catch (error) {
      setMessages((current) => [
        ...current.filter((entry) => entry.id !== pendingId),
        { id: pendingId, role: "agent", text: errorText("处理请求", error) },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="conversation-view" aria-label="对话">
      <div className="message-thread" ref={thread}>
        {loading ? (
          <p className="library-message">正在加载对话记录…</p>
        ) : loadError ? (
          <p className="library-message">{loadError}</p>
        ) : messages.length === 0 ? (
          <div className="conversation-empty">
            <p className="conversation-empty-title">从一句话开始。</p>
            <ul>
              <li>汇总各季度预算并标记异常</li>
              <li>搜索资料库中的报销标准</li>
              <li>研究一个需要联网来源的主题</li>
              <li>起草一篇文档草稿</li>
            </ul>
          </div>
        ) : (
          messages.map((message) =>
            message.role === "user" ? (
              <div className="message message-user" key={message.id}>
                <p className="message-text">{message.text}</p>
              </div>
            ) : (
              <AgentBubble message={message} key={message.id} />
            ),
          )
        )}
      </div>
      <form className="composer" onSubmit={send}>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="输入你的需求，例如“汇总各季度预算”"
          aria-label="输入你的需求"
        />
        <button type="submit" className="button-primary" disabled={busy || !input.trim()}>
          发送
        </button>
      </form>
    </section>
  );
}
