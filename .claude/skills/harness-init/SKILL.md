---
name: harness-init
description: |
  対象プロジェクトにハーネスエンジニアリングの基盤を構築する。
  DoD定義、スモークテスト、構造テストを生成し、段階的に強化していく土台を作る。
  トリガー: "harness-init", "ハーネス初期化", "ハーネス構築", "ハーネスセットアップ"
user-invocable: true
allowed-tools: Bash, Read, Edit, Write, Glob, Grep, Task
---

# ハーネス初期構築

対象プロジェクトにハーネスエンジニアリングの基盤を構築するスキル。
naoya_ito式の段階的アプローチ: まずDoD定義から始め、失敗をフィードバックとして徐々に強化する。

## 処理フロー

### Step 1: 対象プロジェクトの特定

ユーザーに対象プロジェクトのディレクトリを確認する。
引数で指定されていればそれを使う。指定がなければ質問する。

```
対象プロジェクトのパスを教えてください（例: /home/ryota/ghq/github.com/user/project）
```

### Step 2: プロジェクト構造の分析

対象ディレクトリで以下を調査する:

1. **言語・フレームワーク**: package.json, Cargo.toml, go.mod, pyproject.toml, Gemfile 等
2. **テストツール**: jest, vitest, pytest, go test, cargo test 等
3. **ビルドシステム**: npm/pnpm/bun, make, cargo, gradle 等
4. **既存のCLAUDE.md/AGENTS.md**: すでにあるか確認
5. **既存テスト**: tests/, __tests__/, spec/ 等の有無
6. **CI設定**: .github/workflows/, .circleci/ 等

```bash
# プロジェクト構造の把握
ls -la <project_dir>
ls <project_dir>/src/ 2>/dev/null || true
```

分析結果をまとめてユーザーに報告する。

### Step 3: Codexと相談（オプション）

Taskツールを使い、Codex CLIでプロジェクトに最適なハーネス設計を相談する:

```bash
codex exec --full-auto --sandbox read-only --cd <project_dir> \
  "このプロジェクトの構造を分析して、以下の観点で最適なハーネス設計を提案してください:
   1. スモークテストに含めるべきクリティカルパス（5-10項目）
   2. 守るべきアーキテクチャ境界（依存関係の方向性、禁止import等）
   3. DoDに含めるべき完了定義
   確認や質問は不要です。具体的な提案まで自主的に出力してください。"
```

**注意**: Codex相談は必須ではない。ユーザーが不要と言えばスキップ可能。

### Step 4: ファイル生成

以下の4ファイルを生成する。

#### 4-1. CLAUDE.md（DoDセクション追記 or 新規作成）

既存のCLAUDE.mdがあれば末尾に追記、なければ新規作成。

```markdown
## Definition of Done (DoD)

コード変更が「完了」と見なされるための条件:

1. `scripts/smoke-test.sh` が全てパスすること
2. `scripts/structure-check.sh` が全てパスすること
3. 既存テストが壊れていないこと（`<test_command>`）
4. 型チェックが通ること（該当する場合）
5. ビルドが成功すること

## アーキテクチャ境界

<プロジェクト分析に基づいて記述>

### 禁止事項

<プロジェクト分析に基づいて記述>
```

#### 4-2. scripts/smoke-test.sh

**重要**: 2分以内で完了する高速テスト群。

```bash
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

# --- ビルドテスト ---
echo "📦 Build"
run_test "ビルドが成功する" <build_command>

# --- 型チェック ---
echo "🔍 Type Check"
run_test "型チェックが通る" <typecheck_command>

# --- テスト ---
echo "🧪 Core Tests"
run_test "コアテストがパスする" <test_command>

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
```

**プロジェクトに応じてコマンドをカスタマイズすること**:
- Node.js: `npm run build`, `npx tsc --noEmit`, `npm test`
- Go: `go build ./...`, `go vet ./...`, `go test ./...`
- Rust: `cargo build`, `cargo clippy`, `cargo test`
- Python: `python -m py_compile`, `mypy .`, `pytest`

#### 4-3. scripts/structure-check.sh

```bash
#!/bin/bash
set -euo pipefail

# ============================================================
# Structure Check
# 目的: アーキテクチャ境界と依存関係ルールの機械的検証
# 使い方: ./scripts/structure-check.sh
# ============================================================

PASS=0
FAIL=0
ERRORS=()

check() {
  local name="$1"
  shift
  if "$@"; then
    echo "  ✅ $name"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $name"
    FAIL=$((FAIL + 1))
    ERRORS+=("$name")
  fi
}

echo "🏗️  Structure Check Starting..."
echo ""

# --- 依存関係チェック ---
echo "📐 Architecture Rules"

# 例: UIレイヤーからインフラレイヤーへの直接依存を禁止
# check "UI→Infra直接参照なし" ! grep -r "from.*infrastructure" src/ui/ 2>/dev/null

# 例: 循環依存チェック
# check "循環依存なし" ! grep -r "from.*\.\./\.\." src/ 2>/dev/null

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
```

#### 4-4. docs/harness-log.md

```markdown
# Harness Engineering Log

ハーネス強化の履歴を記録する。

## フォーマット

| 日付 | 種別 | 原因 | 対策 |
|------|------|------|------|
| YYYY-MM-DD | コンテキスト不足/テスト不足/構造違反/ツール不足 | 何が起きたか | 何を追加・変更したか |

## 履歴

| 日付 | 種別 | 原因 | 対策 |
|------|------|------|------|
| <today> | 初期構築 | - | ハーネス基盤を構築（DoD, smoke-test, structure-check） |
```

### Step 5: 実行権限付与と動作確認

```bash
chmod +x <project_dir>/scripts/smoke-test.sh
chmod +x <project_dir>/scripts/structure-check.sh
```

初回のスモークテストを実行して動作確認:

```bash
cd <project_dir> && ./scripts/smoke-test.sh
```

### Step 6: 結果報告

以下の形式でユーザーに報告する:

```
## ハーネス初期構築完了

### 生成ファイル
- 📋 CLAUDE.md: DoD・アーキテクチャ境界を追記
- 🔥 scripts/smoke-test.sh: スモークテスト（N項目）
- 🏗️ scripts/structure-check.sh: 構造チェック（N項目）
- 📝 docs/harness-log.md: 強化履歴ログ

### 初回テスト結果
<smoke-test.shの実行結果>

### 次のステップ
- 開発中に `/harness-check` でテスト実行
- 失敗やエージェントの誤りを発見したら `/harness-strengthen` でハーネスを強化
- 最初から完璧を目指さない。使いながら段階的に育てていく
```

## 設計原則

- **段階的強化**: 最初から完璧なハーネスは作らない。DoD + 基本テストから始める
- **2分ルール**: スモークテストは2分以内に完了する設計を厳守
- **プロジェクト固有**: テンプレートをそのまま使わず、プロジェクトの技術スタックに合わせてカスタマイズ
- **既存資産の活用**: 既存のテスト・CI設定があればそれを活かす
