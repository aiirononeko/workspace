import type { AnyThreadChannel } from "discord.js";
import type { AgentProgress } from "./agent-executor";

const THROTTLE_MS = 10_000;
const TYPING_INTERVAL_MS = 8_000;
const MAX_LENGTH = 2000;

function splitMessage(text: string): string[] {
  const parts: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_LENGTH) {
      parts.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n", MAX_LENGTH);
    if (splitAt <= 0) splitAt = MAX_LENGTH;
    parts.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n/, "");
  }

  return parts;
}

async function sendMessage(
  thread: AnyThreadChannel,
  text: string,
): Promise<void> {
  for (const part of splitMessage(text)) {
    await thread.send(part);
  }
}

export async function reportProgressToThread(
  thread: AnyThreadChannel,
  stream: AsyncGenerator<AgentProgress>,
): Promise<void> {
  let lastStatusTime = 0;

  const typingInterval = setInterval(() => {
    thread.sendTyping().catch(() => {});
  }, TYPING_INTERVAL_MS);

  try {
    for await (const progress of stream) {
      switch (progress.type) {
        case "status": {
          const now = Date.now();
          if (now - lastStatusTime >= THROTTLE_MS) {
            await sendMessage(thread, `⏳ ${progress.message}`);
            lastStatusTime = now;
          }
          break;
        }
        case "result": {
          let msg = `✅ ${progress.message}`;
          if (progress.prUrl) {
            msg += `\n\n🔗 PR: ${progress.prUrl}`;
          }
          await sendMessage(thread, msg);
          break;
        }
        case "error": {
          await sendMessage(thread, `❌ エラー: ${progress.message}`);
          break;
        }
      }
    }
  } finally {
    clearInterval(typingInterval);
  }
}
