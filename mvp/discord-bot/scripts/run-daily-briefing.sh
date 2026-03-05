#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

# direnvで環境変数をロード
eval "$(direnv export bash 2>/dev/null || true)"

# workspaceルートの.envも読み込む
if [ -f ../../../.env ]; then
  set -a
  source ../../../.env
  set +a
fi

exec /home/ryota/.bun/bin/bun run src/jobs/daily-briefing.ts
