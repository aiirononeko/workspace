# BULK Track

LINE Bot × AI による筋トレ記録・コーチングアプリ。

## 技術スタック

- Next.js 16 + TypeScript (strict)
- AI SDK + OpenAI (gpt-4o-mini)
- LINE Messaging API
- Supabase (PostgreSQL)

## Definition of Done (DoD)

コード変更が「完了」と見なされるための条件:

1. `scripts/smoke-test.sh` が全てパスすること
2. `scripts/structure-check.sh` が全てパスすること
3. 型チェックが通ること（`npx tsc --noEmit`）
4. Lintが通ること（`npx eslint`）
5. ビルドが成功すること（`npm run build`）

## アーキテクチャ境界

```
src/types/       → 純粋な型定義のみ。他モジュールへの依存禁止
src/lib/db/      → Supabaseクライアント＋クエリ。agent/lineへの依存禁止
src/lib/line/    → LINE SDK操作。agent/dbへの依存禁止
src/lib/agent/   → AIエージェント。db/queriesへの依存OK、lineへの直接依存禁止
src/app/api/     → ルートハンドラ。lib配下をオーケストレーション
```

### 依存関係の方向

```
app/api → lib/agent → lib/db
       → lib/line
       → lib/db
types/ ← 全レイヤーから参照OK
```

### 禁止事項

- `src/types/` から他モジュールをimportしない
- `src/lib/db/` から `agent/` や `line/` をimportしない
- `src/lib/line/` から `agent/` や `db/` をimportしない
- `src/lib/agent/` から `line/` を直接importしない（応答はroute層で中継）
- 環境変数を型定義やtypesに含めない
