# Workspace 母艦

個人タスク管理のハブとして機能するワークスペース。Claude CodeのMCPを使ってLinear、Google Calendar、Google Sheetsと連携します。

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. direnvのインストール

```bash
# Ubuntu/WSL
sudo apt install direnv

# macOS
brew install direnv

# シェルにフックを追加（zshの場合）
echo 'eval "$(direnv hook zsh)"' >> ~/.zshrc
source ~/.zshrc
```

### 3. 環境変数の設定

`.env.example`をコピーして`.env`を作成:

```bash
cp .env.example .env
```

`.env`を編集して必要な値を設定:

```bash
# Google OAuth認証（Calendar用）
GOOGLE_OAUTH_CREDENTIALS=/絶対パス/credentials/oauth-credentials.json

# Google Service Account（Sheets用）
GOOGLE_APPLICATION_CREDENTIALS=/絶対パス/credentials/service-account.json
GOOGLE_PROJECT_ID=your-gcp-project-id

# その他...
```

**重要**: パスは絶対パスで指定してください。

### 4. direnvを許可

```bash
direnv allow
```

これで`.env`の環境変数が自動的に読み込まれます。

### 5. Google Calendar OAuth認証のセットアップ

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. **APIとサービス > 認証情報** に移動
3. **「認証情報を作成」>「OAuthクライアントID」** をクリック
4. アプリケーションの種類: **デスクトップアプリ**
5. JSONをダウンロードして `credentials/oauth-credentials.json` として保存

### 6. Google Sheets Service Accountのセットアップ

1. [Google Cloud Console](https://console.cloud.google.com/) でService Accountを作成
2. JSONキーをダウンロードして `credentials/service-account.json` として保存
3. **シフトスプレッドシートをService Accountのメールアドレスと共有**
   - Service Accountのメールアドレスは `credentials/service-account.json` の `client_email` に記載

### 7. Claude Codeの再起動

```bash
# Claude Codeを再起動してMCPサーバーを読み込む
claude
```

### 8. MCP認証

Claude Code内で `/mcp` を実行し、必要に応じてOAuth認証を完了:

- **Linear**: ブラウザでOAuth認証
- **Google Calendar**: ブラウザでOAuth認証

## 使い方

### /today コマンド

```
/today
```

今日のタスク（Linear）、予定（Calendar）、シフト（Sheets）を一覧表示します。

## ファイル構成

```
workspace/
├── .mcp.json              # MCP設定（Git管理）
├── .env                   # 環境変数（Git管理外）
├── .envrc                 # direnv設定（Git管理外）
├── credentials/           # 認証情報（Git管理外）
│   ├── oauth-credentials.json
│   └── service-account.json
└── .claude/
    └── commands/today.md  # /todayコマンド定義
```

## MCP設定

| サービス | MCP Server | 認証方式 |
|----------|------------|----------|
| Linear | `mcp-remote` (SSE) | OAuth |
| Google Calendar | `@cocal/google-calendar-mcp` | OAuth |
| Google Sheets | `mcp-gsheets` | Service Account |

## トラブルシューティング

### 環境変数が読み込まれない

```bash
# direnvを再許可
direnv allow

# 環境変数を確認
echo $GOOGLE_APPLICATION_CREDENTIALS
```

### MCPサーバーが接続できない

```bash
# デバッグモードで起動
claude --debug

# MCP状態を確認
/mcp
```

### 改行コードの問題

WSL環境では改行コード（CRLF/LF）の問題が発生することがあります:

```bash
# LFに変換
sed -i 's/\r$//' .env .envrc
```
