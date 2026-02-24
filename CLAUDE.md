# Workspace 母艦

このワークスペースは、個人タスク管理のハブとして機能する「母艦」です。

## 概要

- **能動的操作**: Claude Codeで `/today` コマンドを使ってタスク確認・更新
- **受動的通知**: Discord Webhookで状態確認・リマインダーを受信

## 連携サービス（MCP）

このワークスペースはMCP（Model Context Protocol）を使用して外部サービスと連携します。

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

## カスタムコマンド

### /today
GitHub Projects + Google Calendar + Google Sheetsを使って今日のタスク・予定・シフトを取得し一覧表示。対話形式で操作可能。

### /github-task
GitHub Projectsのタスクを対話的にCRUD操作するコマンド。

### ブログ運営コマンド

| コマンド | 用途 |
|---------|------|
| `/blog-research <トピック>` | キーワード調査・競合分析 |
| `/blog-outline <キーワード>` | SEO最適化された記事構成を生成 |
| `/blog-draft <構成の説明>` | microCMSに下書き記事を作成 |
| `/blog-humanize <記事タイトル>` | AI臭除去 & カタダ文体変換 |
| `/blog-polish <記事タイトル>` | ユーザー執筆記事の校正・清書 |
| `/blog-write <テーマ>` | 体験ベースの記事作成（ヒアリング→骨格投稿→ユーザー執筆→校正→チームレビュー） |
| `/blog-review <記事タイトル>` | 4人の専門家エージェントによるチームレビュー（100点満点） |
| `/blog-publish <記事タイトル>` | 下書き記事を公開 |
| `/blog-analyze` | 公開後分析（GSC設定後に本格稼働） |

## ディレクトリ構成

```
workspace/
├── CLAUDE.md               # このファイル
├── README.md               # セットアップ手順
├── .mcp.json               # MCP設定（Git管理）
├── .env                    # 環境変数（Git管理外）
├── .envrc                  # direnv設定（Git管理外）
├── .claude/
│   ├── commands/today.md   # /todayコマンド（レガシー）
│   └── skills/             # Skillベースのコマンド群
│       ├── today/          # 今日の状況確認
│       ├── github-task/    # GitHub Projectsタスク操作
│       ├── blog-research/  # キーワード調査
│       ├── blog-outline/   # 記事構成
│       ├── blog-draft/     # ドラフト作成（→microCMS）
│       ├── blog-write/     # 体験ベース記事作成
│       ├── blog-polish/    # 校正・清書
│       ├── blog-review/    # チームレビュー
│       ├── blog-publish/   # 記事公開
│       └── blog-analyze/   # 公開後分析（placeholder）
├── credentials/            # 認証情報（Git管理外）
│   ├── oauth-credentials.json
│   └── service-account.json
└── scripts/
    └── discord-notify.mjs  # Discord通知
```

## 注意事項

- **GitHub Projects**: `gh` CLI経由でアクセス（`read:project` スコープが必要）
- **Google Calendar**: OAuth認証が必要（個人カレンダーへのアクセス用）
- **Google Sheets**: Service Account経由（シフト表は共有設定済み前提）
- **microCMS**: API Key認証（MCP経由で記事作成・更新・公開）
- **環境変数**: direnvを使用。`direnv allow`で有効化
