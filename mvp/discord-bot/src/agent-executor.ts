import { query } from "@anthropic-ai/claude-agent-sdk";
import { config } from "./config";

export interface AgentProgress {
  type: "status" | "result" | "error";
  message: string;
  prUrl?: string;
}

let executionLock = false;

export function isExecutionBusy(): boolean {
  return executionLock;
}

const PM_SYSTEM_PROMPT = `あなたはPM（プロジェクトマネージャー）エージェントです。
ユーザーからの実装依頼を受け、以下の手順で作業を進めます。

## 作業手順

1. **コードベース調査**: Glob, Grep, Read ツールで対象コードを理解する
2. **タスク分解**: 実装を小さなステップに分解する
3. **実装委譲**: "implementer" サブエージェントにコード変更を委譲する
4. **品質検証**: 実装後に以下を実行
   - \`bunx tsc --noEmit\` で型チェック
   - \`./scripts/smoke-test.sh\` があれば実行
   - \`./scripts/structure-check.sh\` があれば実行
5. **ブランチ作成とPR**:
   - feature branch を作成（feat/xxx 形式）
   - 変更をコミット
   - push して \`gh pr create\` でPRを作成
   - 完了後に main ブランチに戻る

## 重要ルール

- プロジェクトのCLAUDE.mdのルールを必ず遵守すること
- 最小限の変更で目的を達成すること
- コミットメッセージは日本語で書くこと
- PRタイトルも日本語で書くこと
- 検証が失敗した場合は修正してから再検証すること
- 最終的にmainブランチに戻ること（finallyブロック相当）`;

const IMPLEMENTER_PROMPT = `あなたはTypeScript/Bunのコード実装スペシャリストです。

## ルール

- プロジェクトの既存パターン・慣習に従うこと
- 最小限の変更で目的を達成すること
- 変更後に \`bunx tsc --noEmit\` で型チェックを実行すること
- 不要なファイルを作成しないこと
- 既存のアーキテクチャ境界を守ること`;

export async function* executeImplementation(
  request: string,
  threadContext: string,
): AsyncGenerator<AgentProgress> {
  if (executionLock) {
    yield {
      type: "error",
      message: "別の実装が進行中です。完了後に再度お試しください。",
    };
    return;
  }

  executionLock = true;
  try {
    yield { type: "status", message: "エージェントチームを起動しています..." };

    const prompt = [
      "## 実装依頼",
      request,
      "",
      "## スレッドでの会話コンテキスト",
      threadContext,
    ].join("\n");

    const agentStream = query({
      prompt,
      options: {
        model: "opus",
        cwd: config.workspaceDir,
        permissionMode: "acceptEdits",
        allowedTools: ["Read", "Glob", "Grep", "Bash", "Agent"],
        systemPrompt: PM_SYSTEM_PROMPT,
        settingSources: ["project"],
        agents: {
          implementer: {
            description:
              "コード実装スペシャリスト。ファイル編集、テスト実行を担当。",
            prompt: IMPLEMENTER_PROMPT,
            tools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep"],
            model: "sonnet",
          },
        },
        maxTurns: 30,
        maxBudgetUsd: config.agentMaxBudgetUsd,
      },
    });

    let toolUseCount = 0;

    for await (const message of agentStream) {
      if (message.type === "system" && message.subtype === "init") {
        yield { type: "status", message: "エージェント初期化完了。調査を開始します..." };
      }

      if (message.type === "tool_progress") {
        toolUseCount++;
        yield {
          type: "status",
          message: `作業中... (${toolUseCount} ツール実行済み)`,
        };
      }

      if (message.type === "result") {
        if (message.subtype === "success") {
          const prUrlMatch = message.result.match(
            /https:\/\/github\.com\/[^\s)]+\/pull\/\d+/,
          );
          yield {
            type: "result",
            message: message.result.slice(0, 500),
            prUrl: prUrlMatch?.[0],
          };
        } else {
          yield {
            type: "error",
            message: `エージェント実行エラー: ${message.errors.join(", ")}`,
          };
        }
      }
    }
  } catch (err) {
    yield {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  } finally {
    executionLock = false;
  }
}
