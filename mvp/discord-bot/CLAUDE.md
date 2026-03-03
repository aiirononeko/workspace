# Discord Bot

Discordボットプロジェクト。ブックマーク監視、URL要約、ナレッジ提案、スラッシュコマンドを提供する。

## 技術スタック

- **ランタイム**: Bun
- **言語**: TypeScript (strict mode)
- **主要依存**: discord.js, @anthropic-ai/sdk
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
├── summarize.ts          # URL取得・HTML解析・要約
├── bookmark-watcher.ts   # ブックマークチャンネル監視
├── button-handler.ts     # ボタンインタラクション処理
├── knowledge-proposer.ts # ナレッジ分析・提案（構造化JSON出力）
└── commands/             # スラッシュコマンド
    ├── ask.ts
    ├── save.ts
    ├── summarize.ts
    └── task.ts
```

### 依存関係ルール

- `config.ts` はリーフ依存（他のsrcファイルをimportしない）
- `personality.ts` はリーフ依存（他のsrcファイルをimportしない）
- `guard.ts` は `config.ts` のみに依存
- `claude.ts` は `config.ts` のみに依存（`personality.ts` をimportしない）
- `commands/` 配下は他のcommandファイルをimportしない
- `index.ts` だけがDiscord Clientを生成・管理する

### データフロールール

- キャッシュやストアに保存するデータは、呼び出し元から渡された情報をすべて保持すること（例: embedMetaなど付帯情報を落とさない）
- 外部コンテンツをObsidianなどに保存する際は、AI要約だけでなく原文データ（Embed情報など）も本文に含めること

### 人格プロンプト適用ルール

- `runClaude()` はオプショナルな `system` パラメータを受け取る。人格を適用したい呼び出し元が `personality.ts` の `SYSTEM_PROMPT` を渡す
- **適用する**: `/ask`コマンド、URL要約（`/summarize` およびブックマーク要約）
- **適用しない**: `knowledge-proposer.ts`（構造化JSON出力）、`button-handler.ts`のSkill Draft生成（コード生成タスク）
- 構造化出力（JSON等）を期待するモジュールは `personality.ts` をimportしてはならない

### ナレッジ提案ルール

- ナレッジ分析には必ず `relevant` 判定を含めること（エンジニアリング・ビジネス・自己成長に無関係なコンテンツは提案しない）
- `relevant: false` のコンテンツにはボタン表示をスキップすること

### 禁止事項

- `commands/` 配下のファイル同士の相互import
- `config.ts` から他のsrcモジュールへのimport
- Discord Client の複数インスタンス生成
- 環境変数の直接参照（`config.ts` 経由で取得すること）
- ナレッジ提案で `relevant` フィルタなしにボタンを表示すること
- `knowledge-proposer.ts` や `button-handler.ts` から `personality.ts` をimportすること（構造化出力に人格が混入する）
- `claude.ts` から `personality.ts` をimportすること（呼び出し元が明示的に渡す設計）
