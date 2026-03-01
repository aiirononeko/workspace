import {
  type Message,
  type ThreadChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { config } from "./config";
import { validateUrl, fetchAndSummarize, fetchTitle, summarizeFromEmbed } from "./summarize";
import { analyzeForKnowledge, buildProposalMessage, type EmbedMetadata } from "./knowledge-proposer";
import { cacheAnalysis } from "./button-handler";

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

async function proposeKnowledge(thread: ThreadChannel, summary: string, url: string, embedMeta?: EmbedMetadata): Promise<void> {
  try {
    const analysis = await analyzeForKnowledge(summary, url, embedMeta);

    // ナレッジとして無関係と判定された場合はスキップ
    if (!analysis.relevant) {
      console.log(`[bookmark-watcher] Skipping knowledge proposal (not relevant): ${url}`);
      return;
    }

    // キャッシュに保存
    cacheAnalysis(thread.id, analysis, summary, url, embedMeta);

    const buttons: ButtonBuilder[] = [];

    if (analysis.type === "obsidian" || analysis.type === "both") {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`knowledge:obsidian:${thread.id}`)
          .setLabel("Obsidianに保存")
          .setEmoji("📚")
          .setStyle(ButtonStyle.Primary),
      );
    }

    if (analysis.type === "skill" || analysis.type === "both") {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`knowledge:skill:${thread.id}`)
          .setLabel("Skill化ドラフト作成")
          .setEmoji("⚡")
          .setStyle(ButtonStyle.Secondary),
      );
    }

    if (buttons.length === 0) return;

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);

    await thread.send({
      content: buildProposalMessage(analysis),
      components: [row],
    });
  } catch (error) {
    console.error("[bookmark-watcher] Knowledge proposal failed:", error);
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

      // ナレッジ提案
      await proposeKnowledge(thread, summary, url);
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

      const embedMeta: EmbedMetadata = {
        author: embed.author?.name ?? undefined,
        description: embed.description ?? undefined,
        title: embed.title ?? undefined,
      };

      const summary = await summarizeFromEmbed({
        url,
        ...embedMeta,
      });

      if (summary.length <= 2000) {
        await thread.send(summary);
      } else {
        await thread.send(summary.slice(0, 1997) + "...");
      }

      // ナレッジ提案（embed原文メタデータも渡す）
      await proposeKnowledge(thread, summary, url, embedMeta);
    } catch (error) {
      console.error(`[bookmark-watcher] Failed to summarize X embed ${url}:`, error);
    }
  }
}
