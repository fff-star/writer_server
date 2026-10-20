import { afterEach, describe, expect, it, vi } from "vitest";
import { agentPayload, amount, dispatch, locatorText, type AgentMessage } from "./intent-dispatch";

const emptyBudgetReport = {
  budget: { quarters: [], anomalies: [] },
  web: { available: false, reason: "BRAVE_SEARCH_API_KEY is not configured" },
};

type StubResponses = {
  budget?: unknown;
  hits?: unknown;
  draft?: unknown;
};

function stubOfficeAgent(responses: StubResponses = {}) {
  const stubs = {
    analyzeBudget: vi.fn(() => Promise.resolve(responses.budget ?? emptyBudgetReport)),
    search: vi.fn(() => Promise.resolve(responses.hits ?? [])),
    draft: vi.fn(() =>
      Promise.resolve(
        responses.draft ?? { available: true, result: { warnings: [], writerId: "stub-writer" } },
      ),
    ),
  };
  vi.stubGlobal("window", {
    officeAgent: {
      analysis: { analyzeBudget: stubs.analyzeBudget },
      library: { search: stubs.search },
      studio: { draft: stubs.draft },
    },
  });
  return stubs;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dispatch", () => {
  it.each(["汇总各季度预算", "核对一下预算数据"])(
    "routes budget keywords to budget analysis: %s",
    async (query) => {
      const stubs = stubOfficeAgent({
        budget: {
          budget: {
            quarters: [{ quarter: "2024Q1", totalCents: "12345", calculation: "100.00 + 23.45" }],
            anomalies: [{ kind: "increase", quarter: "2024Q2", message: "环比增长超过 50%" }],
          },
          web: {
            available: true,
            collection: {
              sources: [{ title: "预算政策", url: "https://example.com/policy" }],
              failures: [],
            },
          },
        },
      });
      const reply = await dispatch(query);
      expect(stubs.analyzeBudget).toHaveBeenCalledWith(query);
      expect(stubs.search).not.toHaveBeenCalled();
      expect(stubs.draft).not.toHaveBeenCalled();
      expect(reply.rows?.[0]).toEqual({
        title: "2024Q1 · 123.45 元",
        detail: "100.00 + 23.45",
      });
      expect(reply.citations).toEqual([
        { label: "预算政策", locator: "https://example.com/policy" },
      ]);
    },
  );

  it.each(["搜索报销标准", "查找合同模板", "资料库里有什么"])(
    "routes search keywords to library search: %s",
    async (query) => {
      const stubs = stubOfficeAgent({
        hits: [
          {
            snapshotName: "报销制度.txt",
            text: "差旅报销标准为每天 200 元",
            locator: { kind: "line", line: 3 },
          },
        ],
      });
      const reply = await dispatch(query);
      expect(stubs.search).toHaveBeenCalledWith(query);
      expect(stubs.analyzeBudget).not.toHaveBeenCalled();
      expect(stubs.draft).not.toHaveBeenCalled();
      expect(reply.text).toBe("找到 1 条匹配资料。");
      expect(reply.rows).toEqual([
        { title: "差旅报销标准为每天 200 元", detail: "报销制度.txt · 第 3 行" },
      ]);
    },
  );

  it("prioritizes budget over search when both keywords appear", async () => {
    const stubs = stubOfficeAgent();
    await dispatch("汇总资料");
    expect(stubs.analyzeBudget).toHaveBeenCalledTimes(1);
    expect(stubs.search).not.toHaveBeenCalled();
  });

  it("prioritizes research over drafting when both keywords appear", async () => {
    const stubs = stubOfficeAgent();
    await dispatch("研究怎么写年度总结");
    expect(stubs.analyzeBudget).toHaveBeenCalledTimes(1);
    expect(stubs.draft).not.toHaveBeenCalled();
  });

  it.each(["研究差旅政策", "整理网页上的规定", "检索公开来源"])(
    "routes research keywords to web research: %s",
    async (query) => {
      const stubs = stubOfficeAgent({
        budget: {
          budget: { quarters: [], anomalies: [] },
          web: {
            available: true,
            collection: {
              sources: [{ title: "差旅政策解读", url: "https://example.com/policy" }],
              failures: [{ url: "https://example.com/down", error: "HTTP 500" }],
            },
          },
        },
      });
      const reply = await dispatch(query);
      expect(stubs.analyzeBudget).toHaveBeenCalledWith(query);
      expect(reply.text).toBe("联网检索完成，获得 1 个来源，1 个获取失败。");
      expect(reply.rows).toEqual([{ title: "获取失败", detail: "https://example.com/down" }]);
      expect(reply.citations).toEqual([
        { label: "差旅政策解读", locator: "https://example.com/policy" },
      ]);
    },
  );

  it("surfaces the unavailable reason when web research is unavailable", async () => {
    stubOfficeAgent({
      budget: {
        budget: { quarters: [], anomalies: [] },
        web: { available: false, reason: "BRAVE_SEARCH_API_KEY is not configured" },
      },
    });
    const reply = await dispatch("研究差旅政策");
    expect(reply.text).toBe("联网研究不可用：BRAVE_SEARCH_API_KEY is not configured。");
    expect(reply.rows).toBeUndefined();
    expect(reply.citations).toBeUndefined();
  });

  it.each(["起草季度总结", "帮我写作一封邮件", "写一个通知"])(
    "routes draft keywords to studio drafting: %s",
    async (query) => {
      const stubs = stubOfficeAgent({
        draft: { available: true, result: { warnings: ["格式警告"], writerId: "stub-writer" } },
      });
      const reply = await dispatch(query);
      expect(stubs.draft).toHaveBeenCalledWith({ topic: query });
      expect(stubs.analyzeBudget).not.toHaveBeenCalled();
      expect(reply.text).toContain("草稿已生成（stub-writer），警告 1 条。");
    },
  );

  it("surfaces the reason when drafting is unavailable", async () => {
    stubOfficeAgent({ draft: { available: false, reason: "请先在设置中配置模型" } });
    const reply = await dispatch("起草季度总结");
    expect(reply.text).toBe("请先在设置中配置模型");
  });

  it("returns a guidance reply when the search finds nothing", async () => {
    const stubs = stubOfficeAgent({ hits: [] });
    const reply = await dispatch("搜索不存在的资料");
    expect(stubs.search).toHaveBeenCalledTimes(1);
    expect(reply.text).toBe("没有找到匹配的资料。请先在资料库中导入文件，或换一个关键词。");
    expect(reply.rows).toBeUndefined();
  });

  it("falls back to the help list without calling IPC", async () => {
    const stubs = stubOfficeAgent();
    const reply = await dispatch("你好");
    expect(stubs.analyzeBudget).not.toHaveBeenCalled();
    expect(stubs.search).not.toHaveBeenCalled();
    expect(stubs.draft).not.toHaveBeenCalled();
    expect(reply.text).toBe("直接说出你想做的事，目前可以：");
    expect(reply.list).toHaveLength(4);
  });
});

