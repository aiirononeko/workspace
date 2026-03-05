# Voice Style Converter — 実装キックオフプロンプト

以下のプロンプトをClaude Codeに貼り付けて実行する。
Phase単位で実行し、各Phase完了後に動作確認してから次へ進む。

---

## Phase 1: プロジェクト骨格

```
docs/ARCHITECTURE.md に設計書がある。これを読んでから作業を開始せよ。
mvp/voice-style-converter/ に移植元のTypeScriptコードがある。参照用に読んでおくこと。

Phase 1: Tauriプロジェクトの骨格を構築する。

### 1-1. プロジェクト作成
- `bun create tauri-app voice-style-converter --template react-ts` でプロジェクトを作成
- 作成後、docs/ARCHITECTURE.md と mvp/ をプロジェクトルートにコピー

### 1-2. 依存関係インストール
フロントエンド:
- @tauri-apps/plugin-global-shortcut
- @tauri-apps/plugin-clipboard-manager
- @tauri-apps/plugin-notification

Rust (src-tauri/):
- tauri-plugin-global-shortcut (target cfg desktop)
- tauri-plugin-clipboard-manager
- tauri-plugin-single-instance
- tauri-plugin-notification
- tauri-plugin-store
- reqwest (features: json, multipart)
- cpal
- hound
- regex
- anyhow
- serde (features: derive)
- serde_json

Cargo.toml の tauri に tray-icon feature を追加。

### 1-3. ディレクトリ構成
以下のファイルを空（またはスタブ）で作成:
- src-tauri/src/lib.rs
- src-tauri/src/main.rs
- src-tauri/src/tray.rs
- src-tauri/src/commands.rs
- src-tauri/src/config.rs
- src-tauri/src/pipeline/mod.rs
- src-tauri/src/pipeline/recorder.rs
- src-tauri/src/pipeline/transcriber.rs
- src-tauri/src/pipeline/converter.rs
- src-tauri/prompts/common.md（空ファイル）
- src-tauri/prompts/casual.md（空ファイル）
- src-tauri/prompts/formal.md（空ファイル）

### 1-4. Tauri設定
- tauri.conf.json: mainとoverlayの2ウィンドウ構成。overlayはtransparent, alwaysOnTop, decorations false
- capabilities/default.json: 全プラグインのパーミッション
- bundle.resources に "prompts/*" を追加

### 1-5. lib.rs 骨格
- 全プラグイン初期化
- グローバルショートカット (alt+space) の Pressed/Released ハンドラ（ログ出力のみ）
- システムトレイ（設定・終了メニュー）

### 1-6. フロントエンド骨格
- vite.config.ts: マルチページ設定 (index.html + overlay.html)
- overlay.html + overlay-entry.tsx + Overlay.tsx: pipeline-stateイベントをlistenしてコンソールログ
- index.html + main.tsx + App.tsx: "Voice Style Converter 設定" とだけ表示

### 完了条件
- `bun run tauri dev` でアプリが起動する
- システムトレイにアイコンが表示される
- Alt+Space の Pressed/Released がRustコンソールに出力される
- 「設定」メニューでメインウィンドウが表示される
- `cargo check` と `cargo clippy` がエラーなし
```

---

## Phase 2: 録音パイプライン

```
Phase 2: cpal + hound による録音機能を実装する。

docs/ARCHITECTURE.md のセクション6「データフロー」とセクション11「パイプラインオーケストレーション」を参照。

### 2-1. pipeline/recorder.rs
- cpal::default_host().default_input_device() でマイクデバイス取得
- サンプルレート 16000Hz, mono, f32 フォーマット（cpalデフォルト）
- 録音開始: input_stream を構築し、Arc<Mutex<Vec<f32>>> にサンプルを蓄積
- 録音停止: stream.pause() → バッファを drain → hound::WavWriter で WAV (16-bit PCM) にエンコード → Vec<u8> を返す
- start() / stop() は非同期関数。状態管理に OnceLock<Mutex<RecorderState>> またはグローバル static を使用
- 最大録音時間 60秒のガードを入れる

### 2-2. pipeline/mod.rs
- on_shortcut_pressed: recorder::start() + emit("pipeline-state", "recording") + overlay表示
- on_shortcut_released: recorder::stop() で WAVバイト取得 + emit("pipeline-state", "done")
- エラー時は emit("pipeline-error", ...)
- この段階ではtranscribe/convertはスキップし、WAVバイト列のサイズをログ出力するだけ

### 2-3. 動作確認コマンド
テスト用の Tauri コマンドを commands.rs に追加:
- `test_recording`: 3秒間録音して WAV バイト列のサイズを返す（開発時のデバッグ用）

### 完了条件
- Alt+Space 長押し中に録音が行われる
- 離すとRustコンソールに WAV バイト数が表示される（例: "Recorded 96044 bytes"）
- cargo test で recorder のユニットテストがパスする（可能な範囲で）
- cargo clippy がエラーなし
```

---

## Phase 3: Whisper + Claude API

