# Voice Ink

Windows向け高精度日本語音声入力デスクトップアプリ。TypelessやVoiceOSと同水準の音声入力品質を目指す。

## 技術スタック

- **フレームワーク**: Tauri v2 (Rust backend + React/TypeScript frontend)
- **音声キャプチャ**: cpal (WASAPI on Windows, ALSA on Linux)
- **音声認識**: OpenAI Whisper API (language設定可)
- **テキスト整形**: Claude API (フィラーワード除去、句読点補完、言い直し処理)
- **テキスト挿入**: クリップボード経由 + Ctrl+Vシミュレーション (arboard + enigo)
- **ホットキー**: rdev (Windows専用グローバルキーフック)

## アーキテクチャ

```
[Hotkey Long Press] → [Audio Capture (cpal)] → [WAV Encoding (hound, 16kHz/mono/16bit)]
                                                         ↓
                                              [Whisper API → Raw Transcript]
                                                         ↓
                                              [Claude API → Formatted Text]
                                                         ↓
                                              [Clipboard + Ctrl+V → Active App]
```

### 2つの入力経路
1. **ホットキー経路**: グローバルホットキー長押し → 録音 → 離すとパイプライン実行（別スレッド）
2. **UI経路**: React UIの録音ボタンから Tauri command 経由で実行

### 設計方針
- ASR/Formatter/Inserter はtrait抽象化（将来のローカルASR等への差し替え対応）
- ホットキーon_releaseで毎回config再読込（APIキー・言語の変更を即座に反映）
- Mutex lockは全箇所でif let Ok / map_errパターン（コールバック内panicを防止）
- HTTP通信にtimeout設定（ASR: 30秒, LLM: 20秒）
- PII（音声認識結果）をログに出力しない

## Rustモジュール構成 (src-tauri/src/)

| モジュール | 役割 |
|-----------|------|
| `audio.rs` | cpalによるマイク入力キャプチャ + houndによるWAVエンコード + リサンプリング |
| `asr.rs` | AsrEngine trait + Whisper API実装（language/timeout対応） |
| `formatter.rs` | TextFormatter trait + Claude API実装（厳格な日本語整形プロンプト） |
| `inserter.rs` | Inserter trait + クリップボード経由テキスト挿入（保存→設定→Ctrl+V→復元） |
| `hotkey.rs` | グローバルホットキー管理（Windows: rdev, 非Windows: stub） |
| `config.rs` | 設定管理（JSON形式、AppData保存） |
| `lib.rs` | Tauriアプリ初期化、コマンド定義、パイプライン統合 |
| `main.rs` | エントリーポイント |

## 開発コマンド

```bash
bun run dev          # フロントエンド開発サーバー
bun run tauri dev    # Tauri開発モード
bun run tauri build  # プロダクションビルド
```

## 品質スコア (Codex審査)

- 1回目: 54/100 → 2回目: 74/100 → 3回目: **90/100**

### 残る改善点
- ホットキー文字列の動的反映（現状は起動時固定、変更には再起動が必要）
- APIキーのOSセキュアストア移行（現状は平文JSON保存）
- UI経由パイプラインの非同期化（進捗表示・キャンセル対応）
