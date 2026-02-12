---
name: blog-polish
description: ユーザー執筆記事の校正・清書（元文を尊重しつつ磨く）
user-invocable: true
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, ToolSearch
---

# 記事校正・清書

ユーザーが書いた文章を**書き換えずに磨く**スキル。
体験・事実・意見は一切変えず、文章の質だけを向上させる。

**`/blog-humanize` との違い**:
- `blog-humanize`: AIが書いた文章の全面書き直し（大きく変える）
- `blog-polish`: ユーザーが書いた文章の校正・微調整（元文を尊重）

**起動**:
- `/blog-polish <記事タイトルまたはキーワード>` - microCMSの下書き記事を校正
- `/blog-polish` - 直前の会話で扱った記事を校正

## 手順

### 1. 記事の読み込み

**microCMSの場合**:
1. ToolSearchで `microcms get` を検索し、`mcp__microcms__microcms_get_list` と `mcp__microcms__microcms_get_content` をロード
2. `mcp__microcms__microcms_get_list`（endpoint: `blogs`）で記事一覧を取得
3. タイトルやキーワードで該当記事を特定
4. `mcp__microcms__microcms_get_content`（endpoint: `blogs`, contentId: `...`）で本文を取得

### 2. 校正チェック

以下の観点で文章を確認する:

#### 2-1. 基本校正
- 誤字脱字
- 文法の誤り
- 表記ゆれ（同じ用語の表記が統一されているか）
- 句読点の過不足
- 助詞の重複・誤用

#### 2-2. 読みやすさ向上
- 1文が長すぎる箇所（60文字超）を分割
- 段落が長すぎる箇所を分割
- 冗長な表現の簡潔化
- 主語と述語の対応

#### 2-3. カタダ文体への調整

`/blog-humanize` のSKILL.mdに定義されたルールを参考に、以下を軽く調整する。
**ただし大幅な書き直しはしない。微調整に留める。**

- 語尾のバリエーション（同じ語尾が3回以上連続していたら調整）
- 「です・ます」調の統一
- くだけた表現を適度に混ぜる（「〜ですよね」「〜かなと」「〜なんですが」）
- 接続詞の過多を削減
- 保険・逃げ文句があれば削除（「一概には言えませんが」等）
- テンプレ的な締めを内容に即した表現に変更

### 3. 厳守事項

- **ユーザーの体験・事実・意見は一切変えない**
- ユーザーが書いた固有名詞・数値・データはそのまま残す
- 見出し構成は変えない
- 文字数は元文から大きく増減させない（目安: ±10%以内）
- プレースホルダー（`<!-- USER_WRITE: -->`, `<!-- IMAGE: -->` 等）が残っていても削除しない
- 元の文章にない情報を追加しない

### 4. microCMSの更新

1. ToolSearchで `microcms update draft` を検索し、`mcp__microcms__microcms_update_content_draft` をロード
2. 校正後の記事で下書きを更新:
   ```
   endpoint: "blogs"
   contentId: "対象記事のID"
   content: {
     "title": "記事タイトル",
     "content": "<h2>見出し</h2><p>校正後の本文HTML...</p>"
   }
   ```

### 5. 校正レポート

```markdown
# 校正・清書 完了

## 対象記事
- **記事**: [タイトル]
- **microCMS**: https://aiirononeko.microcms.io/apis/blogs/{contentId}

## 校正内容サマリー

| カテゴリ | 修正数 |
|---------|--------|
| 誤字脱字 | X箇所 |
| 文法 | X箇所 |
| 表記ゆれ | X箇所 |
| 読みやすさ | X箇所 |
| 文体調整 | X箇所 |

## Before/After（代表3例）

### 例1: [修正カテゴリ]
- **Before**: [修正前の文]
- **After**: [修正後の文]
- **理由**: [なぜ修正したか]

### 例2: [修正カテゴリ]
- **Before**: [修正前の文]
- **After**: [修正後の文]
- **理由**: [なぜ修正したか]

### 例3: [修正カテゴリ]
- **Before**: [修正前の文]
- **After**: [修正後の文]
- **理由**: [なぜ修正したか]

## 次のステップ

- `/blog-review` でチームレビュー
- microCMS管理画面で画像追加・最終確認
- `/blog-publish` で公開
```
