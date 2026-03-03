# Harness Engineering Log

ハーネス強化の履歴を記録する。

## フォーマット

| 日付 | 種別 | 原因 | 対策 |
|------|------|------|------|
| YYYY-MM-DD | コンテキスト不足/テスト不足/構造違反/ツール不足 | 何が起きたか | 何を追加・変更したか |

## 履歴

| 日付 | 種別 | 原因 | 対策 |
|------|------|------|------|
| 2026-03-02 | 初期構築 | - | ハーネス基盤を構築（DoD, smoke-test, structure-check） |
| 2026-03-02 | コンテキスト不足+構造違反+テスト不足 | X投稿のObsidian保存時にEmbed情報がキャッシュから欠落し本文が空になった。無関係なコンテンツにもナレッジ提案が表示された | CLAUDE.mdにデータフロー/ナレッジ提案ルール追記、structure-checkにrelevantフィールド・embedMeta保持チェック追加、smoke-testにナレッジ提案整合性テスト追加 |
| 2026-03-03 | コンテキスト不足+構造違反+テスト不足 | 人格システムプロンプト導入時、構造化JSON出力（knowledge-proposer等）に人格が混入するリスク | CLAUDE.mdに人格プロンプト適用ルール・禁止事項追記、structure-checkにpersonality境界チェック4件追加、smoke-testにpersonality.ts構文・export検証追加 |
