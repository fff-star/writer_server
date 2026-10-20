import { useEffect, useState, type FormEvent } from "react";
import { CanvasEditor } from "./CanvasEditor";
import { ConversationView } from "./ConversationView";
import { LibraryPanel } from "./LibraryPanel";
import { SettingsPanel } from "./SettingsPanel";
import { StudioPanel } from "./StudioPanel";

type AppInfo = {
  name: string;
  version: string;
  platform: string;
  stage: string;
};

type Project = {
  id: string;
  name: string;
  createdAt: string;
};

type ViewId = "workspace" | "library" | "settings";
type WorkspaceTab = "conversation" | "documents" | "editor";

const workspaceTabs: Array<{ id: WorkspaceTab; label: string }> = [
  { id: "conversation", label: "对话" },
  { id: "documents", label: "文档" },
  { id: "editor", label: "编辑器" },
];

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("zh-CN");
}

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [view, setView] = useState<ViewId>("workspace");
  const [tab, setTab] = useState<WorkspaceTab>("conversation");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [sidebarMessage, setSidebarMessage] = useState("");

  const refreshProjects = async () => {
    setProjects((await window.officeAgent.projects.list()) as Project[]);
  };

  useEffect(() => {
    void window.officeAgent.getAppInfo().then((value) => setInfo(value as AppInfo));
    void refreshProjects();
  }, []);

  const selectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    setSelectedDocumentId(null);
    setView("workspace");
    setTab("conversation");
  };

  const createProject = async (event: FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name || busy) {
      return;
    }
    setBusy(true);
    try {
      const project = (await window.officeAgent.projects.create(name)) as Project;
      setNewName("");
      setCreating(false);
      await refreshProjects();
      selectProject(project.id);
    } catch (error) {
      setSidebarMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const showWorkspace = view === "workspace" && selectedProject !== null;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="wordmark">写作</div>
        <button
          type="button"
          className="button-primary new-project-button"
          data-testid="new-project"
          onClick={() => setCreating(true)}
        >
          新建项目
        </button>
        {creating && (
          <form className="project-form" onSubmit={createProject}>
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="项目名称"
              aria-label="项目名称"
              data-testid="project-name-input"
              autoFocus
            />
            <div className="project-form-actions">
              <button
                type="submit"
                className="button-primary"
                data-testid="project-create-submit"
                disabled={busy || !newName.trim()}
              >
                创建
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  setCreating(false);
                  setNewName("");
                }}
              >
                取消
              </button>
            </div>
          </form>
        )}
        {sidebarMessage && <p className="sidebar-message">{sidebarMessage}</p>}
        <div className="project-list" role="list" aria-label="项目列表">
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              className="project-item"
              data-testid={`project-${project.id}`}
              data-active={showWorkspace && project.id === selectedProjectId}
              onClick={() => selectProject(project.id)}
            >
              <span className="project-name">{project.name}</span>
              <span className="project-date">{formatDate(project.createdAt)}</span>
            </button>
          ))}
        </div>
        <hr className="nav-divider" />
        <button
          type="button"
          className="nav-item"
          data-testid="nav-library"
          data-active={view === "library"}
          onClick={() => setView("library")}
        >
          资料库
        </button>
        <div className="nav-bottom">
          <button
            type="button"
            className="nav-item"
            data-testid="nav-settings"
            data-active={view === "settings"}
            onClick={() => setView("settings")}
          >
            设置
          </button>
        </div>
        <p className="sidebar-footer">{info ? `${info.name} ${info.version}` : ""}</p>
      </aside>
      <div className="main">
        {showWorkspace && selectedProject ? (
          <>
            <header className="view-header">
              <h1>{selectedProject.name}</h1>
              <p className="view-subtitle">创建于 {formatDate(selectedProject.createdAt)}</p>
            </header>
            <div className="tabs" role="tablist" aria-label="项目工作区">
              {workspaceTabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  className="tab"
                  data-testid={`tab-${item.id}`}
                  data-active={tab === item.id}
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className={tab === "conversation" ? "view-body view-body-flush" : "view-body"}>
              {tab === "conversation" && (
                <ConversationView key={selectedProject.id} projectId={selectedProject.id} />
              )}
              {tab === "documents" && (
                <StudioPanel
                  key={selectedProject.id}
                  projectId={selectedProject.id}
                  selectedId={selectedDocumentId}
                  onSelectId={setSelectedDocumentId}
                />
              )}
              {tab === "editor" && (
                <CanvasEditor key={selectedProject.id} documentId={selectedDocumentId} />
              )}
            </div>
          </>
        ) : view === "library" ? (
          <>
            <header className="view-header">
              <h1>资料库</h1>
              <p className="view-subtitle">跨项目共享的受管快照与中文检索</p>
            </header>
            <div className="view-body">
              <LibraryPanel />
            </div>
          </>
        ) : view === "settings" ? (
          <>
            <header className="view-header">
              <h1>设置</h1>
              <p className="view-subtitle">本地密钥</p>
            </header>
            <div className="view-body">
              <SettingsPanel />
            </div>
          </>
        ) : (
          <div className="view-body">
            <div className="empty-state">
              <h1>创建一个项目开始。</h1>
              <p>项目是一次写作任务的容器：对话、草稿与文档都归属于它。</p>
              <button type="button" className="button-primary" onClick={() => setCreating(true)}>
                新建项目
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
