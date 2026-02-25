---
name: shift-assign
description: 夜間・週末コースの講師シフトを対話的に割り当てる
user-invocable: true
allowed-tools: Bash, ToolSearch, Read, Grep
---

# 夜間・週末シフト割当

対話形式で夜間・週末コースの講師シフトを確認・割当・書き込みする。

## 定数

```
SPREADSHEET_ID: 1bg0fy7zd9yd4xVDNaQMSEHgmZWtxmvb5nWqHgX9a6Ys
シフト表シート:    シフト表
提出シート:       夜間・週末シフト提出
SCRIPT_PATH:     /home/ryota/ghq/github.com/aiirononeko/workspace/scripts/shift_assign.py
```

## Phase 1: 対象週の確認

引数で週（YYYY-MM-DD 形式の月曜日）が指定されていれば使用する。
指定がなければ今日の日付から次の月曜日を計算して提案し、ユーザーに確認する。

```bash
# 今日の日付から次の月曜日を計算
python3 -c "
from datetime import datetime, timedelta
today = datetime.now()
days_ahead = (7 - today.weekday()) % 7
if days_ahead == 0: days_ahead = 7
monday = today + timedelta(days=days_ahead)
print(monday.strftime('%Y-%m-%d'))
"
```

ユーザーに確認:
```
対象週: 2026/02/23（月）〜 2026/02/28（土）
この週のシフトを割り当てますか？[y/n または別の日付(YYYY-MM-DD)]
```

## Phase 2: データ読み込み

ToolSearch で以下のMCPツールをロード:
- クエリ `google sheets get values` → `mcp__google-sheets__sheets_get_values`
- クエリ `google sheets batch update` → `mcp__google-sheets__sheets_batch_update_values`

### シフト表取得
```
mcp__google-sheets__sheets_get_values
  spreadsheetId: 1bg0fy7zd9yd4xVDNaQMSEHgmZWtxmvb5nWqHgX9a6Ys
  range: シフト表!A1:H2163
```
結果はファイルに保存される（パスを記録する）。

### 提出シート取得
```
mcp__google-sheets__sheets_get_values
  spreadsheetId: 1bg0fy7zd9yd4xVDNaQMSEHgmZWtxmvb5nWqHgX9a6Ys
  range: 夜間・週末シフト提出!A1:P1000
```
結果はファイルに保存される（パスを記録する）。

## Phase 3: データ解析

Pythonスクリプトを実行して夜間・週末期ブロックと稼働可能情報を取得:

```bash
python3 /home/ryota/ghq/github.com/aiirononeko/workspace/scripts/shift_assign.py \
  --shift-table <シフト表データJSONファイルパス> \
  --availability <提出シートデータJSONファイルパス> \
  --week <YYYY-MM-DD>
```

スクリプトの終了コードを確認:
- `0`: 正常
- `2`: 日付行が見つからない → 「指定した週のデータがシフト表に見つかりませんでした。別の週を指定してください。」と表示して終了
- その他: エラー詳細を表示

スクリプト出力（JSON）の構造:
```json
{
  "week_start": "2026/02/23",
  "night_blocks": [
    {
      "kikan_id": "#2601",
      "section": "ワーク",
      "instructor_row_abs": 156,
      "dates": {
        "月": {
          "date": "2026/02/23",
          "col_letter": "C",
          "col_index": 2,
          "current_value": "",
          "availability": {
            "まりあ": "OK",
            "えーと": "OK",
            "ちいかた": "20:00-"
          }
        }
      }
    }
  ]
}
```

## Phase 4: 対話UI（週ごとに確認・割当）

解析結果の `night_blocks` を順に処理する。
各ブロック × 各曜日について以下の手順で対話する。

### 表示形式

