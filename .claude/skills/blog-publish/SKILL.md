---
name: blog-publish
description: microCMSの下書き記事を公開する
user-invocable: true
disable-model-invocation: true
allowed-tools: Read, ToolSearch, WebSearch
---

# 記事公開

microCMSの下書き記事を公開ステータスに変更します。

**起動**: `/blog-publish <記事タイトルまたはキーワード>`（例: `/blog-publish DualShock4 スティック交換`）

## 手順

### 1. microCMS MCPツールの準備

ToolSearchで `microcms` を検索し、利用可能なツールを確認する。

### 2. 対象記事の確認

1. コンテンツ一覧からAPIのエンドポイント名を把握
2. 下書きステータスの記事を一覧取得
3. 指定された記事を特定

### 3. 公開前チェックリスト

記事の内容を取得し、以下を確認:

```markdown
## 公開前チェック

- [ ] タイトルが最終版になっているか
- [ ] メタディスクリプションが設定されているか
- [ ] プレースホルダー（<!-- IMAGE -->, <!-- YOUR_EXPERIENCE --> 等）が残っていないか
- [ ] カテゴリ・タグが設定されているか
- [ ] OGP画像が設定されているか（管理画面で確認）
```

### 4. プレースホルダー残存チェック

本文中に以下のパターンが残っていないか確認:
- `<!-- IMAGE:`
- `<!-- YOUR_EXPERIENCE:`
- `<!-- YOUR_DATA:`
- `<!-- AFFILIATE:`

**プレースホルダーが残っている場合**:
- 残存箇所を一覧表示
- 「このまま公開しますか？」とユーザーに確認
- 管理画面で編集するよう提案

### 5. 公開実行

ユーザーの承認後、microCMS MCPで記事のステータスを公開に変更する。

### 6. 完了報告

```markdown
## 公開完了

✅ **記事**: [タイトル]
🌐 **ステータス**: 公開済み

### 公開後TODO

- [ ] 実際のページで表示確認
- [ ] SNSでシェア
- [ ] 1週間後に `/blog-analyze` でパフォーマンス確認（GSC設定後）
```
