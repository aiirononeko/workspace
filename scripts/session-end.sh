#!/bin/bash
# SessionEnd hook: セッション終了時にサマリーを自動生成
# stdin から JSON を受け取る: { session_id, transcript_path, cwd, reason }

set -euo pipefail

# --- 入力パース ---
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
REASON=$(echo "$INPUT" | jq -r '.reason // empty')

# トランスクリプトが存在しなければ終了
if [ -z "$TRANSCRIPT_PATH" ] || [ ! -f "$TRANSCRIPT_PATH" ]; then
  exit 0
fi

# --- 出力先 ---
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$CWD}"
OUTPUT_DIR="$PROJECT_DIR/knowledge/sessions"
mkdir -p "$OUTPUT_DIR"

DATE=$(date +%Y-%m-%d)
TIME=$(date +%H:%M)
SHORT_ID="${SESSION_ID:0:8}"
OUTPUT_FILE="$OUTPUT_DIR/${DATE}-${SHORT_ID}.md"

# --- メタデータ抽出（高速・同期） ---

# 使用ツール集計
TOOL_STATS=$(jq -r '
  select(.type == "tool_use") |
  .name // empty
' "$TRANSCRIPT_PATH" 2>/dev/null | sort | uniq -c | sort -rn | head -15 || echo "  (取得不可)")

# 変更ファイル抽出（Edit/Write ツールから）
CHANGED_FILES=$(jq -r '
  select(.type == "tool_use") |
  select(.name == "Edit" or .name == "Write" or .name == "NotebookEdit") |
  .input.file_path // .input.notebook_path // empty
' "$TRANSCRIPT_PATH" 2>/dev/null | sort -u | head -20 || echo "  (取得不可)")

# --- メタデータ部分を先に書き出し ---
cat > "$OUTPUT_FILE" << EOF
# Session Summary - ${DATE} ${TIME}

## 概要
(生成中...)

## メタデータ
- Session ID: ${SHORT_ID}
- 作業ディレクトリ: ${CWD}
- 終了理由: ${REASON}

## 使用ツール
${TOOL_STATS}

## 変更ファイル
${CHANGED_FILES:-  (なし)}
EOF

# --- バックグラウンドで要約生成 ---
nohup bash -c '
  OUTPUT_FILE="'"$OUTPUT_FILE"'"
  TRANSCRIPT_PATH="'"$TRANSCRIPT_PATH"'"

  # トランスクリプトからユーザー・アシスタントの会話を抽出（最大8000文字）
  CONVERSATION=$(jq -r "
    select(.type == \"human\" or .type == \"assistant\") |
    if .type == \"human\" then \"User: \" + (.message // .content // \"(入力)\" | tostring)
    elif .type == \"assistant\" then \"Assistant: \" + (.content // \"(応答)\" | tostring)
    else empty end
  " "$TRANSCRIPT_PATH" 2>/dev/null | head -c 8000 || true)

  if [ -n "$CONVERSATION" ]; then
    SUMMARY=$(echo "$CONVERSATION" | timeout 60 claude -p \
      "以下のClaude Codeセッションの会話ログを日本語で簡潔に要約してください。
- 何をしたか（目的と結果）
- 主要な決定事項
- 未完了の作業があれば記載
3-5行程度で。" \
      --model haiku 2>/dev/null || echo "(要約生成失敗)")
  else
    SUMMARY="(会話データなし)"
  fi

  # 概要セクションをpythonで置換（マルチライン対応）
  python3 -c "
import sys
with open(sys.argv[1], \"r\") as f:
    content = f.read()
content = content.replace(\"(生成中...)\", sys.argv[2], 1)
with open(sys.argv[1], \"w\") as f:
    f.write(content)
" "$OUTPUT_FILE" "$SUMMARY" 2>/dev/null || true
' > /dev/null 2>&1 &

exit 0
