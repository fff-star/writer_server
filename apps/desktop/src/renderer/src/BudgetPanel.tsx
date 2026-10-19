import { useState, type FormEvent } from "react";

type BudgetQuarter = {
  quarter: string;
  totalCents: string;
  calculation: string;
};

type BudgetAnomaly = {
  kind: "increase" | "decrease" | "negative";
  quarter: string;
  message: string;
};

type BudgetResponse = {
  budget: {
    quarters: BudgetQuarter[];
    anomalies: BudgetAnomaly[];
  };
  web:
    | {
        available: true;
        collection: {
          sources: Array<{ title: string; url: string }>;
          failures: Array<{ url: string; error: string }>;
        };
      }
    | { available: false; reason: string };
  subagents: Array<{ type: string; role: string; message?: string }>;
};

function amount(cents: string): string {
  const value = BigInt(cents);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? "-" : ""}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}

export function BudgetPanel() {
  const [query, setQuery] = useState("预算");
  const [report, setReport] = useState<BudgetResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setReport((await window.officeAgent.analysis.analyzeBudget(query)) as BudgetResponse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="budget-panel" aria-labelledby="budget-title">
      <div className="library-heading">
        <div>
          <p className="eyebrow">DETERMINISTIC ANALYSIS</p>
          <h2 id="budget-title">预算汇总与异常</h2>
        </div>
      </div>
      <form className="library-search" onSubmit={analyze}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="联网研究主题"
          placeholder="联网研究主题"
        />
        <button type="submit" disabled={busy}>
          {busy ? "分析中" : "分析预算"}
        </button>
      </form>
      {error && <p className="library-message">{error}</p>}
      {report && (
        <div className="budget-results">
          <div className="snapshot-list">
            {report.budget.quarters.map((quarter) => (
              <article key={quarter.quarter}>
                <strong>
                  {quarter.quarter} · {amount(quarter.totalCents)} 元
                </strong>
                <span>{quarter.calculation}</span>
              </article>
            ))}
            {report.budget.quarters.length === 0 && (
              <p className="library-message">资料库中没有可识别的季度预算。</p>
            )}
          </div>
          {report.budget.anomalies.length > 0 && (
            <div className="search-results">
              {report.budget.anomalies.map((anomaly) => (
                <article key={`${anomaly.quarter}-${anomaly.kind}`}>
                  <strong>{anomaly.quarter} 异常</strong>
                  <span>{anomaly.message}</span>
                </article>
              ))}
            </div>
          )}
          <div className="web-status">
            {report.web.available ? (
              <>
                <strong>联网来源</strong>
                {report.web.collection.sources.map((source) => (
                  <span key={source.url}>
                    {source.title} · {source.url}
                  </span>
                ))}
                {report.web.collection.failures.map((failure) => (
                  <span key={failure.url}>获取失败：{failure.url}</span>
                ))}
              </>
            ) : (
              <span>联网研究不可用：{report.web.reason}</span>
            )}
          </div>
          <details className="document-text-state">
            <summary>Subagent 执行记录</summary>
            <pre>
              {report.subagents
                .map(
                  (event) =>
                    `${event.role}:${event.type}${event.message ? ` ${event.message}` : ""}`,
                )
                .join("\n")}
            </pre>
          </details>
        </div>
      )}
    </section>
  );
}
