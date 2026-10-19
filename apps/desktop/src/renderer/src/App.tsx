import { useEffect, useState } from "react";
import { DocumentSpike } from "./DocumentSpike";

type AppInfo = {
  name: string;
  version: string;
  platform: string;
  stage: string;
};

const modules = [
  {
    title: "资料库",
    description: "不可变文件快照、内容提取与来源定位将在资料库里程碑启用。",
  },
  {
    title: "研究与写作",
    description: "本地资料与公开网页将在这里汇总为带引用的中文材料。",
  },
  {
    title: "工作区 Agent",
    description: "文件和脚本工具仅在安全边界通过验证后开放。",
  },
];

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    void window.officeAgent.getAppInfo().then((value) => setInfo(value as AppInfo));
  }, []);

  return (
    <main className="shell">
      <header className="hero">
        <p className="eyebrow">LOCAL-FIRST OFFICE AGENT</p>
        <h1>把资料、研究与写作放在同一个可审计工作流中。</h1>
        <p className="intro">当前是基础工程版本。页面仅展示产品方向，不代表相应功能已经开放。</p>
      </header>
      <section className="module-grid" aria-label="规划中的功能模块">
        {modules.map((module, index) => (
          <article className="module" key={module.title}>
            <span className="module-number">0{index + 1}</span>
            <h2>{module.title}</h2>
            <p>{module.description}</p>
            <span className="status">尚未启用</span>
          </article>
        ))}
      </section>
      <DocumentSpike />
      <footer>
        <span>{info ? `${info.name} ${info.version}` : "正在读取应用信息"}</span>
        <span>{info?.platform ?? ""}</span>
      </footer>
    </main>
  );
}
