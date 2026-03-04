import {
  type Message,
  type AnyThreadChannel,
} from "discord.js";
import type Anthropic from "@anthropic-ai/sdk";
import { runClaudeConversation, runClaudeWithTools } from "./claude";
import { isMessageAllowed, checkRateLimit } from "./guard";
import { buildSystemPromptWithMemory } from "./prompt-builder";
import { extractAndUpdateMemory } from "./memory-extractor";
import { executeImplementation, isExecutionBusy } from "./agent-executor";
import { reportProgressToThread } from "./progress-reporter";

const TEXT_EXTENSIONS = new Set([
  ".txt", ".json", ".csv", ".md", ".log", ".xml",
  ".yaml", ".yml", ".toml", ".ts", ".js", ".py", ".html", ".css",
]);
const MAX_ATTACHMENT_SIZE = 512 * 1024; // 512KB

async function extractAttachmentTexts(msg: Message): Promise<string[]> {
  const results: string[] = [];
  for (const [, attachment] of msg.attachments) {
    const ext = attachment.name
      ? `.${attachment.name.split(".").pop()?.toLowerCase()}`
      : null;
    if (!ext || !TEXT_EXTENSIONS.has(ext)) {
      console.log(`[attachment] skipped (unsupported ext): ${attachment.name} (ext=${ext})`);
      continue;
    }
    if (attachment.size > MAX_ATTACHMENT_SIZE) {
      console.warn(`[attachment] skipped (too large): ${attachment.name} (${attachment.size} bytes)`);
      continue;
    }

    try {
      const res = await fetch(attachment.url);
      if (!res.ok) {
        console.warn(`[attachment] download failed: ${attachment.name} (HTTP ${res.status})`);
        continue;
      }
      const text = await res.text();
      console.log(`[attachment] extracted: ${attachment.name} (${text.length} chars)`);
      results.push(`[ファイル: ${attachment.name}]\n${text}`);
    } catch (err) {
      console.warn(`[attachment] download error: ${attachment.name}`, err);
    }
  }
  return results;
}

/** Bot が作成したスレッドの ID を記憶する（タイムスタンプ付きで期限切れ処理） */
const ownedThreads = new Map<string, number>();
const OWNED_THREAD_TTL_MS = 2 * 60 * 60 * 1000; // 2時間

function addOwnedThread(threadId: string): void {
  ownedThreads.set(threadId, Date.now());
  // 簡易eviction: 追加時に期限切れをクリーンアップ
  if (ownedThreads.size > 100) {
    const now = Date.now();
    for (const [id, ts] of ownedThreads) {
      if (now - ts > OWNED_THREAD_TTL_MS) ownedThreads.delete(id);
    }
  }
}

function isOwnedThread(threadId: string): boolean {
  const ts = ownedThreads.get(threadId);
  if (ts === undefined) return false;
  if (Date.now() - ts > OWNED_THREAD_TTL_MS) {
    ownedThreads.delete(threadId);
    return false;
  }
  return true;
}

/**
 * メンションされたときにスレッドを作って会話を開始する。
 * ボットが作ったスレッド内では、メンション不要で応答する。
 */
export async function handleMention(message: Message): Promise<void> {
  if (message.author.bot) return;

  const me = message.client.user;
  if (!me) return;

  const inOwnedThread =
    message.channel.isThread() && isOwnedThread(message.channel.id);
  const isMentioned = message.mentions.has(me);

  if (!isMentioned && !inOwnedThread) return;

  if (!isMessageAllowed(message)) return;
  if (!checkRateLimit(message.author.id)) {
    await message.reply("少し落ち着いてからまた話しかけてください。");
    return;
  }

  // メンションがチャンネル直投稿 → スレッドを作成
  if (isMentioned && !message.channel.isThread()) {
    const thread = await createThread(message);
    addOwnedThread(thread.id);
    await replyInThread(thread, message);
    return;
  }

  // メンションがスレッド内、またはボットのスレッド内の通常メッセージ
  if (message.channel.isThread()) {
    // 初回メンションがスレッド内の場合もスレッドを記憶
    if (isMentioned && !isOwnedThread(message.channel.id)) {
      addOwnedThread(message.channel.id);
    }
    await replyInThread(message.channel, message);
  }
}

async function createThread(message: Message): Promise<AnyThreadChannel> {
  // メッセージ冒頭をスレッド名にする（メンション部分を除去）
  const cleanContent = message.content
    .replace(/<@!?\d+>/g, "")
    .trim();
  const threadName =
    cleanContent.slice(0, 40) || `${message.author.displayName}との会話`;

  const thread = await message.startThread({
    name: threadName,
    autoArchiveDuration: 60,
  });

  return thread;
}

const IMPLEMENTATION_TOOL: Anthropic.Messages.Tool = {
  name: "request_implementation",
  description:
    "ユーザーがコードの実装・修正・機能追加を明示的に依頼した場合に使用。通常の会話・質問・相談には使わない。",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: {
        type: "string",
        description: "実装内容の要約",
      },
      scope: {
        type: "string",
        description: "影響範囲（対象プロジェクトやファイル）",
      },
    },
    required: ["summary"],
  },
};

