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
- `gh project item-list 3 --owner aiirononeko --format json` でタスク一覧取得

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

## 2. 表示形式

### 📋 今日のタスク (GitHub Projects)
タスクがある場合:
| ID | タイトル | ステータス | 期限 |
|----|---------|-----------|------|

タスクがない場合: "現在割り当てられているタスクはありません"

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
