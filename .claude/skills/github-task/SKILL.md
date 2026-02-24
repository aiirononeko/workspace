---
name: github-task
description: GitHub Projectsのタスクを対話的にCRUD操作する
user-invocable: true
allowed-tools: Bash
---

# GitHub Projects タスク管理

`gh` CLIを使ってGitHub Projectsのタスクを操作します。

## プロジェクト定数

```
PROJECT_NUMBER = 3
PROJECT_ID     = PVT_kwHOAydZm84BQBr1
OWNER          = aiirononeko
```

## Statusフィールド

```
FIELD_ID = PVTSSF_lAHOAydZm84BQBr1zg-Q9WI

オプションID:
  Backlog     = f75ad846
  Ready       = 61e4505c
  In progress = 47fc9ee4
  Done        = 98236657
```

## Target dateフィールド

```
FIELD_ID = PVTF_lAHOAydZm84BQBr1zg-Q9bo
型: date（YYYY-MM-DD形式）
```

## Assigneesフィールド

```
FIELD_ID = PVTF_lAHOAydZm84BQBr1zg-Q9WE
常に aiirononeko を設定する（DraftIssueはGraphQL APIで設定）
```

## Priorityフィールド

```
FIELD_ID = PVTSSF_lAHOAydZm84BQBr1zg-Q9bY

オプションID:
  P0 = 79628723
  P1 = 0a877460
  P2 = da944a9c
```

### Priority自動判定ロジック

タスク作成・再計算時に以下のロジックを適用する。
**基本原則: 期限の近さが支配的。期限が遠い場合は第三者関与があってもP2。**

#### 判定テーブル

| 期限までの日数 | 第三者関与なし | 第三者関与あり |
|--------------|-------------|-------------|
| 0〜1日 | P0 | P0 |
| 2〜7日（今週中） | P1 | P0 |
| 8〜14日（2週間以内） | P2 | P1 |
| 15日以上 / 期限なし | P2 | P2 |

#### 第三者関与の判定キーワード

タイトル・本文に以下を含む場合「第三者関与あり」と判定:

- **他者スケジュール影響**: シフト、シフト作成、スケジュール調整、日程、配置、割り当て
- **外部組織関与**: Ms.Engineer、副業、外部、クライアント、発注、契約
- **依頼・連絡が必要**: 依頼、確認依頼、承認、共有、報告
- **チーム意思決定**: MTG、定例、ミーティング、会議、チーム決定

#### 判定結果の報告

タスク作成時・再計算時にユーザーへ説明する:
```
Priority: P1
理由: 期限まで5日（2-7日ゾーン）、シフト作成（他者スケジュール影響）で昇格 → P0
```

ユーザーが異議を唱えた場合はすぐに修正する。

## Sizeフィールド

```
FIELD_ID = PVTSSF_lAHOAydZm84BQBr1zg-Q9bc

オプションID:
  XS = 6c6483d2
  S  = f784b110
  M  = 7515a9f1
  L  = 817d0097
  XL = db339eb2
```

---

## 操作コマンド

### 一覧表示

```bash
gh project item-list 3 --owner aiirononeko --format json
```

表示形式:
| ID | タイトル | ステータス |
|----|---------|-----------|

### タスク作成

**ルール（必須）:**
- 期限が指定された場合 → Description（body）には入れず、**Target dateフィールドに設定する**
- Assigneesは**常に aiirononeko** を設定する
- Priorityは**必ず自動判定ロジックで推定して設定する**（判定理由をユーザーに説明する）

```bash
# 1. アイテム作成
gh project item-create 3 --owner aiirononeko \
  --title "タイトル" \
  --body "本文（Markdown）"
# → 返却された item-id と content.id（DraftIssueのID）を記録
```

作成後、以下を順番に実行:

```bash
# 2. Statusを設定
gh project item-edit \
  --id <item-id> \
  --project-id PVT_kwHOAydZm84BQBr1 \
  --field-id PVTSSF_lAHOAydZm84BQBr1zg-Q9WI \
  --single-select-option-id <status-option-id>

# 3. Target dateを設定（期限がある場合）
gh project item-edit \
  --id <item-id> \
  --project-id PVT_kwHOAydZm84BQBr1 \
  --field-id PVTF_lAHOAydZm84BQBr1zg-Q9bo \
  --date "YYYY-MM-DD"

# 4. Priorityを設定（自動判定ロジックで決定した値を使う）
gh project item-edit \
  --id <item-id> \
  --project-id PVT_kwHOAydZm84BQBr1 \
  --field-id PVTSSF_lAHOAydZm84BQBr1zg-Q9bY \
  --single-select-option-id <priority-option-id>
# P0=79628723 / P1=0a877460 / P2=da944a9c

# 5. Assigneesを設定（DraftIssue用 GraphQL API）
# aiirononeko のユーザーNodeID: U_kgDOAydZmw
# DraftIssueのIDはitem-createの返却値 content.id（例: DI_lAHO...）
gh api graphql -f query='mutation {
  updateProjectV2DraftIssue(input: {
    draftIssueId: "<draft-issue-id>",
    assigneeIds: ["U_kgDOAydZmw"]
  }) {
    draftIssue { assignees(first: 10) { nodes { login } } }
  }
}'
```

### ステータス更新

```bash
# Backlogに変更
gh project item-edit \
  --id <item-id> \
  --project-id PVT_kwHOAydZm84BQBr1 \
  --field-id PVTSSF_lAHOAydZm84BQBr1zg-Q9WI \
  --single-select-option-id f75ad846

# In progressに変更
gh project item-edit \
  --id <item-id> \
  --project-id PVT_kwHOAydZm84BQBr1 \
  --field-id PVTSSF_lAHOAydZm84BQBr1zg-Q9WI \
  --single-select-option-id 47fc9ee4

# Doneに変更
gh project item-edit \
  --id <item-id> \
  --project-id PVT_kwHOAydZm84BQBr1 \
  --field-id PVTSSF_lAHOAydZm84BQBr1zg-Q9WI \
  --single-select-option-id 98236657
```

### タスク削除

```bash
gh project item-delete 3 --owner aiirononeko --id <item-id>
```

### フィールド確認

```bash
gh project field-list 3 --owner aiirononeko --format json
```

---

## 対話フロー

起動後、以下を確認してユーザーに選択させる:

1. まず一覧表示して現状を把握
2. 操作を選択:
   - `list` - 一覧表示
   - `create` - 新規作成
   - `update` - ステータス/フィールド更新
   - `delete` - 削除
3. 選択に応じて上記コマンドを実行
4. 結果を表示して次の操作を提案
