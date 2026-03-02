import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import Settings from "./Settings";

interface AppConfig {
  openai_api_key: string;
  anthropic_api_key: string;
  hotkey: string;
  language: string;
}

function App() {
  const [view, setView] = useState<"home" | "settings">("home");
  const [status, setStatus] = useState<string>("確認中...");
  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null);
  const [hotkey, setHotkey] = useState<string>("");
  const [recording, setRecording] = useState(false);
  const [lastResult, setLastResult] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (view !== "home") return;

    invoke<string>("get_status")
      .then((s: string) => setStatus(s === "ready" ? "待機中" : s))
      .catch(() => setStatus("エラー"));

    invoke<AppConfig>("get_config")
      .then((config: AppConfig) => {
        const hasKeys =
          config.openai_api_key.length > 0 &&
          config.anthropic_api_key.length > 0;
        setApiConfigured(hasKeys);
        setHotkey(config.hotkey);
      })
      .catch(() => setApiConfigured(false));
  }, [view]);

  const handleRecordToggle = useCallback(async () => {
    setError("");

    if (!recording) {
      try {
        await invoke("start_recording");
        setRecording(true);
        setStatus("録音中...");
        setLastResult("");
      } catch (err) {
        setError(`録音開始エラー: ${err}`);
      }
    } else {
      try {
        setStatus("処理中...");
        const result = await invoke<string>("stop_recording_and_insert");
        setRecording(false);
        setStatus("待機中");
        setLastResult(result);
      } catch (err) {
        setRecording(false);
        setStatus("待機中");
        setError(`${err}`);
      }
    }
  }, [recording]);

  return (
    <div className="container">
      <header>
        <h1>Voice Ink</h1>
        <nav>
          <button
            className={view === "home" ? "active" : ""}
            onClick={() => setView("home")}
          >
            ホーム
          </button>
          <button
            className={view === "settings" ? "active" : ""}
            onClick={() => setView("settings")}
          >
            設定
          </button>
        </nav>
      </header>

      <main>
        {view === "home" ? (
          <div className="home">
            <div className="status-indicator">
              <span
                className={`status-dot ${recording ? "recording" : status === "待機中" ? "ready" : ""}`}
              />
              <p className="status">{status}</p>
            </div>

            {apiConfigured === false && (
              <p className="warning">
                APIキーが未設定です。設定画面からAPIキーを入力してください。
              </p>
            )}

            <div className="recording-area">
              <button
                className={`record-button ${recording ? "active" : ""}`}
                onClick={handleRecordToggle}
                disabled={apiConfigured === false}
              >
                {recording ? "停止して入力" : "録音開始"}
              </button>
            </div>

            {error && <p className="error">{error}</p>}

            {lastResult && (
              <div className="result">
                <p className="result-label">整形結果:</p>
                <p className="result-text">{lastResult}</p>
              </div>
            )}

            <p className="hint">
              {hotkey
                ? `ホットキー: ${hotkey}（長押しで録音、離すと入力）`
                : "ホットキーを押して音声入力を開始します。"}
            </p>
          </div>
        ) : (
          <Settings />
        )}
      </main>
    </div>
  );
}

export default App;
