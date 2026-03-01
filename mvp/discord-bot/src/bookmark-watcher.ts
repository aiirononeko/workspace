import type { Message } from "discord.js";
import { config } from "./config";
import { validateUrl, fetchAndSummarize, fetchTitle } from "./summarize";

const URL_REGEX = /https?:\/\/[^\s<>)"']+/g;

export async function handleBookmarkMessage(message: Message): Promise<void> {
  if (message.author.bot) return;
  if (config.bookmarkChannelIds.length === 0) return;
  if (!config.bookmarkChannelIds.includes(message.channelId)) return;

  const urls = message.content.match(URL_REGEX);
  if (!urls || urls.length === 0) return;

  // Deduplicate and validate
  const unique: string[] = Array.from(new Set(urls as string[]));
  const validUrls: string[] = unique.filter((u: string) => validateUrl(u).valid);
  if (validUrls.length === 0) return;

  for (const url of validUrls) {
    try {
      // Fetch page title for thread name
      const title = await fetchTitle(url);
      const threadName = title
        ? title.slice(0, 100)
        : new URL(url).hostname.slice(0, 100);

      const thread = await message.startThread({ name: threadName });

      await thread.sendTyping();
      const summary = await fetchAndSummarize(url);

      // Discord message limit is 2000 chars
      if (summary.length <= 2000) {
        await thread.send(summary);
      } else {
        await thread.send(summary.slice(0, 1997) + "...");
      }
    } catch (error) {
      console.error(`[bookmark-watcher] Failed to summarize ${url}:`, error);
    }
  }
}
