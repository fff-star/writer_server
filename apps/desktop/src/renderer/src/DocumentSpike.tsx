import Editor, { getTextFromElementList, PageMode } from "@hufe921/canvas-editor";
import { useEffect, useRef, useState } from "react";

const initialText = "季度预算汇总\n本页用于验证中文分页编辑。人工修改会反映在下方文本状态中。\n";

export function DocumentSpike() {
  const container = useRef<HTMLDivElement>(null);
  const [text, setText] = useState(initialText);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!container.current) {
      return;
    }
    const editor = new Editor(
      container.current,
      {
        main: initialText.split("\n").map((value) => ({ value: value ? `${value}\n` : "" })),
      },
      {
        pageMode: PageMode.PAGING,
        defaultFont: "Noto Serif CJK SC",
        defaultSize: 16,
      },
    );
    const updateText = () => {
      const result = editor.command.getValue();
      setText(getTextFromElementList(result.data.main));
    };
    editor.listener.contentChange = updateText;
    setReady(true);

    return () => {
      editor.listener.contentChange = null;
      editor.destroy();
    };
  }, []);

  return (
    <section className="document-spike" aria-label="分页编辑验证">
      <div className="panel-toolbar">
        <p className="library-message">人工修改会实时反映在下方文本状态中。</p>
        <span className="status">{ready ? "编辑器已加载" : "正在加载"}</span>
      </div>
      <div className="canvas-editor-host" ref={container} data-testid="paged-editor" />
      <details className="document-text-state">
        <summary>当前文本状态</summary>
        <pre data-testid="document-text">{text}</pre>
      </details>
    </section>
  );
}
