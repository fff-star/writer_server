import { useEffect, useState, type FormEvent } from "react";

type Snapshot = {
  id: string;
  originalName: string;
  extension: string;
  size: number;
  version: number;
  status: "imported" | "processing" | "indexed" | "partial" | "failed";
  error: string | null;
};

type ImportSummary = {
  imported: number;
  duplicates: number;
  failed: number;
  snapshots: Snapshot[];
};

type SearchResult = {
  snapshotName: string;
  kind: string;
  text: string;
  locator: Record<string, string | number | undefined>;
};

function locatorText(locator: SearchResult["locator"]): string {
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

export function LibraryPanel() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("尚未导入资料");

  const refresh = async () => {
    setSnapshots((await window.officeAgent.library.list()) as Snapshot[]);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const importFiles = async () => {
    setBusy(true);
    try {
      const summary = (await window.officeAgent.library.importWithDialog()) as ImportSummary;
      if (summary.snapshots.length === 0) {
        setMessage("未选择文件");
      } else {
        setMessage(
          `新增 ${summary.imported} 个，重复 ${summary.duplicates} 个，失败 ${summary.failed} 个`,
        );
      }
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) {
      return;
    }
    setBusy(true);
    try {
      setResults((await window.officeAgent.library.search(query.trim())) as SearchResult[]);
      setMessage(`检索“${query.trim()}”`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="library-panel" aria-label="受管资料库">
      <div className="panel-toolbar">
        <p className="library-message">{message}</p>
        <button type="button" className="button-primary" onClick={importFiles} disabled={busy}>
          导入文件
        </button>
      </div>
      <form className="library-search" onSubmit={search}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="检索已索引内容"
          aria-label="检索已索引内容"
        />
        <button type="submit" className="button-secondary" disabled={busy}>
          检索
        </button>
      </form>
      {results.length > 0 && (
        <div className="search-results">
          {results.map((result, index) => (
            <article key={`${result.snapshotName}-${index}`}>
              <strong>{result.text}</strong>
              <span>
                {result.snapshotName} · {locatorText(result.locator)}
              </span>
            </article>
          ))}
        </div>
      )}
      <div className="snapshot-list">
        {snapshots.map((snapshot) => (
          <article key={snapshot.id}>
            <strong>{snapshot.originalName}</strong>
            <span>
              v{snapshot.version} · {snapshot.extension} · {snapshot.status}
              {snapshot.error ? ` · ${snapshot.error}` : ""}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}