async function replyInThread(
  thread: AnyThreadChannel,
  triggerMessage: Message,
): Promise<void> {
  // スレッド内の過去メッセージを取得して会話履歴を構築
  let messages = await fetchThreadHistory(thread, triggerMessage.id);

  // スレッド作成直後は履歴が空になるため、トリガーメッセージをフォールバック
  if (messages.length === 0) {
    const text = triggerMessage.content.replace(/<@!?\d+>/g, "").trim();
    const attachmentTexts = await extractAttachmentTexts(triggerMessage);
    const combined = [text, ...attachmentTexts].filter(Boolean).join("\n\n");
    if (combined) {
      messages = [{ role: "user" as const, content: combined }];
    }
  }

  if (messages.length === 0) return;

  await thread.sendTyping();

  try {
    const systemPrompt = buildSystemPromptWithMemory();
    const response = await runClaudeWithTools(messages, {
      system: systemPrompt,
      tools: [IMPLEMENTATION_TOOL],
    });

    // tool_use で実装依頼を検出
    const toolUse = response.content.find(
      (b): b is Anthropic.Messages.ToolUseBlock =>
        b.type === "tool_use" && b.name === "request_implementation",
    );

    if (toolUse) {
      const input = toolUse.input as { summary: string; scope?: string };
      await handleImplementationRequest(thread, input, messages);
    } else {
      // 従来のテキスト応答
      const text = response.content
        .filter(
          (b): b is Anthropic.Messages.TextBlock => b.type === "text",
        )
        .map((b) => b.text)
        .join("\n");

      if (text) {
        await sendLongMessage(thread, text);
      }
    }

    // 非同期でメモリ抽出（レスポンスには影響しない）
    extractAndUpdateMemory(messages, triggerMessage.id).catch((err) =>
      console.error("[mention-handler] Memory extraction failed:", err),
    );
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "不明なエラーが発生しました";
    console.error("[mention-handler] Claude API error:", msg);
    await thread.send(
      "すみません、ちょっと調子が悪いみたいです。少し待ってからまた話しかけてください。",
    );
  }
}

async function handleImplementationRequest(
  thread: AnyThreadChannel,
  input: { summary: string; scope?: string },
  messages: Anthropic.Messages.MessageParam[],
): Promise<void> {
  if (isExecutionBusy()) {
    await thread.send(
      "現在別の実装が進行中です。完了後に再度お試しください。",
    );
    return;
  }

  const scopeNote = input.scope ? `\n> 影響範囲: ${input.scope}` : "";
  await thread.send(
    `🚀 **実装を開始します**\n\n> ${input.summary}${scopeNote}\n\nOpus PM + Sonnet 実装エージェントで作業中...`,
  );

  const threadContext = messages
    .map((m) => {
      const content =
        typeof m.content === "string" ? m.content : "[content]";
      return `${m.role}: ${content}`;
    })
    .join("\n");

  const progressStream = executeImplementation(input.summary, threadContext);
  await reportProgressToThread(thread, progressStream);
}

async function fetchThreadHistory(
  thread: AnyThreadChannel,
  triggerMessageId?: string,
): Promise<Anthropic.Messages.MessageParam[]> {
  const fetched = await thread.messages.fetch({ limit: 50 });
  const sorted = [...fetched.values()].sort(
    (a, b) => a.createdTimestamp - b.createdTimestamp,
  );

  const botId = thread.client.user?.id;
  const history: Anthropic.Messages.MessageParam[] = [];

  for (const msg of sorted) {
    const role = msg.author.id === botId ? "assistant" : "user";
    const text = msg.content
      .replace(/<@!?\d+>/g, "")
      .trim();

    // トリガーメッセージのみファイル全文展開、過去メッセージはファイル名のみ
    let attachmentInfo: string[];
    if (msg.id === triggerMessageId) {
      attachmentInfo = await extractAttachmentTexts(msg);
    } else {
      attachmentInfo = [...msg.attachments.values()]
        .filter((a) => a.name)
        .map((a) => `[添付ファイル: ${a.name}]`);
    }

    const combined = [text, ...attachmentInfo].filter(Boolean).join("\n\n");
    if (!combined) continue;

    // Anthropic API は同じ role が連続する場合マージが必要
    const last = history[history.length - 1];
    if (last && last.role === role) {
      last.content += `\n${combined}`;
    } else {
      history.push({ role, content: combined });
    }
  }

  // 先頭が assistant の場合は除去（API は user から始まる必要がある）
  while (history.length > 0 && history[0].role === "assistant") {
    history.shift();
  }

  return history;
}

async function sendLongMessage(
  thread: AnyThreadChannel,
  text: string,
): Promise<void> {
  const MAX_LENGTH = 2000;
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_LENGTH) {
      await thread.send(remaining);
      break;
    }

    // 改行位置で分割を試みる
    let splitAt = remaining.lastIndexOf("\n", MAX_LENGTH);
    if (splitAt <= 0) splitAt = MAX_LENGTH;

    await thread.send(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n/, "");
  }
}

