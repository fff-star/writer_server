import { useEffect, useState, type FormEvent } from "react";

type SecretEntry = {
  name: string;
  configured: boolean;
};

const secretLabels: Record<string, string> = {
  "brave-search-api-key": "Brave 搜索 API 密钥",
  "ocr-api-key": "OCR 服务 API 密钥",
  "visual-api-key": "图像理解 API 密钥",
};

function label(name: string): string {
  return secretLabels[name] ?? name;
}

export function SettingsPanel() {
  const [secrets, setSecrets] = useState<SecretEntry[]>([]);
  const [selected, setSelected] = useState("brave-search-api-key");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    "密钥经系统加密后存储在本机，界面只显示是否已配置，永不回显内容。",
  );

  const refresh = async () => {
    setSecrets((await window.officeAgent.settings.list()) as SecretEntry[]);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!value) {
      return;
    }
    setBusy(true);
    try {
      await window.officeAgent.settings.setSecret(selected, value);
      setValue("");
      setMessage(`已保存 ${label(selected)}。`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (name: string) => {
    setBusy(true);
    try {
      await window.officeAgent.settings.deleteSecret(name);
      setMessage(`已删除 ${label(name)}。`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-panel" aria-labelledby="settings-title">
      <div className="library-heading">
        <div>
          <p className="eyebrow">PROTECTED SETTINGS</p>
          <h2 id="settings-title">本地密钥设置</h2>
        </div>
      </div>
      <p className="library-message">{message}</p>
      <form className="library-search" onSubmit={save}>
        <select
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          aria-label="选择密钥"
        >
          {secrets.map((entry) => (
            <option key={entry.name} value={entry.name}>
              {label(entry.name)}
            </option>
          ))}
        </select>
        <input
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="输入新密钥（只写不回显）"
          aria-label="输入新密钥"
          autoComplete="off"
        />
        <button type="submit" disabled={busy || !value}>
          保存密钥
        </button>
      </form>
      <div className="snapshot-list">
        {secrets.map((entry) => (
          <article key={entry.name}>
            <strong>
              {label(entry.name)} · {entry.configured ? "已配置" : "未配置"}
            </strong>
            <span>{entry.name}</span>
            {entry.configured && (
              <button
                type="button"
                className="secret-delete"
                onClick={() => void remove(entry.name)}
                disabled={busy}
              >
                删除
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
