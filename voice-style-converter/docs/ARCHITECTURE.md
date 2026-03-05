# Voice Style Converter — デスクトップアプリ設計書 v2

## 1. 概要

CLIツール（mvp/voice-style-converter）を、Windows常駐デスクトップアプリに進化させる。
将来的にMac/iOS/iPadにも展開可能なアーキテクチャを採用する。

### ターゲット（MVP）
- Windows 10/11 ネイティブ動作
- システムトレイ常駐
- Alt+Space 長押しで録音 → 文字起こし → 文体変換 → クリップボード
- 録音中フローティングUIアニメーション

---

## 2. 技術選定

### フレームワーク: Tauri v2

| 観点 | 選定理由 |
|------|----------|
| バイナリサイズ | ~5MB（Electron: ~100MB+） |
| メモリ使用量 | ~30MB（Electron: ~150MB+） |
| モバイル対応 | v2からiOS/Android公式対応 |
| システムトレイ | ビルトイン（`tray-icon` feature） |
| グローバルショートカット | 公式プラグイン（Pressed/Released検知可） |
| クリップボード | 公式プラグイン |
| WebView | OS標準（Windows: WebView2, macOS: WKWebView） |

### 設計方針: パイプラインはRust、UIはReact

このアプリの本質は「録音→文字起こし→文体変換→クリップボード」のバックエンドパイプラインであり、
UIはその状態を表示するだけの薄い層に過ぎない。

パイプラインをRust側に配置することで以下を実現する：

- **CORS不要**: `reqwest`から直接APIを叩くためブラウザのCORS制約を受けない
- **APIキー保護**: WebViewのdevtoolsからAPIキーが露出しない
- **IPC最小化**: WAVデータがRustプロセス内で完結し、WebView間の転送が不要
- **Tauri思想に合致**: 薄いフロントエンド＋ネイティブバックエンド

```
┌───────────────────────────────────────────────────────┐
│  フロントエンド（React + TypeScript）— 表示のみ        │
│  ┌──────────────┐  ┌──────────────┐                   │
│  │ 設定画面      │  │ 録音オーバーレイ│                   │
│  │ (APIキー入力  │  │ (アニメーション │                   │
│  │  ショートカット│  │  状態表示)    │                   │
│  │  モード選択)  │  │              │                   │
│  └──────┬───────┘  └──────┬───────┘                   │
│         │ invoke          │ listen                    │
├─────────┼─────────────────┼───────────────────────────┤
│  Rust（Tauri）— すべてのロジック                       │
│  ┌────────────────────────────────────────────────┐   │
│  │  パイプライン                                   │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │   │
│  │  │ 録音     │→│ Whisper  │→│ Claude       │ │   │
│  │  │ (cpal)   │  │ (reqwest)│  │ (reqwest)    │ │   │
│  │  └──────────┘  └──────────┘  └──────┬───────┘ │   │
│  │                                      ↓         │   │
│  │                              ┌──────────────┐  │   │
│  │                              │ クリップボード │  │   │
│  │                              └──────────────┘  │   │
│  └────────────────────────────────────────────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│  │ global-  │ │ system   │ │ single-  │              │
│  │ shortcut │ │ tray     │ │ instance │              │
│  └──────────┘ └──────────┘ └──────────┘              │
└───────────────────────────────────────────────────────┘
```

---

## 3. Rust依存クレート

### Tauriプラグイン（公式）

| プラグイン | 用途 |
|-----------|------|
| `tauri-plugin-global-shortcut` | Alt+Space 長押し検知（Pressed/Released） |
| `tauri-plugin-clipboard-manager` | 変換結果のコピー |
| `tauri-plugin-single-instance` | 多重起動防止 |
| `tauri-plugin-notification` | 変換完了通知（任意） |
| `tauri-plugin-store` | 設定の永続化（APIキー等） |

### パイプライン用クレート

| クレート | 用途 | 備考 |
|---------|------|------|
| `cpal` | マイク録音（PCMキャプチャ） | クロスプラットフォーム対応 |
| `hound` | WAVファイルエンコード | cpalのPCMデータ→WAV変換 |
| `reqwest` | HTTP クライアント | OpenAI/Anthropic API呼び出し |
| `serde` + `serde_json` | JSON シリアライズ | APIリクエスト/レスポンス |
| `regex` | 正規表現 | 文体検知・品質ゲート |
| `tokio` | 非同期ランタイム | Tauriが内部で使用、追加設定不要 |
| `anyhow` | エラーハンドリング | `Result<T>` の簡潔な記述 |

