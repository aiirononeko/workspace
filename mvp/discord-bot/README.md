# Discord Bot MVP

DiscordからAnthropic SDK経由でClaudeに質問するBot。

## セットアップ

### 1. Discord Developer Portal

1. [Discord Developer Portal](https://discord.com/developers/applications) でApplicationを作成
2. Bot Token を取得（Bot → Reset Token）
3. OAuth2 → URL Generator で `bot` + `applications.commands` スコープを選択
4. 生成されたURLでBotを個人サーバーに招待

### 2. IDの取得

Discord設定 → 詳細設定 → 開発者モードをONにして:
- サーバー名を右クリック → サーバーIDをコピー（`ALLOWED_GUILD_IDS`）
- 自分のアイコンを右クリック → ユーザーIDをコピー（`ALLOWED_USER_IDS`）

### 3. 環境変数

```bash
cp .env.example .env
# .env を編集して値を設定（ANTHROPIC_API_KEY が必須）
```

### 4. 起動

```bash
bun install
bun run start
```

## コマンド

| コマンド | 説明 |
|---------|------|
| `/ask <prompt>` | Claudeに質問する |

## 技術構成

- **Runtime**: Bun
- **Discord**: discord.js v14
- **Claude**: Anthropic SDK (`@anthropic-ai/sdk`) による直接API呼び出し