```
Phase 3: Whisper APIとClaude APIの呼び出しを実装する。

mvp/voice-style-converter/src/transcriber.ts と converter.ts を参照して移植する。

### 3-1. pipeline/transcriber.rs
mvp/voice-style-converter/src/transcriber.ts を Rust に移植:
- reqwest::Client を受け取り、multipart/form-data で Whisper API を呼ぶ
- APIキーは引数で受け取る（config経由）
- レスポンスの "text" フィールドを返す
- エラーはanyhow::Contextで詳細メッセージ付き

### 3-2. プロンプトファイル配置
mvp/voice-style-converter/src/converter.ts の COMMON_PROMPT, CASUAL_PROMPT, FORMAL_PROMPT を
以下に分割して配置:
- src-tauri/prompts/common.md
- src-tauri/prompts/casual.md
- src-tauri/prompts/formal.md

### 3-3. pipeline/converter.rs
mvp/voice-style-converter/src/converter.ts を Rust に移植:
- detect_tone_mode(): regex による formal/casual 判定
- has_direction_flip_risk(): 授受表現の反転検知
- has_excessive_shortening_risk(): 出力が入力の50%未満かチェック
- has_casual_drift_risk(): casual モードでの句点・敬語混入検知
- call_convert(): reqwest で Claude API 呼び出し
- convert(): メインエントリ。tone判定 → API呼出 → 品質ゲート → 必要ならリトライ
- プロンプトは app.path().resource_dir() から読み込み

### 3-4. config.rs
- AppConfig 構造体（openai_api_key, anthropic_api_key, shortcut, tone_mode, audio_device_id）
- load() / save() を tauri-plugin-store で実装

### 3-5. pipeline/mod.rs 完成
on_shortcut_released を完成させる:
recorder::stop() → transcriber::transcribe() → converter::convert() → clipboard::write_text()
各ステップで pipeline-state イベントを emit

### 3-6. commands.rs
- save_config / load_config コマンド

### 完了条件
- .envまたはstore経由でAPIキーを設定後、Alt+Space で録音→文字起こし→文体変換→クリップボードの全パイプラインが動作する
- 変換結果がクリップボードにコピーされる
- Rustコンソールに各ステップのログが出力される
- cargo clippy がエラーなし
```

---

## Phase 4: フローティングUI

```
Phase 4: 録音中のフローティングオーバーレイUIを実装する。

### 4-1. Overlay.tsx
pipeline-state イベントを listen し、状態に応じたアニメーションを表示:
- recording: 赤いパルスアニメーション（円が拡縮 + フェードアウトリング）
- transcribing: 青い回転リング + "聞取中" テキスト
- converting: 紫の回転リング + "変換中" テキスト
- done: 緑のチェックマーク（スケールイン）
- error: 黄色の×マーク

アニメーションはCSSの @keyframes で実装。Tailwindのユーティリティクラスと組み合わせる。
透明背景（bg-transparent）で、ウィンドウ自体が透明なので余白は透過される。

### 4-2. overlay.html
最小限のHTML。overlay-entry.tsx を読み込む。背景は透明。

### 4-3. オーバーレイ表示制御
Rust側 pipeline/mod.rs で:
- on_shortcut_pressed: overlay window を show()
- on_shortcut_released の完了/エラー時: overlay window を hide()
- done 状態は 500ms 後に hide（既存実装を確認）

### 完了条件
- Alt+Space 長押し中に画面右上に赤いパルスアニメーションが表示される
- 離すと青→紫のスピナーに切り替わる
- 完了時に緑のチェックマークが一瞬表示されて消える
- エラー時に×マークが表示される
- アニメーションが滑らかに動作する
```

---

## Phase 5: 設定画面

```
Phase 5: メインウィンドウの設定画面を実装する。

### 5-1. App.tsx（設定画面）
- APIキー入力フィールド（OpenAI, Anthropic）— password type で非表示
- ショートカットキー表示 + 変更ボタン（将来用、MVPではalt+space固定表示）
- トーンモード選択（auto / casual / formal）— ラジオボタンまたはセレクト
- 録音デバイス選択（ドロップダウン、get_audio_devices で取得）
- 保存ボタン → invoke("save_config", ...) 
- 起動時に invoke("load_config") で既存設定を読み込み

### 5-2. スタイリング
Tailwind CSS でシンプルだが洗練されたフォーム:
- ダークテーマベース（bg-gray-900, text-gray-100）
- カード型レイアウト
- 保存成功時にトースト通知

### 5-3. commands.rs に追加
- get_audio_devices: cpal でデバイス一覧を返す
- register_shortcut: ショートカット変更（将来用スタブ）

### 完了条件
- システムトレイ→「設定」でウィンドウが開く
- APIキーを入力して保存できる
- 保存したAPIキーがアプリ再起動後も保持される
- トーンモードの変更が変換結果に反映される
```

---

## 使い方

1. Phase 1 のプロンプトをClaude Codeに貼り付けて実行
2. 完了条件をすべて満たしたら、Phase 2 に進む
3. 以降同様に Phase 5 まで順番に実行

各Phase内では、Claude Codeが自律的にサブエージェントを使い分けてファイルの作成・編集・テストを行う。
問題が発生した場合は Claude Code にエラーログを貼って対処を依頼する。