### システムトレイ
Tauri v2ビルトイン（`tray-icon` Cargo feature）。プラグイン不要。

---

## 4. フロントエンド構成（薄いUI層）

### 技術スタック

| 要素 | 選定 |
|------|------|
| UIフレームワーク | React 19 |
| 言語 | TypeScript |
| ビルドツール | Vite |
| スタイリング | Tailwind CSS 4 |

### フロントエンドの責務

フロントエンドは以下のみを担当する。それ以外のロジックはすべてRust側。

1. **設定画面の表示・入力** → `invoke` でRust側に保存
2. **状態イベントの受信** → `listen` でRustからのイベントを受け取り、UIに反映
3. **録音アニメーションの描画** → CSSアニメーションのみ

### ウィンドウ構成

#### メインウィンドウ（非表示）
- 起動時は非表示（`visible: false`）
- システムトレイの「設定」メニューから表示
- 設定画面（APIキー、ショートカットキー、モード選択）

#### フローティングウィンドウ（録音中オーバーレイ）
- `transparent: true` + `always_on_top: true` + `decorations: false`
- 録音中のみ表示
- マウスイベント透過（`ignore_cursor_events: true`）

```jsonc
// tauri.conf.json 抜粋
{
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "Voice Style Converter",
        "visible": false,
        "width": 480,
        "height": 640
      },
      {
        "label": "overlay",
        "transparent": true,
        "alwaysOnTop": true,
        "decorations": false,
        "visible": false,
        "width": 120,
        "height": 120,
        "x": 1780,
        "y": 20,
        "skipTaskbar": true
      }
    ]
  }
}
```

---

## 5. Rustモジュール構成

```
src-tauri/src/
├── main.rs                  # エントリポイント（Windows用）
├── lib.rs                   # Tauri Builder構築・プラグイン初期化
├── pipeline/
│   ├── mod.rs               # パイプライン全体のオーケストレーション
│   ├── recorder.rs          # cpal + hound による録音
│   ├── transcriber.rs       # Whisper API呼び出し (reqwest)
│   └── converter.rs         # Claude API呼び出し + 品質ゲート (reqwest)
├── config.rs                # 設定の読み書き (tauri-plugin-store)
├── tray.rs                  # システムトレイ構築
└── commands.rs              # Tauriコマンド定義（フロントエンドとのIPC）
```

---

## 6. データフロー

```
[Alt+Space 押下] ──→ global-shortcut (Pressed)
                      │
                      ├─→ Rust: recorder::start()
                      ├─→ emit("pipeline-state", "recording")
                      │     └─→ フロントエンド: オーバーレイ表示 + パルスアニメ
                      │
[Alt+Space 離す] ──→ global-shortcut (Released)
                      │
                      ├─→ Rust: recorder::stop() → WAVバイト列（メモリ内）
                      ├─→ emit("pipeline-state", "transcribing")
                      │
                      ├─→ Rust: transcriber::transcribe(wav_bytes)
                      │     └─→ reqwest POST → OpenAI Whisper API
                      │     └─→ 文字起こしテキスト
                      │
                      ├─→ emit("pipeline-state", "converting")
                      │
                      ├─→ Rust: converter::convert(text)
                      │     ├─→ tone_mode判定（regex）
                      │     ├─→ reqwest POST → Anthropic Claude API
                      │     ├─→ 品質ゲート検査（方向性反転, 過剰短縮, drift）
                      │     ├─→ [必要なら] リトライ (temperature: 0.0)
                      │     └─→ 変換テキスト
                      │
                      ├─→ Rust: clipboard.write_text(変換テキスト)
                      ├─→ emit("pipeline-state", "done")
                      │     └─→ フロントエンド: チェックマーク → 0.5秒後に非表示
                      │
                      └─→ emit("pipeline-result", { original, converted })
                            └─→ フロントエンド: 履歴に追加（任意）
```

### イベント一覧（Rust → フロントエンド）

