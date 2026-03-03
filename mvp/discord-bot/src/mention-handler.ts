import {
  type Message,
  type AnyThreadChannel,
} from "discord.js";
import type Anthropic from "@anthropic-ai/sdk";
import { runClaudeConversation } from "./claude";
import { SYSTEM_PROMPT } from "./personality";
import { isMessageAllowed, checkRateLimit } from "./guard";
import { getCoreMemory, getTopProfileEntries } from "./memory";
import { extractAndUpdateMemory } from "./memory-extractor";

/** Bot が作成したスレッドの ID を記憶する */
const ownedThreads = new Set<string>();

/**
 * メンションされたときにスレッドを作って会話を開始する。
 * ボットが作ったスレッド内では、メンション不要で応答する。
 */
export async function handleMention(message: Message): Promise<void> {
  if (message.author.bot) return;

  const me = message.client.user;
  if (!me) return;

  const inOwnedThread =
    message.channel.isThread() && ownedThreads.has(message.channel.id);
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
    ownedThreads.add(thread.id);
    await replyInThread(thread, message);
    return;
  }

  // メンションがスレッド内、またはボットのスレッド内の通常メッセージ
  if (message.channel.isThread()) {
    // 初回メンションがスレッド内の場合もスレッドを記憶
    if (isMentioned && !ownedThreads.has(message.channel.id)) {
      ownedThreads.add(message.channel.id);
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

async function replyInThread(
  thread: AnyThreadChannel,
  triggerMessage: Message,
): Promise<void> {
  // スレッド内の過去メッセージを取得して会話履歴を構築
  let messages = await fetchThreadHistory(thread);

  // スレッド作成直後は履歴が空になるため、トリガーメッセージをフォールバック
  if (messages.length === 0) {
    const text = triggerMessage.content.replace(/<@!?\d+>/g, "").trim();
    if (text) {
      messages = [{ role: "user" as const, content: text }];
    }
  }

  if (messages.length === 0) return;

  await thread.sendTyping();

  try {
    const systemPrompt = buildSystemPromptWithMemory();
    const result = await runClaudeConversation(messages, {
      system: systemPrompt,
    });

    // Discord の 2000 文字制限を考慮して分割送信
    await sendLongMessage(thread, result);

    // 非同期でメモリ抽出（レスポンスには影響しない）
    extractAndUpdateMemory(messages, triggerMessage.id).catch((err) =>
      console.error("[mention-handler] Memory extraction failed:", err),
    );
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "不明なエラーが発生しました";
    console.error("[mention-handler] Claude API error:", msg);
    await thread.send("すみません、ちょっと調子が悪いみたいです。少し待ってからまた話しかけてください。");
  }
}

async function fetchThreadHistory(
  thread: AnyThreadChannel,
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
    if (!text) continue;

    // Anthropic API は同じ role が連続する場合マージが必要
    const last = history[history.length - 1];
    if (last && last.role === role) {
      last.content += `\n${text}`;
    } else {
      history.push({ role, content: text });
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

function buildSystemPromptWithMemory(): string {
  const coreMemory = getCoreMemory();
  const topEntries = getTopProfileEntries(5);

  if (!coreMemory && topEntries.length === 0) return SYSTEM_PROMPT;

  let memorySection = "\n\n## あなたが知っているユーザーについての情報\n";

  if (coreMemory) {
    memorySection += `\n### 概要\n${coreMemory}\n`;
  }

  if (topEntries.length > 0) {
    memorySection += "\n### 詳細\n";
    for (const entry of topEntries) {
      memorySection += `- [${entry.category}] ${entry.content}\n`;
    }
  }

  return SYSTEM_PROMPT + memorySection;
}
