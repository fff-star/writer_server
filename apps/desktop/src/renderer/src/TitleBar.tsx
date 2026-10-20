import { useEffect, useState, type MouseEvent } from "react";

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => window.officeAgent.windowControls.onMaximizedChange(setMaximized), []);

  const toggleMaximize = (event: MouseEvent) => {
    event.stopPropagation();
    window.officeAgent.windowControls.toggleMaximize();
  };

  const handleDoubleClick = (event: MouseEvent) => {
    if ((event.target as HTMLElement).closest(".titlebar-actions")) {
      return;
    }
    window.officeAgent.windowControls.toggleMaximize();
  };

  return (
    <header className="titlebar" onDoubleClick={handleDoubleClick}>
      <span className="titlebar-title">Office Agent</span>
      <div className="titlebar-actions">
        <button
          type="button"
          aria-label="最小化"
          data-testid="window-minimize"
          onClick={() => window.officeAgent.windowControls.minimize()}
        >
          −
        </button>
        <button
          type="button"
          aria-label={maximized ? "还原" : "最大化"}
          data-testid="window-toggle-maximize"
          onClick={toggleMaximize}
        >
          {maximized ? "❐" : "□"}
        </button>
        <button
          type="button"
          className="titlebar-close"
          aria-label="关闭"
          data-testid="window-close"
          onClick={() => window.officeAgent.windowControls.close()}
        >
          ×
        </button>
      </div>
    </header>
  );
}