```
## 📋 シフト割当 - 2026/02/23 の週

### #2601 ワーク

#### 月曜 2026/02/23
現在の割当: （未割当）

| 講師     | 稼働可否   |
|---------|-----------|
| まりあ   | OK        |
| えーと   | OK        |
| ちいかた | 20:00-    |

※ NGまたは情報なしの講師は省略。全講師を見るには「?」を入力。

割り当てる講師名を入力（スキップ: s / 全講師表示: ? / 自動選択: auto）:
```

**既存値がある場合**（`current_value` が空でない場合）:
```
#### 月曜 2026/02/23
現在の割当: まりあ ⚠️（既に割当済み）

上書きしますか？[y/n]
```
- `n` → スキップして次へ
- `y` → 通常の割当UIを表示

### 入力パターン

| 入力 | 動作 |
|-----|------|
| 講師名（部分一致可） | その講師を割当 |
| `s` | スキップ（後で手動） |
| `?` | 全講師の稼働状況を再表示（NGも含む） |
| `auto` | 稼働可否が「OK」の最初の講師を自動選択 |

**部分一致の場合**: 候補が複数あれば一覧表示して再入力を求める。

### 週完了後の確認画面

全ブロック・全曜日の処理完了後に確認画面を表示:

```
## 確認 - 書き込み予定内容

| 期ID   | セクション | 曜日 | 日付       | 講師    | 稼働状況  |
|--------|---------|------|-----------|--------|---------|
| #2601  | ワーク    | 月   | 2026/02/23| まりあ  | OK      |
| #2601  | ワーク    | 水   | 2026/02/25| えーと  | OK      |
| #2512  | 講座     | 火   | 2026/02/24| ちいかた| 20:00-  |

スキップした日付:
- #2601 ワーク 金曜（2026/02/27）
- #2512 講座 木曜（2026/02/26）

この内容でシフト表に書き込みますか？ [y/n]
```

書き込む内容がない場合（全スキップ）は:
```
割当内容がありません。終了します。
```

## Phase 5: シフト表への書き込み

`y` 承認後のみ実行する。

`mcp__google-sheets__sheets_batch_update_values` を使用:
```
spreadsheetId: 1bg0fy7zd9yd4xVDNaQMSEHgmZWtxmvb5nWqHgX9a6Ys
valueInputOption: USER_ENTERED
data: [
  {"range": "シフト表!C156", "values": [["まりあ"]]},
  {"range": "シフト表!E156", "values": [["えーと"]]},
  ...
]
```

セルのアドレスは `シフト表!{col_letter}{instructor_row_abs + 1}` で計算する。
（スプレッドシートの行番号は1始まりのため `instructor_row_abs + 1` を使用）

### 完了報告

```
✅ 書き込み完了

| 期ID   | セクション | 曜日 | セル  | 講師    |
|--------|---------|------|------|--------|
| #2601  | ワーク    | 月   | C156 | まりあ  |
| #2601  | ワーク    | 水   | E156 | えーと  |

次の操作:
- 次の週を処理する → 「次の週」と入力
- 別の週を指定 → 「YYYY-MM-DD」を入力
- 終了 → 「終了」と入力
```

「次の週」と入力された場合は、同じ週の翌週の月曜日を `week` として Phase 1 から再実行する。
別の日付が入力された場合はその週を対象として Phase 1 から再実行する。

## エラーケース対応

| エラー | 対応 |
|-------|------|
| 日付行が見つからない（終了コード2） | 別の週を入力するよう案内 |
| 提出シートに該当日付なし | 「稼働情報なし」として継続確認 |
| `night_blocks` が空 | 「夜間・週末期ブロックが見つかりませんでした。シフト表の該当週を確認してください。」と表示 |
| 書き込みエラー | エラー詳細を表示し、シートの保護設定を確認するよう案内 |

## 注意事項

- **書き込みは `y` 承認後のみ実行**する。確認なしに書き込まない。
- 既存値がある場合は必ず警告・確認を取る。
- スクリプトが失敗した場合は stderr の内容を表示してユーザーに状況を伝える。
