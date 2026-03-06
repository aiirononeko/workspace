# Discord Bot

Discordボットプロジェクト。ブックマーク監視、URL要約、ナレッジ提案、スラッシュコマンドを提供する。

## 技術スタック

- **ランタイム**: Bun
- **言語**: TypeScript (strict mode)
- **主要依存**: discord.js, @anthropic-ai/sdk, @anthropic-ai/claude-agent-sdk
- **パッケージマネージャ**: bun

## Definition of Done (DoD)

コード変更が「完了」と見なされるための条件:

1. `scripts/smoke-test.sh` が全てパスすること
2. `scripts/structure-check.sh` が全てパスすること
3. 型チェックが通ること（`bunx tsc --noEmit`）

## アーキテクチャ

```
src/
├── index.ts              # エントリポイント: Discordクライアント + イベントルーティング
├── config.ts             # 設定・環境変数パース（リーフ依存）
├── personality.ts        # 人格システムプロンプト（リーフ依存）
├── guard.ts              # 権限チェック・レートリミット
├── claude.ts             # Anthropic API ラッパー（オプショナルsystemプロンプト対応）
├── mention-handler.ts    # メンション検知・スレッド作成・会話応答・実装依頼検出
├── agent-executor.ts     # Agent SDK オーケストレーター（config.tsのみ依存）
├── progress-reporter.ts  # 進捗→Discordスレッド投稿（リーフ、型のみagent-executor依存）
├── summarize.ts          # URL取得・HTML解析・要約
├── bookmark-watcher.ts   # ブックマークチャンネル監視
├── button-handler.ts     # ボタンインタラクション処理
├── knowledge-proposer.ts # ナレッジ分析・提案（構造化JSON出力）
├── prompt-builder.ts     # メモリ付きシステムプロンプト構築（personality.ts + memory.ts依存）
├── memory.ts             # メモリストレージ層（SQLite、config.tsのみ依存）
├── memory-extractor.ts   # Claude記憶抽出・統合（claude.ts + memory.ts依存）
└── commands/             # スラッシュコマンド
    ├── ask.ts
    ├── memory.ts
    ├── review.ts
    ├── save.ts
    ├── summarize.ts
    └── task.ts
```

### 依存関係ルール

- `config.ts` はリーフ依存（他のsrcファイルをimportしない）
- `personality.ts` はリーフ依存（他のsrcファイルをimportしない）
- `guard.ts` は `config.ts` のみに依存
- `claude.ts` は `config.ts` のみに依存（`personality.ts` をimportしない）
- `memory.ts` は `config.ts` のみに依存（リーフライク、AI非依存）
- `prompt-builder.ts` は `personality.ts` + `memory.ts` に依存
- `memory-extractor.ts` は `claude.ts` + `memory.ts` に依存（`personality.ts` をimportしない）
- `agent-executor.ts` は `config.ts` のみに依存（Agent SDKを直接使用、claude.tsとは独立）
- `progress-reporter.ts` はリーフ依存（型のみ `agent-executor.ts` から import 可）
- `agent-executor.ts` から `personality.ts` をimportしない（構造化実行タスク）
- `commands/` 配下は他のcommandファイルをimportしない
- `index.ts` だけがDiscord Clientを生成・管理する

### データフロールール

- キャッシュやストアに保存するデータは、呼び出し元から渡された情報をすべて保持すること（例: embedMetaなど付帯情報を落とさない）
- 外部コンテンツをObsidianなどに保存する際は、AI要約だけでなく原文データ（Embed情報など）も本文に含めること

### 人格プロンプト適用ルール

- `runClaude()` はオプショナルな `system` パラメータを受け取る。人格を適用したい呼び出し元が `personality.ts` の `SYSTEM_PROMPT` を渡す
- **適用する**: `/ask`コマンド、URL要約（`/summarize` およびブックマーク要約）、メンション会話（`mention-handler.ts`）
- **適用しない**: `knowledge-proposer.ts`（構造化JSON出力）、`button-handler.ts`のSkill Draft生成（コード生成タスク）
- 構造化出力（JSON等）を期待するモジュールは `personality.ts` をimportしてはならない

### メモリシステム

- `memory.ts` はBun内蔵SQLite（WALモード）で `data/memory.db` に永続化
- Core Memory: ユーザーの要約（常にシステムプロンプトに挿入）
- Profile Entries: 蓄積される事実（最大50件、スコアベースで自動eviction）
- メンション会話・`/ask` でメモリ注入 + レスポンス後に非同期抽出
- `/memory` コマンド: show / delete / clear
- PII自動除外、confidence < 0.5 のエントリは保存しない
- 削除されたエントリはCore Memory再統合時に除外される（復活バグ防止）

### ナレッジ提案ルール

- ナレッジ分析には必ず `relevant` 判定を含めること（エンジニアリング・ビジネス・自己成長に無関係なコンテンツは提案しない）
- `relevant: false` のコンテンツにはボタン表示をスキップすること

### 通知Job（jobs/notifier/providers）

Bot本体とは独立したエントリポイント。Discord Webhook経由で送信。

```
src/
├── jobs/
│   ├── daily-briefing.ts    # 朝通知（GitHub Tasks + Calendar + Sheets）
│   └── release-watch.ts     # RSS監視（AI企業ブログ → 翻訳要約 → 送信）
├── notifier/
│   ├── webhook.ts           # Discord Webhook送信
│   └── job-store.ts         # SQLite: 実行ログ・既読管理
└── providers/
    ├── github-tasks.ts      # gh CLIでタスク取得
    ├── google-calendar.ts   # googleapis でカレンダー取得
    ├── google-sheets.ts     # googleapis でシフト取得
    └── rss-feeds.ts         # RSSフィード取得・パース
```

#### 依存ルール

- `jobs/`, `notifier/`, `providers/` はBot本体（`config.ts`, `claude.ts`等）をimportしない
- 環境変数は `process.env` から直接読む（Bot本体の `config.ts` を経由しない）
- `job-store.ts` はBot本体の `memory.ts` とDBファイルを共有しない（`jobs.db`は独立）

### 禁止事項

- `commands/` 配下のファイル同士の相互import
- `config.ts` から他のsrcモジュールへのimport
- Discord Client の複数インスタンス生成
- 環境変数の直接参照（`config.ts` 経由で取得すること）
- ナレッジ提案で `relevant` フィルタなしにボタンを表示すること
- `knowledge-proposer.ts` や `button-handler.ts` から `personality.ts` をimportすること（構造化出力に人格が混入する）
- `claude.ts` から `personality.ts` をimportすること（呼び出し元が明示的に渡す設計）
- `memory-extractor.ts` から `personality.ts` をimportすること（記憶抽出は構造化出力）
- `memory.ts` から `config.ts` 以外のsrcモジュールをimportすること
- `agent-executor.ts` から `personality.ts` をimportすること（構造化実行タスク）
- `agent-executor.ts` から `claude.ts` をimportすること（Agent SDKを直接使用）
- `progress-reporter.ts` から `config.ts` や `claude.ts` をimportすること（リーフ依存）
- `jobs/`, `notifier/`, `providers/` からBot本体のモジュール（`config.ts`, `claude.ts`, `guard.ts`等）をimportすること
