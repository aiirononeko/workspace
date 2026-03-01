#!/bin/bash
set -euo pipefail

# ============================================================
# Smoke Test Runner
# 目的: システムの致命的崩壊を検知する高速テスト（2分以内）
# 使い方: ./scripts/smoke-test.sh
# ============================================================

cd "$(dirname "$0")/.."

PASS=0
FAIL=0
ERRORS=()

run_test() {
  local name="$1"
  shift
  if "$@" > /dev/null 2>&1; then
    echo "  ✅ $name"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $name"
    FAIL=$((FAIL + 1))
    ERRORS+=("$name")
  fi
}

echo "🔥 Smoke Test Starting..."
echo ""

# --- 依存関係 ---
echo "📦 Dependencies"
run_test "node_modulesが存在する" test -d node_modules
run_test "bun.lockが存在する" test -f bun.lock

# --- エントリポイント ---
echo "📄 Entry Points"
run_test "index.tsが存在する" test -f src/index.ts
run_test "config.tsが存在する" test -f src/config.ts

# --- 構文チェック（bun transpile） ---
echo "🧪 Syntax Check"
for f in src/*.ts src/commands/*.ts; do
  name="$(basename "$f")"
  dir="$(dirname "$f")"
  [ "$dir" = "src/commands" ] && name="commands/${name}"
  run_test "${name}の構文が正しい" bun build --target=bun "$f"
done

# --- ナレッジ提案の整合性 ---
echo "💡 Knowledge Proposal"
run_test "KnowledgeAnalysisのrelevantフィールドがexportされている" \
  grep -q 'relevant:' src/knowledge-proposer.ts
run_test "分析プロンプトにrelevant判定基準が含まれている" \
  grep -q 'relevant.*true\|relevant.*false' src/knowledge-proposer.ts

# --- 結果サマリー ---
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $FAIL -eq 0 ]; then
  echo "✅ All $PASS tests passed"
  exit 0
else
  echo "❌ $FAIL/$((PASS + FAIL)) tests failed:"
  for err in "${ERRORS[@]}"; do
    echo "   - $err"
  done
  exit 1
fi
