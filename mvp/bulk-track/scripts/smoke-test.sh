#!/bin/bash
set -euo pipefail

# ============================================================
# Smoke Test Runner
# 目的: システムの致命的崩壊を検知する高速テスト（2分以内）
# 使い方: ./scripts/smoke-test.sh
# ============================================================

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

# --- 型チェック ---
echo "🔍 Type Check"
run_test "型チェックが通る" npx tsc --noEmit

# --- Lint ---
echo "🧹 Lint"
run_test "ESLintが通る" npx eslint

# --- ビルド ---
echo "📦 Build"
run_test "Next.jsビルドが成功する" npm run build

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
