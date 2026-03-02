import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface AppConfig {
  openai_api_key: string;
  anthropic_api_key: string;
  hotkey: string;
  language: string;
}

function Settings() {
  const [config, setConfig] = useState<AppConfig>({
    openai_api_key: "",
    anthropic_api_key: "",
    hotkey: "ctrl+shift+space",
    language: "ja",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    invoke<AppConfig>("get_config")
      .then((loaded) => {
        setConfig(loaded);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load config:", err);
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await invoke("save_config", { config });
      setMessage({ type: "success", text: "設定を保存しました" });
    } catch (err) {
      setMessage({ type: "error", text: `保存に失敗しました: ${err}` });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="settings">
        <p>読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="settings">
      <h2>設定</h2>

      <div className="setting-group">
        <label htmlFor="openai-api-key">OpenAI API Key</label>
        <input
          id="openai-api-key"
          type="password"
          placeholder="sk-..."
          value={config.openai_api_key}
          onChange={(e) => setConfig({ ...config, openai_api_key: e.target.value })}
        />
      </div>

      <div className="setting-group">
        <label htmlFor="anthropic-api-key">Anthropic API Key</label>
        <input
          id="anthropic-api-key"
          type="password"
          placeholder="sk-ant-..."
          value={config.anthropic_api_key}
          onChange={(e) => setConfig({ ...config, anthropic_api_key: e.target.value })}
        />
      </div>

      <div className="setting-group">
        <label htmlFor="hotkey">ホットキー</label>
        <input
          id="hotkey"
          type="text"
          placeholder="ctrl+shift+space"
          value={config.hotkey}
          onChange={(e) => setConfig({ ...config, hotkey: e.target.value })}
        />
      </div>

      <div className="setting-group">
        <label htmlFor="language">言語</label>
        <select
          id="language"
          value={config.language}
          onChange={(e) => setConfig({ ...config, language: e.target.value })}
        >
          <option value="ja">日本語</option>
          <option value="en">English</option>
        </select>
      </div>

      {message && (
        <p className={`message ${message.type}`}>{message.text}</p>
      )}

      <button className="save-button" onClick={handleSave} disabled={saving}>
        {saving ? "保存中..." : "保存"}
      </button>
    </div>
  );
}

export default Settings;
