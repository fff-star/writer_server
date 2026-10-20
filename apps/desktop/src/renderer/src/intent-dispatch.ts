export type Citation = { label: string; locator: string };

export type ResultRow = { title: string; detail: string };

export type AgentPayload = {
  rows?: ResultRow[];
  list?: string[];
  citations?: Citation[];
};

export type AgentMessage = {
  id: string;
  role: "agent";
  text: string;
  rows?: ResultRow[];
  list?: string[];
  citations?: Citation[];
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
export function newMessageId(): string {
  messageCounter += 1;
  return `m${Date.now().toString(36)}-${messageCounter}`;
}

export function amount(cents: string): string {
  const value = BigInt(cents);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? "-" : ""}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}

export function locatorText(locator: LibraryHit["locator"]): string {
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

export function agentPayload(message: AgentMessage): AgentPayload | null {
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

export async function budgetReply(query: string): Promise<AgentMessage> {
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

export async function searchReply(query: string): Promise<AgentMessage> {
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

export async function researchReply(query: string): Promise<AgentMessage> {
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

export async function draftReply(query: string): Promise<AgentMessage> {
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

export function fallbackReply(): AgentMessage {
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

export async function dispatch(query: string): Promise<AgentMessage> {
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
