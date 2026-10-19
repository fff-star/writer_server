import type {
  BudgetAnomaly,
  BudgetEvidence,
  BudgetQuarter,
  BudgetReport,
} from "@office-agent/contracts";
import type { StoredBlock } from "@office-agent/library";

const quarterPattern = /(?:Q([1-4])|第?\s*([一二三四1234])\s*季度)/i;
const amountPattern = /(-?\d[\d,]*(?:\.\d+)?)\s*(亿元|亿|百万元|百万|万元|万|千元|千|元)?/g;
const multipliers: Record<string, bigint> = {
  元: 1n,
  千: 1_000n,
  千元: 1_000n,
  万: 10_000n,
  万元: 10_000n,
  百万: 1_000_000n,
  百万元: 1_000_000n,
  亿: 100_000_000n,
  亿元: 100_000_000n,
};
const chineseQuarters: Record<string, string> = {
  一: "1",
  二: "2",
  三: "3",
  四: "4",
};

function parseAmount(raw: string, unit: string | undefined): bigint {
  const normalized = raw.replaceAll(",", "");
  const [whole = "0", fraction = ""] = normalized.split(".");
  const cents = BigInt(whole) * 100n + BigInt(`${fraction}00`.slice(0, 2));
  return cents * (multipliers[unit ?? "元"] ?? 1n);
}

function quarterFromText(text: string): string | undefined {
  const match = quarterPattern.exec(text);
  const quarter = match?.[1] ?? chineseQuarters[match?.[2] ?? ""];
  return quarter ? `Q${quarter}` : undefined;
}

function evidenceFromBlock(block: StoredBlock, quarter: string): BudgetEvidence[] {
  const evidence: BudgetEvidence[] = [];
  const textWithoutQuarter = block.text.replace(quarterPattern, " ");
  amountPattern.lastIndex = 0;
  for (const match of textWithoutQuarter.matchAll(amountPattern)) {
    evidence.push({
      snapshotId: block.snapshotId,
      quarter,
      amountCents: parseAmount(match[1] ?? "0", match[2]).toString(),
      text: block.text,
      locator: block.locator,
    });
  }
  return evidence;
}

function formatAmount(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  return `${negative ? "-" : ""}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}

export function aggregateBudget(blocks: StoredBlock[]): BudgetReport {
  const byQuarter = new Map<string, BudgetEvidence[]>();
  for (const block of blocks) {
    const quarter = quarterFromText(block.text);
    if (!quarter) {
      continue;
    }
    const evidence = evidenceFromBlock(block, quarter);
    if (evidence.length > 0) {
      byQuarter.set(quarter, [...(byQuarter.get(quarter) ?? []), ...evidence]);
    }
  }

  const quarters: BudgetQuarter[] = [...byQuarter.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([quarter, evidence]) => {
      const total = evidence.reduce((sum, item) => sum + BigInt(item.amountCents), 0n);
      return {
        quarter,
        totalCents: total.toString(),
        calculation: `${quarter} = ${evidence.map((item) => formatAmount(BigInt(item.amountCents))).join(" + ")} = ${formatAmount(total)}`,
        evidence,
      };
    });

  const anomalies: BudgetAnomaly[] = [];
  quarters.forEach((quarter, index) => {
    const total = BigInt(quarter.totalCents);
    if (total < 0n) {
      anomalies.push({
        kind: "negative",
        quarter: quarter.quarter,
        message: `${quarter.quarter} total is negative (${formatAmount(total)})`,
        evidence: quarter.evidence,
      });
    }
    if (index === 0) {
      return;
    }
    const previous = quarters[index - 1]!;
    const previousTotal = BigInt(previous.totalCents);
    if (previousTotal <= 0n) {
      return;
    }
    const difference = total - previousTotal;
    const absoluteDifference = difference < 0n ? -difference : difference;
    const ratio = Number((absoluteDifference * 10_000n) / previousTotal) / 10_000;
    if (ratio > 0.3 && absoluteDifference > 100_000n) {
      anomalies.push({
        kind: difference > 0n ? "increase" : "decrease",
        quarter: quarter.quarter,
        message: `${quarter.quarter} changed by ${(ratio * 100).toFixed(1)}% compared with ${previous.quarter}`,
        changeRatio: ratio,
        evidence: [...previous.evidence, ...quarter.evidence],
      });
    }
  });

  return { quarters, anomalies };
}
