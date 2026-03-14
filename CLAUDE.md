# Workspace

個人タスク管理の Claude Code ワークスペース。MCP経由で外部サービスと連携する。

主要な開発は [ikkun](https://github.com/aiirononeko/ikkun)（秘書エージェント Discord Bot）に移行済み。

## 連携サービス（MCP）

| サービス | MCP Server | 認証方式 | 機能 |
|----------|------------|----------|------|
| Google Calendar | `@cocal/google-calendar-mcp` | OAuth | 予定の取得（複数カレンダー対応） |
| Google Sheets | `mcp-gsheets` | Service Account | シフト情報の取得 |
| microCMS | `microcms-mcp-server` | API Key | ブログ記事の作成・更新・公開 |

## 環境変数

`.env`ファイルで管理（`.gitignore`に含まれる）。direnvで自動読み込み。

必須:
- `GOOGLE_OAUTH_CREDENTIALS` - OAuth認証用JSONパス（Calendar用、絶対パス）
- `GOOGLE_APPLICATION_CREDENTIALS` - Service Account JSONパス（Sheets用、絶対パス）
- `GOOGLE_PROJECT_ID` - GCPプロジェクトID
- `GOOGLE_CALENDAR_IDS` - カレンダーID（カンマ区切りで複数指定可）
- `SHIFT_SPREADSHEET_ID` - シフトスプレッドシートID
- `DISCORD_WEBHOOK_URL` - Discord Webhook URL
- `MICROCMS_SERVICE_ID` - microCMSサービスID
- `MICROCMS_API_KEY` - microCMS APIキー

## ディレクトリ構成

```
workspace/
├── CLAUDE.md               # このファイル
├── README.md               # セットアップ手順
├── .mcp.json               # MCP設定（Git管理）
├── .env                    # 環境変数（Git管理外）
├── .envrc                  # direnv設定（Git管理外）
├── credentials/            # 認証情報（Git管理外）
│   ├── oauth-credentials.json
│   └── service-account.json
└── package.json
```

## 注意事項

- **GitHub Projects**: `gh` CLI経由でアクセス（`read:project` スコープが必要）
- **Google Calendar**: OAuth認証が必要（個人カレンダーへのアクセス用）
- **Google Sheets**: Service Account経由（シフト表は共有設定済み前提）
- **microCMS**: API Key認証（MCP経由で記事作成・更新・公開）
- **環境変数**: direnvを使用。`direnv allow`で有効化
