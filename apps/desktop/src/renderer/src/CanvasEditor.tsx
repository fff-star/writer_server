import Editor, { getTextFromElementList, PageMode } from "@hufe921/canvas-editor";
import type { OfficeDocument } from "@office-agent/document";
import { useEffect, useRef, useState } from "react";
import { blocksToElements, elementsToBlocks } from "./document-elements";

type DocumentVersion = {
  id: string;
  documentId: string;
  parentId: string | null;
  authorKind: "human" | "agent";
  createdAt: string;
  document: OfficeDocument;
};

export function CanvasEditor({ documentId }: { documentId: string | null }) {
  const container = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const baseRef = useRef<OfficeDocument | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("请先在「文档」页选择要编辑的文档");

  useEffect(() => {
    const host = container.current;
    if (!host) {
      return;
    }
    let cancelled = false;
    const editor = new Editor(
      host,
      { main: [{ value: "\n" }] },
      {
        pageMode: PageMode.PAGING,
        defaultFont: "Noto Serif CJK SC",
        defaultSize: 16,
      },
    );
    editorRef.current = editor;
    editor.listener.contentChange = () => {
      setText(getTextFromElementList(editor.command.getValue().data.main));
    };
    setReady(true);
    baseRef.current = null;
    setLoaded(false);
    setText("");

    if (!documentId) {
      setMessage("请先在「文档」页选择要编辑的文档；当前画布内容不会保存");
    } else {
      setBusy(true);
      setMessage("正在加载文档…");
      window.officeAgent.studio
        .latestVersion(documentId)
        .then((latest) => {
          if (cancelled) {
            return;
          }
          const version = latest as DocumentVersion | null;
          if (!version) {
            setMessage("该文档还没有任何版本");
            return;
          }
          baseRef.current = version.document;
          editor.command.executeSetValue({ main: blocksToElements(version.document) });
          setText(getTextFromElementList(editor.command.getValue().data.main));
          setLoaded(true);
          setMessage(`正在编辑「${version.document.title}」`);
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setMessage(error instanceof Error ? error.message : String(error));
          }
        })
        .finally(() => {
          if (!cancelled) {
            setBusy(false);
          }
        });
    }

    return () => {
      cancelled = true;
      editor.listener.contentChange = null;
      editor.destroy();
      editorRef.current = null;
    };
  }, [documentId]);

  const saveVersion = async () => {
    const editor = editorRef.current;
    const base = baseRef.current;
    if (!editor || !base || !documentId) {
      return;
    }
    setBusy(true);
    try {
      const elements = editor.command.getValue().data.main;
      const next: OfficeDocument = { ...base, blocks: elementsToBlocks(elements, base) };
      const version = (await window.officeAgent.studio.appendVersion(
        documentId,
        next,
      )) as DocumentVersion;
      baseRef.current = version.document;
      setMessage(`已保存人工版本（${version.createdAt}）`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="canvas-editor-panel" aria-label="画布编辑器">
      <div className="panel-toolbar">
        <p className="library-message" data-testid="canvas-editor-message">
          {message}
        </p>
        <span className="status">{ready ? "编辑器已加载" : "正在加载"}</span>
      </div>
      <div className="studio-toolbar">
        <button
          type="button"
          className="button-primary"
          onClick={() => void saveVersion()}
          disabled={busy || !loaded}
        >
          保存版本
        </button>
      </div>
      <div className="canvas-editor-host" ref={container} data-testid="paged-editor" />
      <details className="document-text-state">
        <summary>当前文本状态</summary>
        <pre data-testid="document-text">{text}</pre>
      </details>
    </section>
  );
}
