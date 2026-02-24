---
name: today
description: 今日のタスク・予定・シフトを確認
user-invocable: true
allowed-tools: Bash, ToolSearch, Read, Grep, Glob
---

# 今日の状況を確認

MCPを使って以下の情報を取得し表示してください。

## 1. 情報取得（MCP経由）

**環境変数の確認**（必要に応じて）:
```bash
echo $GOOGLE_CALENDAR_IDS
echo $SHIFT_SPREADSHEET_ID
```

### GitHub Projects

以下のGraphQLクエリでタスクのフィールド値（Status・Priority・Target date）を一括取得する:

```bash
gh api graphql -f query='
{
  user(login: "aiirononeko") {
    projectV2(number: 3) {
      items(first: 20) {
        nodes {
          id
          content {
            ... on DraftIssue { title body }
          }
          fieldValues(first: 20) {
            nodes {
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                field { ... on ProjectV2FieldCommon { name } }
              }
              ... on ProjectV2ItemFieldDateValue {
                date
                field { ... on ProjectV2FieldCommon { name } }
              }
            }
          }
        }
      }
    }
  }
}
'
```

取得後、**Backlog・ReadyのタスクについてPriorityを再計算する**（後述）。

### Google Calendar
- 認証確認: `mcp__google-calendar__manage-accounts` で `action: "list"` を実行
- 認証が切れている場合: `action: "add", account_id: "primary"` で再認証
- 今日の予定取得: `mcp__google-calendar__list-events` を使用
  - `calendarId`: 環境変数 `GOOGLE_CALENDAR_IDS` から取得（カンマ区切り配列）
  - `timeMin`: 今日の00:00（ISO 8601形式）
  - `timeMax`: 今日の23:59（ISO 8601形式）
  - `timeZone`: "Asia/Tokyo"

### Google Sheets（シフト）
**シフト解析手順**:

1. スプレッドシートデータ取得:
   ```
   mcp__google-sheets__sheets_get_values
   - spreadsheetId: 環境変数 SHIFT_SPREADSHEET_ID から取得
   - range: シフト表!A1:AB2163
   ```
   結果は自動的にファイルに保存される（パスを記録すること）

2. Pythonスクリプトでシフト解析:
   ```bash
   python3 /home/ryota/ghq/github.com/aiirononeko/workspace/scripts/parse_shift.py <保存されたファイルパス>
   ```

3. スクリプトの出力はJSON形式:
   ```json
   {
     "date": "2026/02/06",
     "weekday": "金",
     "column_index": 6,
     "shifts": [
       {
         "kikan": "#2601",
         "section": "ワーク",
         "note": "LT情報など",
         "roles": {"講師": "ちいかた", "TA": "えーと"}
       }
     ]
   }
   ```

**列インデックスと曜日の対応**（参考）:
- インデックス2: 月曜日
- インデックス3: 火曜日
- インデックス4: 水曜日
- インデックス5: 木曜日
- インデックス6: 金曜日
- インデックス7: 土曜日

## 1.5 Priority自動再計算

GraphQLで取得したタスク一覧のうち **Status が Backlog または Ready のもの** を対象に、以下のロジックでPriorityを再計算する。

### 判定テーブル

| 期限までの日数 | 第三者関与なし | 第三者関与あり |
|--------------|-------------|-------------|
| 0〜1日 | P0 | P0 |
| 2〜7日 | P1 | P0 |
| 8〜14日 | P2 | P1 |
| 15日以上 / 期限なし | P2 | P2 |

### 第三者関与キーワード（タイトル・本文で判定）

シフト、シフト作成、スケジュール調整、日程、配置、割り当て、Ms.Engineer、副業、外部、クライアント、発注、依頼、確認依頼、承認、共有、報告、MTG、定例、ミーティング、会議

### 再計算の実行手順

1. 各タスクの「現在のPriority」と「計算結果のPriority」を比較する
2. **差異があるタスクのみ** `gh project item-edit` でPriorityを更新する:
   ```bash
   gh project item-edit \
     --id <item-id> \
     --project-id PVT_kwHOAydZm84BQBr1 \
     --field-id PVTSSF_lAHOAydZm84BQBr1zg-Q9bY \
     --single-select-option-id <79628723=P0 / 0a877460=P1 / da944a9c=P2>
   ```
3. 変更があった場合は表示セクションの冒頭に通知する:
   ```
   🔄 Priority更新: 「タイトル」 P1 → P0（期限3日、シフト作成で昇格）
   ```
   変更がなければ通知不要。

## 2. 表示形式

### 📋 今日のタスク (GitHub Projects)
**表示対象**: Status が **Ready または In progress** のタスクのみ。

タスクがある場合:
| ID | タイトル | ステータス | 期限 |
|----|---------|-----------|------|

タスクがない場合: "現在対応中・対応予定のタスクはありません"

**⚠️ Backlog期日アラート**:
Status が Backlog のタスクのうち、Target date が今日から7日以内（当日含む）のものがあれば、テーブルの直後に以下の形式で通知する:

```
⚠️ Backlog内に期日が迫っているタスクがあります:
- 「タイトル」 期限: YYYY-MM-DD（あとX日）
```

期日が迫っているBacklogタスクがなければ通知不要。

### 📆 今日の予定 (Calendar)
| 時間 | 予定 | カレンダー |
|------|------|----------|

終日予定がある場合は「終日」と表示

### 🏫 今日のシフト (YYYY/MM/DD 曜日)
**重要**: Pythonスクリプトの出力結果に基づいて表示。

シフトがある場合、各期ごとにセクションを分けて表示:
```
### #XXXX (期ID)
**section**: section名またはワーク
**講師**: 担当者名
**TA**: 担当者名
**朝会**: 担当者名
**講義**: 担当者名
**レビュー・デモ会**: 担当者名
**夕会**: 担当者名

**備考**: note情報（LT、イベントなど）
```

シフトがない場合: "今日のシフトはありません"

---

## 3. 対話操作

表示後、以下の操作を提案:

**GitHub Projects タスク操作**:
- ✅ 完了にする（Doneに更新）
- ➕ 新規タスク作成
- 🔄 ステータス更新
- 詳細な操作は `/github-task` を使用

**Calendar予定操作**:
- 📝 予定の詳細表示
- ➕ 新規予定追加
