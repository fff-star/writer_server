import { describe, expect, it } from "vitest";
import { aggregateBudget } from "./budget.js";

describe("aggregateBudget", () => {
  it("sums quarters with integer cents and explains every calculation", () => {
    const report = aggregateBudget([
      {
        snapshotId: "a",
        blockIndex: 0,
        kind: "table-cell",
        text: "第一季度支出 1,200.50元",
        locator: { kind: "cell", sheet: "预算", cell: "B2" },
      },
      {
        snapshotId: "a",
        blockIndex: 1,
        kind: "paragraph",
        text: "Q1 追加 0.5万元",
        locator: { kind: "block", block: "paragraph-4" },
      },
      {
        snapshotId: "b",
        blockIndex: 0,
        kind: "paragraph",
        text: "第二季度支出 2000元",
        locator: { kind: "page", page: 2 },
      },
    ]);

    expect(report.quarters).toHaveLength(2);
    expect(report.quarters[0]?.totalCents).toBe("620050");
    expect(report.quarters[0]?.calculation).toBe("Q1 = 1200.50 + 5000.00 = 6200.50");
    expect(report.quarters[0]?.evidence[0]?.locator).toEqual({
      kind: "cell",
      sheet: "预算",
      cell: "B2",
    });
  });

  it("detects significant deterministic changes and negative totals", () => {
    const report = aggregateBudget([
      {
        snapshotId: "a",
        blockIndex: 0,
        kind: "text",
        text: "Q1 2000元",
        locator: { kind: "line", line: 1 },
      },
      {
        snapshotId: "a",
        blockIndex: 1,
        kind: "text",
        text: "Q2 5000元",
        locator: { kind: "line", line: 2 },
      },
      {
        snapshotId: "a",
        blockIndex: 2,
        kind: "text",
        text: "Q3 -100元",
        locator: { kind: "line", line: 3 },
      },
    ]);

    expect(report.anomalies.map((item) => item.kind)).toEqual(["increase", "negative", "decrease"]);
    expect(report.anomalies[0]?.changeRatio).toBeCloseTo(1.5);
    expect(report.anomalies[0]?.evidence).toHaveLength(2);
  });
});
