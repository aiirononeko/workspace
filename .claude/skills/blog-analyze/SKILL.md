---
name: blog-analyze
description: 公開済み記事のパフォーマンス分析（GSC MCP設定後に本格稼働）
user-invocable: true
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, WebSearch
---

# 公開後パフォーマンス分析

> **⚠️ ステータス: プレースホルダー**
> Google Search Console (GSC) MCPが未設定のため、現在は限定的な機能のみ利用可能です。

## 現在できること

- WebSearchで公開済み記事のインデックス状況を簡易確認
- 検索結果での表示順位を手動で確認

## GSC MCP セットアップ TODO

1. **GSC API の有効化**
   - Google Cloud Console で Search Console API を有効化
   - サービスアカウントまたはOAuth認証を設定

2. **MCP サーバーの選定・設定**
   - GSC対応のMCPサーバーを探す or 自作
   - `.mcp.json` に追加

3. **環境変数の追加**
   - `GSC_CREDENTIALS` などを `.env` に追加

4. **このSkillの更新**
   - GSC MCP設定後、以下の機能を実装:
     - クエリ別のクリック数・表示回数・CTR・掲載順位
     - ページ別パフォーマンス
     - 順位変動アラート
     - リライト優先度の自動算出

## GSC設定後に実装予定の機能

### パフォーマンスダッシュボード
- 過去7日/28日のクリック数・表示回数
- CTRが低い記事（タイトル改善候補）
- 順位が上昇/下降している記事

### リライト優先度スコア
- 掲載順位 4-20位（あと少しで上位表示）
- 表示回数は多いがCTRが低い
- 順位が下降トレンド

### 自動レポート
- 週次パフォーマンスサマリ
- 月次の成長レポート
