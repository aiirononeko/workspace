---
name: blog-draft
description: 承認済み構成からmicroCMSに下書き記事を作成
user-invocable: true
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, WebSearch, ToolSearch
---

# 記事ドラフト生成（microCMS）

承認済みの記事構成をもとにmicroCMSへ下書き記事を作成します。

**起動**: `/blog-draft <構成の説明またはキーワード>`（例: `/blog-draft DualShock4 スティック交換`）

## 前提

- `/blog-outline` で作成・承認された構成案が会話コンテキストにあること
- 構成案がない場合は、ユーザーにキーワードと概要を確認してから執筆
- microCMS MCPが設定済みであること

## 手順

### 1. microCMS MCPツールの準備

ToolSearchで `microcms create draft` を検索し、`mcp__microcms__microcms_create_content_draft` をロード。

### 2. ドラフト執筆

以下のルールに従って本文を作成:

**本文ルール**:
- 「です・ます」調で統一
- 一文は60文字以内を目安
- 専門用語は初出時に簡単な説明を付ける
- H2の直後に導入文を入れる（いきなりH3に入らない）
- 適度に箇条書き・表を使う
- 画像が必要な箇所に `<!-- IMAGE: 説明 -->` コメント（後で管理画面から追加）
- アフィリエイトリンク箇所に `<!-- AFFILIATE: 商品名 -->` コメント
- 体験を追記すべき箇所に `<!-- YOUR_EXPERIENCE: 説明 -->` コメント
- データが必要な箇所に `<!-- YOUR_DATA: 説明 -->` コメント

**文字数目安**:
- ハウツー記事: 3,000〜5,000字
- レビュー記事: 2,000〜4,000字
- 比較記事: 4,000〜6,000字

### 4. microCMSに下書き作成

`mcp__microcms__microcms_create_content_draft` で下書きを作成:

```
endpoint: "blogs"
content: {
  "title": "記事タイトル",
  "content": "<h2>見出し</h2><p>本文HTML...</p>"
}
```

**利用可能なフィールド**:
- `title`: テキスト（必須）
- `content`: リッチエディタ / HTML文字列（必須）
- `category`: コンテンツ参照（任意）

**注意**:
- `body`, `description` はフィールドとして存在しない（400エラー）
- APIキーにPOST権限が必要（「POST is forbidden」エラー時はmicroCMS管理画面で権限追加）
- `_create_content_draft` ツールを使えば自動的に下書きステータスになる（`status`フィールドの指定は不要）

### 5. Linearタスク生成（プレースホルダー対応用）

ドラフト作成後、本文中のプレースホルダーを解析し、Linearに記事公開準備タスクを生成する。

1. ToolSearchで `linear create issue` を検索し、`mcp__linear__create_issue` をロード
2. 本文から `<!-- IMAGE: -->`, `<!-- YOUR_EXPERIENCE: -->`, `<!-- YOUR_DATA: -->`, `<!-- AFFILIATE: -->` を抽出
3. 1つの親Issueとして作成:
   ```
   team: "Aiirononeko-private"
   title: "[記事タイトル短縮] 記事公開準備"
   description: |
     ## 対象記事
     - **タイトル**: [記事タイトル]
     - **microCMS管理画面**: https://aiirononeko.microcms.io/apis/blogs/{contentId}

     ## 残りのプレースホルダー
     - [ ] [種類] [箇所]: [説明]
     - [ ] [種類] [箇所]: [説明]
     ...

     ## 次のアクション
     1. microCMS管理画面で各プレースホルダーを編集
     2. プレースホルダーコメントを削除し、実際のコンテンツに置換
     3. 全プレースホルダー対応後、`/blog-review` で品質チェック
     4. 問題なければ `/blog-publish` で公開
   assignee: "me"
   state: "Todo"
   priority: 3
   labels: ["ブログ"]
   ```
   **注意**: タイトルに絵文字は使わない

### 6. 完了報告

```markdown
## ドラフト完成

📝 **microCMS**: 下書きとして作成済み
🔗 **管理画面**: https://aiirononeko.microcms.io/apis/blogs/{contentId}
📏 **文字数**: 約X,XXX字
🎫 **Linearタスク**: [Issue ID] - プレースホルダー対応

### 要対応プレースホルダー

| # | 種類 | 箇所 | 内容 |
|---|------|------|------|
| 1 | IMAGE | H2: xxx | 管理画面から画像を追加 |
| 2 | YOUR_EXPERIENCE | H2: xxx | 実体験を追記 |
| 3 | AFFILIATE | H2: xxx | 商品リンクを挿入 |

### 次のステップ

1. Linearタスクのチェックリストに沿ってプレースホルダーを埋める
2. `/blog-review` で品質チェック
3. `/blog-publish` で公開
```
