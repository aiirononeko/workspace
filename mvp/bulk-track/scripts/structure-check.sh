#!/bin/bash
set -euo pipefail

# ============================================================
# Structure Check
# 目的: アーキテクチャ境界と依存関係ルールの機械的検証
# 使い方: ./scripts/structure-check.sh
# ============================================================

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$PROJECT_DIR/src"

PASS=0
FAIL=0
ERRORS=()

pass() {
  echo "  ✅ $1"
  PASS=$((PASS + 1))
}

fail() {
  echo "  ❌ $1"
  FAIL=$((FAIL + 1))
  ERRORS+=("$1")
}

# 禁止パターンがないことを確認（見つかったらFAIL）
check_no_match() {
  local name="$1"
  local pattern="$2"
  local dir="$3"
  if grep -r "$pattern" "$dir" 2>/dev/null; then
    fail "$name"
  else
    pass "$name"
  fi
}

# ファイル存在チェック
check_exists() {
  local name="$1"
  local path="$2"
  if [ -f "$path" ]; then
    pass "$name"
  else
    fail "$name"
  fi
}

echo "🏗️  Structure Check Starting..."
echo ""

# --- 依存関係チェック ---
echo "📐 Architecture Rules"

# types/ は他モジュールに依存しない
check_no_match "types/ → lib/への依存禁止" \
  "from.*@/lib" "$SRC/types/"

# db/ は agent/ や line/ に依存しない
check_no_match "db/ → agent/への依存禁止" \
  "from.*@/lib/agent" "$SRC/lib/db/"

check_no_match "db/ → line/への依存禁止" \
  "from.*@/lib/line" "$SRC/lib/db/"

# line/ は agent/ や db/ に依存しない
check_no_match "line/ → agent/への依存禁止" \
  "from.*@/lib/agent" "$SRC/lib/line/"

check_no_match "line/ → db/への依存禁止" \
  "from.*@/lib/db" "$SRC/lib/line/"

# agent/ は line/ に直接依存しない
check_no_match "agent/ → line/への直接依存禁止" \
  "from.*@/lib/line" "$SRC/lib/agent/"

# --- ファイル構造チェック ---
echo ""
echo "📁 File Structure"

check_exists "types/index.ts が存在する" "$SRC/types/index.ts"
check_exists "app/api/line/webhook/route.ts が存在する" "$SRC/app/api/line/webhook/route.ts"
check_exists "lib/db/client.ts が存在する" "$SRC/lib/db/client.ts"
check_exists "lib/agent/bulk-agent.ts が存在する" "$SRC/lib/agent/bulk-agent.ts"
check_exists "lib/agent/safety-rules.ts が存在する" "$SRC/lib/agent/safety-rules.ts"

# --- 結果サマリー ---
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $FAIL -eq 0 ]; then
  echo "✅ All $PASS checks passed"
  exit 0
else
  echo "❌ $FAIL/$((PASS + FAIL)) checks failed:"
  for err in "${ERRORS[@]}"; do
    echo "   - $err"
  done
  exit 1
fi