| イベント名 | ペイロード | 用途 |
|-----------|-----------|------|
| `pipeline-state` | `"recording"` \| `"transcribing"` \| `"converting"` \| `"done"` \| `"error"` | オーバーレイUIの状態切替 |
| `pipeline-result` | `{ original: string, converted: string }` | 変換結果の表示・履歴 |
| `pipeline-error` | `{ message: string, phase: string }` | エラー通知 |

### コマンド一覧（フロントエンド → Rust）

| コマンド | 引数 | 用途 |
|---------|------|------|
| `save_config` | `Config` | 設定の保存 |
| `load_config` | — | 設定の読み込み |
| `register_shortcut` | `shortcut: string` | ショートカットの変更 |
| `get_audio_devices` | — | 録音デバイス一覧 |
| `set_audio_device` | `device_id: string` | 録音デバイス指定 |

---

## 7. 既存コードの移植マップ

| 既存ファイル (TS) | 移植先 (Rust) | 移植方針 |
|------------------|--------------|----------|
| `converter.ts` — プロンプト文字列 | `prompts/common.md`, `prompts/casual.md`, `prompts/formal.md` | **外部ファイル化**。実行時に読み込み。再コンパイル不要 |
| `converter.ts` — `detectToneMode()` | `pipeline/converter.rs` | `regex`クレートで同等の正規表現マッチング |
| `converter.ts` — `hasDirectionFlipRisk()` 等の品質ゲート | `pipeline/converter.rs` | 同上。ロジックは1:1で移植 |
| `converter.ts` — `callConvert()` | `pipeline/converter.rs` | `reqwest`によるHTTP POST |
| `transcriber.ts` | `pipeline/transcriber.rs` | `reqwest` + multipart form-data |
| `recorder.ts` | `pipeline/recorder.rs` | `cpal` + `hound`で完全置換 |
| `index.ts` | `lib.rs` + `pipeline/mod.rs` | パイプラインオーケストレーション |

### プロンプトの外部ファイル化

プロンプトの反復調整でRust再コンパイルが走るのを防ぐため、プロンプトは外部ファイルとして管理する。

```
src-tauri/
├── prompts/
│   ├── common.md        # COMMON_PROMPT に相当
│   ├── casual.md        # CASUAL_PROMPT に相当
│   └── formal.md        # FORMAL_PROMPT に相当
```

```rust
// pipeline/converter.rs（プロンプト読み込み）
fn load_prompt(app: &AppHandle, mode: ToneMode) -> Result<String> {
    let resource_dir = app.path().resource_dir()?;
    let common = std::fs::read_to_string(resource_dir.join("prompts/common.md"))?;
    let mode_file = match mode {
        ToneMode::Formal => "formal.md",
        ToneMode::Casual => "casual.md",
    };
    let mode_prompt = std::fs::read_to_string(resource_dir.join("prompts").join(mode_file))?;
    Ok(format!("{}{}", common, mode_prompt))
}
```

```jsonc
// tauri.conf.json
{
  "bundle": {
    "resources": ["prompts/*"]
  }
}
```

### converter.ts → converter.rs 移植例

