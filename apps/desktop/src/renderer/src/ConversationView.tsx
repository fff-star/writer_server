import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  agentPayload,
  dispatch,
  newMessageId,
  type AgentMessage,
  type AgentPayload,
} from "./intent-dispatch";

type Message = { id: string; role: "user"; text: string } | AgentMessage;

type StoredMessage = {
  id: string;
  projectId: string;
  role: "user" | "agent";
  text: string;
  payload: AgentPayload | null;
  createdAt: string;
};

function errorText(action: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `${action}失败：${detail}。请检查资料库与设置后重试。`;
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
