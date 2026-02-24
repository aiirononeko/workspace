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

## Priorityフィールド

```
FIELD_ID = PVTSSF_lAHOAydZm84BQBr1zg-Q9bY

オプションID:
  P0 = 79628723
  P1 = 0a877460
  P2 = da944a9c
```

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

```bash
gh project item-create 3 --owner aiirononeko \
  --title "タイトル" \
  --body "本文（Markdown）"
```

作成後、返却された `id` を使ってStatusを設定:

```bash
gh project item-edit \
  --id <item-id> \
  --project-id PVT_kwHOAydZm84BQBr1 \
  --field-id PVTSSF_lAHOAydZm84BQBr1zg-Q9WI \
  --single-select-option-id <status-option-id>
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
