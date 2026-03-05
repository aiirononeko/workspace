/**
 * AIリリース監視Job。
 * RSSフィードを取得し、未読アイテムをClaude翻訳・要約してDiscordに送信。
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import { initJobStore, isItemSeen, markItemSeen } from "../notifier/job-store";
import { sendEmbed, type Embed } from "../notifier/webhook";
import { fetchFeed, loadFeedConfigs, type FeedItem } from "../providers/rss-feeds";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FEEDS_PATH = resolve(__dirname, "../../data/rss-feeds.json");
const MAX_ITEMS_PER_RUN = 5;

function getWebhookUrl(): string {
  const url = process.env.NOTIFY_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
  if (!url) throw new Error("NOTIFY_WEBHOOK_URL or DISCORD_WEBHOOK_URL is required");
  return url;
}

interface Summary {
  titleJa: string;
  summary: string;
  importance: "high" | "medium" | "low";
}

async function summarizeItem(
  client: Anthropic,
  item: FeedItem,
): Promise<Summary> {
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `以下のAIニュース記事を日本語で要約してください。

タイトル: ${item.title}
ソース: ${item.feedName}
内容: ${item.contentSnippet}

以下のJSON形式で返答してください（JSONのみ、他のテキストなし）:
{
  "titleJa": "日本語タイトル",
  "summary": "3行以内の日本語要約",
  "importance": "high/medium/low"
}

重要度の基準:
- high: 新モデルリリース、重大なAPI変更、業界に大きな影響
- medium: 機能アップデート、研究発表
- low: ブログ記事、マイナーアップデート`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  try {
    return JSON.parse(text) as Summary;
  } catch {
    return {
      titleJa: item.title,
      summary: item.contentSnippet.slice(0, 200),
      importance: "low",
    };
  }
}

function importanceColor(importance: string): number {
  switch (importance) {
    case "high":
      return 0xed4245; // Red
    case "medium":
      return 0xfee75c; // Yellow
    default:
      return 0x5865f2; // Blurple
  }
}

function importanceEmoji(importance: string): string {
  switch (importance) {
    case "high":
      return "🔴";
    case "medium":
      return "🟡";
    default:
      return "🔵";
  }
}

async function main(): Promise<void> {
  console.log("[release-watch] Starting...");

  initJobStore();
  const webhookUrl = getWebhookUrl();
  const feeds = loadFeedConfigs(FEEDS_PATH);
  const anthropic = new Anthropic();

  // Fetch all feeds in parallel
  const feedResults = await Promise.allSettled(
    feeds.map((feed) => fetchFeed(feed)),
  );

  // Collect unseen items
  const unseenItems: FeedItem[] = [];
  for (const result of feedResults) {
    if (result.status === "rejected") {
      console.error("[release-watch] Feed fetch failed:", result.reason);
      continue;
    }
    for (const item of result.value) {
      if (!isItemSeen(item.feedUrl, item.itemId)) {
        unseenItems.push(item);
      }
    }
  }

  if (unseenItems.length === 0) {
    console.log("[release-watch] No new items found.");
    return;
  }

  // Sort by pubDate descending, take top N
  unseenItems.sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime(),
  );
  const toProcess = unseenItems.slice(0, MAX_ITEMS_PER_RUN);

  console.log(
    `[release-watch] Processing ${toProcess.length} new items (${unseenItems.length} total unseen)`,
  );

  // Summarize and send
  for (const item of toProcess) {
    try {
      const summary = await summarizeItem(anthropic, item);

      const embed: Embed = {
        title: `${importanceEmoji(summary.importance)} ${summary.titleJa}`,
        description: summary.summary,
        color: importanceColor(summary.importance),
        fields: [
          { name: "Source", value: item.feedName, inline: true },
          { name: "Link", value: item.link, inline: false },
        ],
        timestamp: item.pubDate
          ? new Date(item.pubDate).toISOString()
          : new Date().toISOString(),
        footer: { text: `Importance: ${summary.importance}` },
      };

      await sendEmbed(webhookUrl, [embed]);
      markItemSeen(item.feedUrl, item.itemId);
      console.log(`[release-watch] Sent: ${item.title}`);
    } catch (error) {
      console.error(
        `[release-watch] Failed to process item: ${item.title}`,
        error,
      );
    }
  }

  // Mark remaining unseen items as seen (to avoid re-processing old backlog)
  for (const item of unseenItems.slice(MAX_ITEMS_PER_RUN)) {
    markItemSeen(item.feedUrl, item.itemId);
  }

  console.log("[release-watch] Done.");
}

main().catch((error) => {
  console.error("[release-watch] Fatal error:", error);
  process.exit(1);
});
