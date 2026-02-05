# Workspace 母艦

このワークスペースは、個人タスク管理のハブとして機能する「母艦」です。

## 概要

- **能動的操作**: Claude Codeで `/today` コマンドを使ってタスク確認・更新
- **受動的通知**: Discord Webhookで状態確認・リマインダーを受信

## 連携サービス（MCP）

このワークスペースはMCP（Model Context Protocol）を使用して外部サービスと連携します。

| サービス | MCP Server | 認証方式 | 機能 |
|----------|------------|----------|------|
| Linear | `mcp-remote` (SSE) | OAuth | タスク管理（取得・作成・更新） |
| Google Calendar | `@cocal/google-calendar-mcp` | OAuth | 予定の取得（複数カレンダー対応） |
| Google Sheets | `mcp-gsheets` | Service Account | シフト情報の取得 |

## 環境変数

`.env`ファイルで管理（`.gitignore`に含まれる）。direnvで自動読み込み。

必須:
- `GOOGLE_OAUTH_CREDENTIALS` - OAuth認証用JSONパス（Calendar用、絶対パス）
- `GOOGLE_APPLICATION_CREDENTIALS` - Service Account JSONパス（Sheets用、絶対パス）
- `GOOGLE_PROJECT_ID` - GCPプロジェクトID
- `GOOGLE_CALENDAR_IDS` - カレンダーID（カンマ区切りで複数指定可）
- `SHIFT_SPREADSHEET_ID` - シフトスプレッドシートID
- `DISCORD_WEBHOOK_URL` - Discord Webhook URL

## カスタムコマンド

### /today
MCPを使って今日のタスク・予定・シフトを取得し一覧表示。対話形式で操作可能。

## ディレクトリ構成

```
workspace/
├── CLAUDE.md               # このファイル
├── README.md               # セットアップ手順
├── .mcp.json               # MCP設定（Git管理）
├── .env                    # 環境変数（Git管理外）
├── .envrc                  # direnv設定（Git管理外）
├── .claude/
│   └── commands/today.md   # /todayコマンド
├── credentials/            # 認証情報（Git管理外）
│   ├── oauth-credentials.json
│   └── service-account.json
└── scripts/
    └── discord-notify.mjs  # Discord通知
```

## 注意事項

- **Linear**: MCP経由でOAuth認証（初回のみブラウザ認証）
- **Google Calendar**: OAuth認証が必要（個人カレンダーへのアクセス用）
- **Google Sheets**: Service Account経由（シフト表は共有設定済み前提）
- **環境変数**: direnvを使用。`direnv allow`で有効化