```rust
// pipeline/converter.rs

use regex::Regex;
use serde::{Deserialize, Serialize};
use anyhow::Result;

#[derive(Debug, Clone, Copy, PartialEq)]
enum ToneMode {
    Formal,
    Casual,
}

fn detect_tone_mode(text: &str) -> ToneMode {
    let formal_re = Regex::new(
        r"です|ます|ください|でしょうか|いたします|お願い|いただ|ございま|存じ|恐縮"
    ).unwrap();
    let casual_re = Regex::new(
        r"やけど|やで|まじで|めっちゃ|あざ(?:ます|す)|おけ(?:おけ)?|オネシャス|w+$|！{2,}|[~〜～]{2,}"
    ).unwrap();

    let formal_count = formal_re.find_iter(text).count();
    let casual_count = casual_re.find_iter(text).count();

    if formal_count >= 2 && formal_count >= casual_count {
        ToneMode::Formal
    } else {
        ToneMode::Casual
    }
}

fn has_direction_flip_risk(input: &str, output: &str) -> bool {
    let has_sasete_in = Regex::new(r"させてもら").unwrap().is_match(input);
    let has_sasete_out = Regex::new(r"させてもら").unwrap().is_match(output);
    let has_temorau_in = Regex::new(r"てもら|て貰|いただ").unwrap().is_match(input);

    if !has_sasete_in && has_temorau_in && has_sasete_out {
        return true;
    }

    let ask_re = Regex::new(r"してほしい|してもら|いただけると").unwrap();
    let give_re = Regex::new(r"するので|しますので").unwrap();
    if ask_re.is_match(input) && give_re.is_match(output) {
        return true;
    }

    false
}

#[derive(Serialize)]
struct ClaudeRequest {
    model: String,
    max_tokens: u32,
    temperature: f32,
    system: String,
    messages: Vec<Message>,
}

#[derive(Serialize)]
struct Message {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct ClaudeResponse {
    content: Vec<ContentBlock>,
}

#[derive(Deserialize)]
struct ContentBlock {
    #[serde(rename = "type")]
    block_type: String,
    text: Option<String>,
}

async fn call_convert(
    client: &reqwest::Client,
    api_key: &str,
    system_prompt: &str,
    text: &str,
    temperature: f32,
) -> Result<String> {
    let body = ClaudeRequest {
        model: "claude-sonnet-4-20250514".into(),
        max_tokens: 1024,
        temperature,
        system: system_prompt.into(),
        messages: vec![Message {
            role: "user".into(),
            content: text.into(),
        }],
    };

    let resp: ClaudeResponse = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&body)
        .send()
        .await?
        .json()
        .await?;

    resp.content
        .first()
        .and_then(|b| b.text.clone())
        .ok_or_else(|| anyhow::anyhow!("Unexpected response from Claude API"))
}
```

### transcriber.ts → transcriber.rs 移植例

```rust
// pipeline/transcriber.rs

use anyhow::Result;
use reqwest::multipart;

pub async fn transcribe(
    client: &reqwest::Client,
    api_key: &str,
    wav_bytes: Vec<u8>,
) -> Result<String> {
    let file_part = multipart::Part::bytes(wav_bytes)
        .file_name("recording.wav")
        .mime_str("audio/wav")?;

    let form = multipart::Form::new()
        .part("file", file_part)
        .text("model", "whisper-1")
        .text("language", "ja")
        .text("prompt", "日本語の開発文脈。IT用語（リポジトリ, デプロイ, LP, PoC, API）と敬語語尾（です/ます/でしょうか/お願いします）を正確に。")
        .text("temperature", "0");

    let resp: serde_json::Value = client
        .post("https://api.openai.com/v1/audio/transcriptions")
        .header("Authorization", format!("Bearer {}", api_key))
        .multipart(form)
        .send()
        .await?
        .json()
        .await?;

    resp["text"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| anyhow::anyhow!("No text in Whisper response"))
}
```

---

## 8. フルディレクトリ構成

```
voice-style-converter/
├── src/                              # フロントエンド（React + TS）— 表示のみ
│   ├── main.tsx                      # メインウィンドウ エントリ
│   ├── overlay-entry.tsx             # オーバーレイ エントリ
│   ├── App.tsx                       # 設定画面
│   ├── Overlay.tsx                   # 録音オーバーレイ（状態に応じたアニメ）
│   ├── components/
│   │   ├── RecordingAnimation.tsx    # パルスアニメーション
│   │   ├── ProcessingIndicator.tsx   # スピナー
│   │   ├── DoneCheck.tsx            # 完了チェックマーク
│   │   └── SettingsForm.tsx         # 設定フォーム
│   └── lib/
│       └── tauri.ts                  # invoke/listen のラッパー（型定義）
├── src-tauri/                        # Rust（Tauri）— すべてのロジック
│   ├── src/
│   │   ├── main.rs                   # #[cfg(not(mobile))] エントリ
│   │   ├── lib.rs                    # Builder構築・プラグイン初期化
│   │   ├── tray.rs                   # システムトレイ構築
│   │   ├── commands.rs               # Tauriコマンド（IPC）
│   │   ├── config.rs                 # 設定管理
│   │   └── pipeline/
│   │       ├── mod.rs                # パイプラインオーケストレーション
│   │       ├── recorder.rs           # 録音 (cpal + hound)
│   │       ├── transcriber.rs        # Whisper API (reqwest)
│   │       └── converter.rs          # Claude API + 品質ゲート (reqwest)
│   ├── prompts/                      # プロンプト外部ファイル
│   │   ├── common.md
│   │   ├── casual.md
│   │   └── formal.md
│   ├── icons/
│   │   └── tray-icon.png
│   ├── capabilities/
│   │   └── default.json
│   ├── Cargo.toml
│   └── tauri.conf.json
├── index.html                        # メインウィンドウHTML
├── overlay.html                      # オーバーレイHTML
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## 9. Cargo.toml

```toml
[package]
name = "voice-style-converter"
version = "0.1.0"
edition = "2021"

