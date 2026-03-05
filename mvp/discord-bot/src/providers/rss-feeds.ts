/**
 * RSSフィード取得・パース。
 */

import Parser from "rss-parser";

const parser = new Parser({
  timeout: 15_000,
  headers: {
    "User-Agent": "DiscordBot-RSSWatcher/1.0",
  },
});

export interface FeedConfig {
  name: string;
  url: string;
  lang: string;
}

export interface FeedItem {
  feedName: string;
  feedUrl: string;
  title: string;
  link: string;
  pubDate: string;
  contentSnippet: string;
  itemId: string;
}

export async function fetchFeed(feed: FeedConfig): Promise<FeedItem[]> {
  const result = await parser.parseURL(feed.url);

  return (result.items ?? []).map((item) => ({
    feedName: feed.name,
    feedUrl: feed.url,
    title: item.title ?? "(no title)",
    link: item.link ?? "",
    pubDate: item.pubDate ?? item.isoDate ?? "",
    contentSnippet: (item.contentSnippet ?? "").slice(0, 500),
    itemId: item.guid ?? item.link ?? item.title ?? "",
  }));
}

export function loadFeedConfigs(path: string): FeedConfig[] {
  const text = require("fs").readFileSync(path, "utf-8");
  return JSON.parse(text) as FeedConfig[];
}