describe("amount", () => {
  it("formats cent strings as yuan with two decimals", () => {
    expect(amount("12345")).toBe("123.45");
    expect(amount("5")).toBe("0.05");
    expect(amount("0")).toBe("0.00");
    expect(amount("-50")).toBe("-0.50");
    expect(amount("-100000")).toBe("-1000.00");
  });
});

describe("locatorText", () => {
  it("renders each locator kind", () => {
    expect(locatorText({ kind: "cell", sheet: "Sheet1", cell: "B2" })).toBe("Sheet1!B2");
    expect(locatorText({ kind: "cell", cell: "A1" })).toBe("A1");
    expect(locatorText({ kind: "page", page: 3 })).toBe("第 3 页");
    expect(locatorText({ kind: "line", line: 7 })).toBe("第 7 行");
    expect(locatorText({ kind: "block", block: "paragraph-2" })).toBe("paragraph-2");
    expect(locatorText({ kind: "file" })).toBe("file");
    expect(locatorText({})).toBe("文件");
  });
});

describe("agentPayload", () => {
  const base: AgentMessage = { id: "m1", role: "agent", text: "回复" };

  it("returns null when there is no structured content", () => {
    expect(agentPayload(base)).toBeNull();
    expect(agentPayload({ ...base, rows: [], list: [], citations: [] })).toBeNull();
  });

  it("omits empty arrays and keeps populated fields", () => {
    const rows = [{ title: "t", detail: "d" }];
    const citations = [{ label: "l", locator: "u" }];
    expect(agentPayload({ ...base, rows, list: [], citations })).toEqual({ rows, citations });
    expect(agentPayload({ ...base, list: ["条目"] })).toEqual({ list: ["条目"] });
  });
});
