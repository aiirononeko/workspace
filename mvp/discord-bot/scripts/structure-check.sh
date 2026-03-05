#!/bin/bash
set -euo pipefail

# ============================================================
# Structure Check
# 目的: アーキテクチャ境界と依存関係ルールの機械的検証
# 使い方: ./scripts/structure-check.sh
# ============================================================

cd "$(dirname "$0")/.."

PASS=0
FAIL=0
ERRORS=()

check_pass() {
  local name="$1"
  echo "  ✅ $name"
  PASS=$((PASS + 1))
}

check_fail() {
  local name="$1"
  echo "  ❌ $name"
  FAIL=$((FAIL + 1))
  ERRORS+=("$name")
}

# grepがマッチしないことを確認する（マッチしたら失敗）
check_no_match() {
  local name="$1"
  shift
  if "$@" > /dev/null 2>&1; then
    check_fail "$name"
  else
    check_pass "$name"
  fi
}

# 条件が真であることを確認する
check_true() {
  local name="$1"
  shift
  if "$@" > /dev/null 2>&1; then
    check_pass "$name"
  else
    check_fail "$name"
  fi
}

echo "🏗️  Structure Check Starting..."
echo ""

# --- 依存関係ルール ---
echo "📐 Architecture Rules"

# config.ts はリーフ依存（他のsrcモジュールをimportしない）
check_no_match "config.tsがリーフ依存である" \
  grep -E 'from\s+"\.\/(claude|guard|summarize|bookmark|button|knowledge|index|commands)' src/config.ts

# guard.ts は config.ts のみに依存
check_no_match "guard.tsがconfig以外のsrcモジュールをimportしない" \
  grep -E 'from\s+"\.\/(claude|summarize|bookmark|button|knowledge|index|commands)' src/guard.ts

# claude.ts は config.ts のみに依存
check_no_match "claude.tsがconfig以外のsrcモジュールをimportしない" \
  grep -E 'from\s+"\.\/(guard|summarize|bookmark|button|knowledge|index|commands)' src/claude.ts

# commands/ 配下のファイル同士の相互import禁止
check_no_match "commands/配下が他のcommandをimportしない" \
  grep -rE 'from\s+"\.\/(ask|save|summarize|task|memory)' src/commands/

# agent-executor.ts は config.ts のみに依存
if [ -f src/agent-executor.ts ]; then
  check_no_match "agent-executor.tsがconfig以外のsrcモジュールをimportしない" \
    grep -E 'from\s+"\.\/(claude|guard|personality|summarize|bookmark|button|knowledge|index|commands|mention|memory|prompt-builder)' src/agent-executor.ts
fi

# progress-reporter.ts はリーフ依存（agent-executor.tsの型のみ許可）
if [ -f src/progress-reporter.ts ]; then
  check_no_match "progress-reporter.tsがconfig/claudeをimportしない" \
    grep -E 'from\s+"\.\/(config|claude|guard|personality|summarize|bookmark|button|knowledge|index|commands|mention|memory|prompt-builder)' src/progress-reporter.ts
fi

# agent-executor.ts は personality.ts をimportしない
if [ -f src/agent-executor.ts ]; then
  check_no_match "agent-executor.tsがpersonalityをimportしない" \
    grep -E 'from\s+"\./personality' src/agent-executor.ts
fi

# --- 通知Job境界ルール ---
echo "📬 Notification Job Boundary Rules"

# jobs/notifier/providers からBot本体モジュールをimportしない
for dir in src/jobs src/notifier src/providers; do
  if [ -d "$dir" ]; then
    check_no_match "${dir}/がBot本体モジュールをimportしない" \
      grep -rE 'from\s+"\.\.\/(config|claude|guard|personality|summarize|bookmark|button|knowledge|index|mention|memory|memory-extractor|prompt-builder|agent-executor|progress-reporter)' "$dir/"
  fi
done

# --- 環境変数の直接参照禁止（config.ts以外） ---
echo "🔒 Environment Variable Rules"

# jobs/notifier/providers は process.env 直接参照OK（Bot本体のconfig.tsに依存しない設計）
if grep -rn "process\.env" src/ --include="*.ts" -l 2>/dev/null | grep -v "src/config.ts" | grep -v "src/jobs/" | grep -v "src/notifier/" | grep -v "src/providers/" > /dev/null 2>&1; then
  check_fail "Bot本体でconfig.ts以外のprocess.env直接参照がない"
else
  check_pass "Bot本体でconfig.ts以外のprocess.env直接参照がない"
fi

# --- 人格プロンプト境界ルール ---
echo "🎭 Personality Boundary Rules"

# personality.ts はリーフ依存（他のsrcモジュールをimportしない）
if [ -f src/personality.ts ]; then
  check_no_match "personality.tsがリーフ依存である" \
    grep -E 'from\s+"\.\/(claude|guard|config|summarize|bookmark|button|knowledge|index|commands)' src/personality.ts
fi

# claude.ts は personality.ts をimportしない（呼び出し元が渡す設計）
check_no_match "claude.tsがpersonalityをimportしない" \
  grep -E 'from\s+"\./personality' src/claude.ts

# 構造化出力モジュールは personality.ts をimportしない
check_no_match "knowledge-proposer.tsがpersonalityをimportしない" \
  grep -E 'from\s+"\./personality' src/knowledge-proposer.ts

check_no_match "button-handler.tsがpersonalityをimportしない" \
  grep -E 'from\s+"\./personality' src/button-handler.ts

# --- メモリシステムルール ---
echo "🧠 Memory System Rules"

# memory.ts は config.ts のみに依存（リーフライク）
if [ -f src/memory.ts ]; then
  check_no_match "memory.tsがconfig以外のsrcモジュールをimportしない" \
    grep -E 'from\s+"\.\/(claude|guard|personality|summarize|bookmark|button|knowledge|index|commands|mention|memory-extractor)' src/memory.ts
fi

# memory-extractor.ts は personality.ts をimportしない
if [ -f src/memory-extractor.ts ]; then
  check_no_match "memory-extractor.tsがpersonalityをimportしない" \
    grep -E 'from\s+"\./personality' src/memory-extractor.ts
fi

# --- ナレッジ提案ルール ---
echo "💡 Knowledge Proposal Rules"

# KnowledgeAnalysis に relevant フィールドが存在する
check_true "KnowledgeAnalysisにrelevantフィールドがある" \
  grep -q 'relevant.*boolean' src/knowledge-proposer.ts

# ナレッジ提案ボタン表示前に relevant チェックがある
check_true "ナレッジ提案にrelevantフィルタがある" \
  grep -q 'analysis.relevant' src/bookmark-watcher.ts

# cacheAnalysis が embedMeta を受け取る（引数に embedMeta がある）
check_true "cacheAnalysisがembedMetaを保持する" \
  grep -q 'embedMeta' src/button-handler.ts

# --- ファイル構造 ---
echo "📁 File Structure"

check_true "srcディレクトリが存在する" test -d src
check_true "commandsディレクトリが存在する" test -d src/commands
check_true "package.jsonが存在する" test -f package.json
check_true "tsconfig.jsonが存在する" test -f tsconfig.json

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