[lib]
name = "voice_style_converter_lib"
crate-type = ["lib", "cdylib", "staticlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-clipboard-manager = "2"
tauri-plugin-single-instance = "2"
tauri-plugin-notification = "2"
tauri-plugin-store = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"

# パイプライン
reqwest = { version = "0.12", features = ["json", "multipart"] }
cpal = "0.15"
hound = "3.5"
regex = "1"
anyhow = "1"

[target.'cfg(any(target_os = "macos", windows, target_os = "linux"))'.dependencies]
tauri-plugin-global-shortcut = "2"
```

---

## 10. lib.rs（全体像）

```rust
use tauri::Manager;

mod commands;
mod config;
mod pipeline;
mod tray;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            // グローバルショートカット
            #[cfg(desktop)]
            {
                use tauri::Emitter;
                use tauri_plugin_global_shortcut::{
                    Code, GlobalShortcutExt, Modifiers, ShortcutState,
                };

                let handle = app.handle().clone();
                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_shortcuts(["alt+space"])?
                        .with_handler(move |_app, _shortcut, event| {
                            match event.state() {
                                ShortcutState::Pressed => {
                                    let h = handle.clone();
                                    tauri::async_runtime::spawn(async move {
                                        pipeline::on_shortcut_pressed(&h).await;
                                    });
                                }
                                ShortcutState::Released => {
                                    let h = handle.clone();
                                    tauri::async_runtime::spawn(async move {
                                        pipeline::on_shortcut_released(&h).await;
                                    });
                                }
                            }
                        })
                        .build(),
                )?;
            }

            // システムトレイ
            #[cfg(desktop)]
            tray::setup(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::save_config,
            commands::load_config,
            commands::get_audio_devices,
            commands::set_audio_device,
            commands::register_shortcut,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

## 11. パイプラインオーケストレーション

```rust
// pipeline/mod.rs

pub mod converter;
pub mod recorder;
pub mod transcriber;

use anyhow::Result;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::config;

fn emit_state(app: &AppHandle, state: &str) {
    let _ = app.emit("pipeline-state", state);
}

fn emit_error(app: &AppHandle, phase: &str, message: &str) {
    let _ = app.emit("pipeline-error", serde_json::json!({
        "phase": phase,
        "message": message,
    }));
}

pub async fn on_shortcut_pressed(app: &AppHandle) {
    emit_state(app, "recording");

    // オーバーレイ表示
    if let Some(overlay) = app.get_webview_window("overlay") {
        let _ = overlay.show();
    }

    // 録音開始
    if let Err(e) = recorder::start().await {
        emit_error(app, "recording", &e.to_string());
    }
}

pub async fn on_shortcut_released(app: &AppHandle) {
    // 録音停止 → WAVバイト列取得
    let wav_bytes = match recorder::stop().await {
        Ok(bytes) => bytes,
        Err(e) => {
            emit_error(app, "recording", &e.to_string());
            hide_overlay(app);
            return;
        }
    };

    // 設定読み込み
    let cfg = match config::load(app) {
        Ok(c) => c,
        Err(e) => {
            emit_error(app, "config", &e.to_string());
            hide_overlay(app);
            return;
        }
    };

    let client = reqwest::Client::new();

    // 文字起こし
    emit_state(app, "transcribing");
    let transcript = match transcriber::transcribe(
        &client, &cfg.openai_api_key, wav_bytes
    ).await {
        Ok(t) => t,
        Err(e) => {
            emit_error(app, "transcribing", &e.to_string());
            hide_overlay(app);
            return;
        }
    };

    // 文体変換
    emit_state(app, "converting");
    let converted = match converter::convert(
        app, &client, &cfg.anthropic_api_key, &transcript
    ).await {
        Ok(c) => c,
        Err(e) => {
            emit_error(app, "converting", &e.to_string());
            hide_overlay(app);
            return;
        }
    };

    // クリップボードへコピー
    if let Err(e) = app.clipboard().write_text(&converted) {
        emit_error(app, "clipboard", &e.to_string());
        hide_overlay(app);
        return;
    }

    // 結果送信
    let _ = app.emit("pipeline-result", serde_json::json!({
        "original": transcript,
        "converted": converted,
    }));

    emit_state(app, "done");

    // 0.5秒後にオーバーレイ非表示
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        hide_overlay(&app_clone);
    });
}

fn hide_overlay(app: &AppHandle) {
    if let Some(overlay) = app.get_webview_window("overlay") {
        let _ = overlay.hide();
    }
}
```

---

## 12. フロントエンド（オーバーレイ）

フロントエンドはRustから `pipeline-state` イベントを受け取り、
それに対応するアニメーションを表示するだけ。

```tsx
// src/Overlay.tsx
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";

type PipelineState = "recording" | "transcribing" | "converting" | "done" | "error" | "idle";

export default function Overlay() {
  const [state, setState] = useState<PipelineState>("idle");

  useEffect(() => {
    const unlisten = listen<string>("pipeline-state", (event) => {
      setState(event.payload as PipelineState);
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  if (state === "idle") return null;

  return (
    <div className="w-screen h-screen flex items-center justify-center">
      {state === "recording" && <PulsingCircle />}
      {(state === "transcribing" || state === "converting") && <SpinnerRing />}
      {state === "done" && <CheckMark />}
      {state === "error" && <ErrorIcon />}
    </div>
  );
}
```

### アニメーション仕様

| 状態 | 表示 | 色 |
|------|------|-----|
| recording | パルスする円 + フェードアウトリング | 赤系 (#EF4444) |
| transcribing | 回転リング + 「聞取中」テキスト | 青系 (#3B82F6) |
| converting | 回転リング + 「変換中」テキスト | 紫系 (#8B5CF6) |
| done | チェックマーク（0.5秒後に自動非表示） | 緑系 (#10B981) |
| error | ×マーク（1秒後に自動非表示） | 黄系 (#F59E0B) |

---

## 13. 設定管理

`tauri-plugin-store` を使い、JSON形式でローカルに永続化する。

```rust
// config.rs
use anyhow::Result;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub openai_api_key: String,
    pub anthropic_api_key: String,
    pub shortcut: String,           // デフォルト: "alt+space"
    pub tone_mode: String,          // "auto" | "casual" | "formal"
    pub audio_device_id: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            openai_api_key: String::new(),
            anthropic_api_key: String::new(),
            shortcut: "alt+space".into(),
            tone_mode: "auto".into(),
            audio_device_id: None,
        }
    }
}

pub fn load(app: &AppHandle) -> Result<AppConfig> {
    let store = app.store("config.json")?;
    let config = store
        .get("config")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    Ok(config)
}

pub fn save(app: &AppHandle, config: &AppConfig) -> Result<()> {
    let store = app.store("config.json")?;
    store.set("config", serde_json::to_value(config)?);
    store.save()?;
    Ok(())
}
```

---

## 14. セットアップ手順

### 前提条件
- Node.js 20+ or Bun
- Rust（rustup経由）
- Windows: WebView2 Runtime（Win11標準搭載、Win10は要確認）

### 1. Rustインストール
```powershell
winget install Rustlang.Rustup
```

### 2. プロジェクト作成
```bash
bun create tauri-app voice-style-converter --template react-ts
cd voice-style-converter
```

### 3. フロントエンド依存
```bash
bun add @tauri-apps/plugin-global-shortcut
bun add @tauri-apps/plugin-clipboard-manager
bun add @tauri-apps/plugin-notification
```

### 4. Rustプラグイン（src-tauriで実行）
```bash
cd src-tauri
cargo add tauri-plugin-global-shortcut \
  --target 'cfg(any(target_os = "macos", windows, target_os = "linux"))'
cargo add tauri-plugin-clipboard-manager
cargo add tauri-plugin-single-instance
cargo add tauri-plugin-notification
cargo add tauri-plugin-store

# パイプライン用
cargo add reqwest --features json,multipart
cargo add cpal
cargo add hound
cargo add regex
cargo add anyhow
cargo add serde --features derive
cargo add serde_json
```

### 5. Cargo features
```toml
# src-tauri/Cargo.toml の [dependencies] に追記
tauri = { version = "2", features = ["tray-icon"] }
```

### 6. パーミッション設定
```jsonc
// src-tauri/capabilities/default.json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default permissions",
  "windows": ["main", "overlay"],
  "permissions": [
    "core:default",
    "global-shortcut:allow-register",
    "global-shortcut:allow-unregister",
    "clipboard-manager:allow-write-text",
    "clipboard-manager:allow-read-text",
    "notification:default",
    "store:allow-get",
    "store:allow-set",
    "store:allow-save"
  ]
}
```

---

## 15. 開発ロードマップ

### Phase 1: 骨格（1-2日）
- [ ] Tauriプロジェクト作成 + 全プラグインインストール
- [ ] システムトレイ表示（アイコン + 設定/終了メニュー）
- [ ] グローバルショートカット（Alt+Space）のPressed/Released検知
- [ ] イベント発火 → フロントエンドのコンソールログで確認

### Phase 2: 録音パイプライン（2-3日）
- [ ] cpal + hound による録音（start/stop → WAVバイト列）
- [ ] reqwest → Whisper API（multipart/form-data）
- [ ] 文字起こし結果の確認（emit → フロントエンド表示）

### Phase 3: 文体変換（1-2日）
- [ ] プロンプト外部ファイル化 + 読み込み
- [ ] detect_tone_mode の移植
- [ ] reqwest → Claude API
- [ ] 品質ゲート（方向性反転, 過剰短縮, casual drift）の移植
- [ ] リトライロジック
- [ ] クリップボード書き込み

### Phase 4: フローティングUI（1-2日）
- [ ] オーバーレイウィンドウ設定（透明, 最前面, マウス透過）
- [ ] pipeline-state イベント受信
- [ ] 録音パルスアニメーション
- [ ] 処理中スピナー（transcribing / converting 区別）
- [ ] 完了チェックマーク

### Phase 5: 設定画面（1日）
- [ ] APIキー入力 → tauri-plugin-store で保存
- [ ] ショートカットキー変更
- [ ] トーンモード選択（auto/casual/formal）
- [ ] 録音デバイス選択

### Phase 6: 品質向上（継続）
- [ ] エラーハンドリング強化（API失敗, マイク未接続, APIキー未設定）
- [ ] 変換履歴表示
- [ ] 自動アップデート（tauri-plugin-updater）
- [ ] Mac対応テスト

---

## 16. 注意事項・既知の制約

### Alt+Space の競合
- Windowsではデフォルトで Alt+Space がウィンドウのシステムメニュー（移動/サイズ変更/最小化等）を開くショートカットとして割り当てられている
- グローバルショートカットとして登録すればアプリ側が優先されるが、ユーザーの既存操作と競合する
- 問題がある場合は `Ctrl+Shift+Space` や `Win+Shift+V` 等に変更
- 将来的にはユーザーがカスタマイズ可能にする（Phase 5で対応）

### cpal の録音バッファリング
- cpal はストリーミングでPCMデータを返す。録音中はメモリ上のバッファに蓄積し、停止時にhoundでWAVエンコードする
- 長時間録音（数分以上）ではメモリ使用量に注意。MVPでは最大録音時間を60秒に制限する

### APIキーのセキュリティ
- tauri-plugin-store はプレーンテキストでJSONファイルに保存する
- より堅牢にする場合は tauri-plugin-stronghold（暗号化ストレージ）に移行可能
- MVP段階ではstoreで十分（ローカルアプリのため）

### プロンプトの配布
- `bundle.resources` でプロンプトファイルをバイナリに同梱する
- ユーザーが直接編集することは想定しない（設定画面からモード選択のみ）
- 将来的にはプロンプトのカスタマイズUI追加も検討可能
