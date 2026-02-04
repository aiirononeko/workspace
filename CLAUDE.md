# Workspace 母艦

このワークスペースは、個人タスク管理のハブとして機能する「母艦」です。

## 概要

- **能動的操作**: Claude Codeで `/today` コマンドを使ってタスク確認・更新
- **受動的通知**: Discord Webhookで状態確認・リマインダーを受信

## 連携サービス（MCP）

このワークスペースはMCP（Model Context Protocol）を使用して外部サービスと連携します。

| サービス | MCP Server | 機能 |
|----------|------------|------|
| Linear | `https://mcp.linear.app/sse` | タスク管理（取得・作成・更新） |
| Google Calendar | `@anthropic/mcp-google-calendar` | 予定の取得 |
| Google Sheets | `@anthropic/mcp-google-sheets` | シフト情報の取得 |

## 環境変数

`.env`ファイルで管理（`.gitignore`に含まれる）。

必須:
- `GOOGLE_SERVICE_ACCOUNT_PATH` - Service Account JSONパス
- `GOOGLE_CALENDAR_ID` - カレンダーID
- `SHIFT_SPREADSHEET_ID` - シフトスプレッドシートID
- `DISCORD_WEBHOOK_URL` - Discord Webhook URL

## カスタムコマンド

### /today
MCPを使って今日のタスク・予定・シフトを取得し一覧表示。対話形式で操作可能。

## ディレクトリ構成

```
workspace/
├── CLAUDE.md               # このファイル
├── .env                    # 環境変数
├── .claude/
│   ├── settings.json       # MCP設定
│   └── commands/today.md   # /todayコマンド
├── credentials/            # Service Account等
└── scripts/
    └── discord-notify.mjs  # Discord通知（MCPなし）
```

## 注意事項

> MCPでLinearを使う場合、初回はOAuth認証が必要です。
> Google系サービスはService Account経由でアクセスします。
