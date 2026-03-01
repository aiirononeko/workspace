import type { Message } from "discord.js";
import { config } from "./config";
import { validateUrl, fetchAndSummarize, fetchTitle, summarizeFromEmbed } from "./summarize";

const URL_REGEX = /https?:\/\/[^\s<>)"']+/g;

const X_DOMAINS = ["x.com", "twitter.com", "fxtwitter.com", "vxtwitter.com"];

function isXUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return X_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

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
    // X URLはembed到着を待つため、ここではスキップ
    if (isXUrl(url)) {
      console.log(`[bookmark-watcher] X URL detected, waiting for embed: ${url}`);
      continue;
    }

    try {
      const title = await fetchTitle(url);
      const threadName = title
        ? title.slice(0, 100)
        : new URL(url).hostname.slice(0, 100);

      const thread = await message.startThread({ name: threadName });

      await thread.sendTyping();
      const summary = await fetchAndSummarize(url);

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

export async function handleBookmarkMessageUpdate(message: Message): Promise<void> {
  if (message.author.bot) return;
  if (config.bookmarkChannelIds.length === 0) return;
  if (!config.bookmarkChannelIds.includes(message.channelId)) return;

  // embedがなければ無視
  if (!message.embeds || message.embeds.length === 0) return;

  // メッセージ内のURLからX URLを抽出
  const urls = message.content.match(URL_REGEX);
  if (!urls) return;

  const unique = Array.from(new Set(urls as string[]));
  const xUrls = unique.filter((u) => validateUrl(u).valid && isXUrl(u));
  if (xUrls.length === 0) return;

  // 既にスレッドが作成済みなら重複処理を避ける
  if (message.hasThread) return;

  for (const url of xUrls) {
    // このURLに対応するembedを探す
    const embed = message.embeds.find((e) => {
      if (!e.url) return false;
      try {
        const embedHost = new URL(e.url).hostname.replace(/^www\./, "");
        const urlHost = new URL(url).hostname.replace(/^www\./, "");
        return X_DOMAINS.some((d) => embedHost === d || embedHost.endsWith(`.${d}`)) ||
               embedHost === urlHost;
      } catch {
        return false;
      }
    });

    if (!embed) {
      console.log(`[bookmark-watcher] No embed found for X URL: ${url}`);
      continue;
    }

    if (!embed.description && !embed.title) {
      console.log(`[bookmark-watcher] Embed has no text content for: ${url}`);
      continue;
    }

    try {
      const threadName = embed.author?.name
        ? `${embed.author.name}のポスト`.slice(0, 100)
        : new URL(url).hostname.slice(0, 100);

      const thread = await message.startThread({ name: threadName });
      await thread.sendTyping();

      const summary = await summarizeFromEmbed({
        url,
        author: embed.author?.name ?? undefined,
        description: embed.description ?? undefined,
        title: embed.title ?? undefined,
      });

      if (summary.length <= 2000) {
        await thread.send(summary);
      } else {
        await thread.send(summary.slice(0, 1997) + "...");
      }
    } catch (error) {
      console.error(`[bookmark-watcher] Failed to summarize X embed ${url}:`, error);
    }
  }
}
