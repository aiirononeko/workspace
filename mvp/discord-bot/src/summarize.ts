import type Anthropic from "@anthropic-ai/sdk";
import { runClaude } from "./claude";
import { SYSTEM_PROMPT } from "./personality";

const MAX_TEXT_LENGTH = 50000;
const FETCH_TIMEOUT_MS = 10000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_LINKED_URLS = 3;

export const URL_REGEX = /https?:\/\/[^\s<>)"']+/g;

export const X_DOMAINS = ["x.com", "twitter.com", "fxtwitter.com", "vxtwitter.com"];

export function isXUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return X_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

const DEFAULT_FETCH_OPTIONS: RequestInit = {
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; DiscordBot/1.0)",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  },
  redirect: "follow",
};

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local")) return true;
  if (h.startsWith("10.") || h.startsWith("127.") || h.startsWith("192.168.") || h === "[::1]") return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
  return false;
}

export function validateUrl(url: string): { valid: true; parsed: URL } | { valid: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, reason: "URLの形式が正しくありません。" };
  }

  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || isBlockedHost(parsed.hostname)) {
    return { valid: false, reason: "許可されていないURLです。" };
  }

  return { valid: true, parsed };
}

export function extractText(html: string): string {
  let text = html;

  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");

  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section|article|header|footer)>/gi, "\n");

  text = text.replace(/<[^>]+>/g, "");

  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#039;/g, "'");
  text = text.replace(/&nbsp;/g, " ");

  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n\s*\n/g, "\n\n");

  text = text
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();

  if (text.length > MAX_TEXT_LENGTH) {
    text = text.slice(0, MAX_TEXT_LENGTH) + "\n\n...(以下省略)";
  }

  return text;
}

export function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  const title = match[1].replace(/\s+/g, " ").trim();
  return title || null;
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    ...DEFAULT_FETCH_OPTIONS,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`URLの取得に失敗しました（HTTP ${response.status}）`);
  }

  const ct = response.headers.get("content-type") ?? "";
  if (!ct.includes("text/html") && !ct.includes("text/plain") && !ct.includes("application/xhtml")) {
    throw new Error("HTMLページのみ要約できます。");
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("レスポンス本文を読み込めません");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_HTML_BYTES) {
      reader.cancel();
      throw new Error("ページサイズが大きすぎます（2MB上限）");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

async function summarizeHtml(html: string, url: string): Promise<string> {
  const text = extractText(html);

  if (!text || text.length < 10) {
    throw new Error("ページからテキストを抽出できませんでした。");
  }

  const prompt = `以下のWebページの内容を日本語で簡潔に要約してください。\n\nURL: ${url}\n\n${text}`;
  return runClaude(prompt, { system: SYSTEM_PROMPT });
}

export async function fetchUrlContent(url: string): Promise<string> {
  const html = await fetchHtml(url);
  const text = extractText(html);
  const title = extractTitle(html);
  if (!text || text.length < 10) {
    throw new Error("ページからテキストを抽出できませんでした。");
  }
  const header = title ? `タイトル: ${title}\nURL: ${url}` : `URL: ${url}`;
  return `${header}\n\n${text}`;
}

export async function fetchAndSummarize(url: string): Promise<string> {
  const html = await fetchHtml(url);
  return summarizeHtml(html, url);
}

export async function fetchTitleAndSummarize(url: string): Promise<{ title: string | null; summary: string }> {
  const html = await fetchHtml(url);
  const title = extractTitle(html);
  const summary = await summarizeHtml(html, url);
  return { title, summary };
}

async function fetchImageAsBase64(
  imageUrl: string,
): Promise<{ data: string; mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" } | null> {
  try {
    const res = await fetch(imageUrl, {
      ...DEFAULT_FETCH_OPTIONS,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const ct = res.headers.get("content-type") ?? "";
    const mediaType = (["image/jpeg", "image/png", "image/gif", "image/webp"] as const).find((t) => ct.includes(t));
    if (!mediaType) return null;

    const buf = await res.arrayBuffer();
    if (buf.byteLength > 5 * 1024 * 1024) return null; // 5MB limit
    const data = Buffer.from(buf).toString("base64");
    return { data, mediaType };
  } catch (err) {
    console.warn(`[summarize] Failed to fetch image: ${imageUrl}`, err);
    return null;
  }
}

async function fetchLinkedSummaries(description: string): Promise<string[]> {
  const urls = description.match(URL_REGEX);
  if (!urls) return [];

  const unique = Array.from(new Set(urls as string[]));
  const targets = unique
    .filter((u) => validateUrl(u).valid && !isXUrl(u))
    .slice(0, MAX_LINKED_URLS);

  const settled = await Promise.allSettled(
    targets.map(async (url) => {
      const summary = await fetchAndSummarize(url);
      return `[${url}]\n${summary}`;
    }),
  );

  return settled
    .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
    .map((r) => r.value);
}

export async function summarizeFromEmbed(embedData: {
  url: string;
  author?: string;
  description?: string;
  title?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  videoUrl?: string;
  footer?: string;
  timestamp?: string;
  providerName?: string;
  fields?: Array<{ name: string; value: string }>;
}): Promise<string> {
  const parts: string[] = [];
  if (embedData.author) parts.push(`投稿者: ${embedData.author}`);
  if (embedData.title) parts.push(`タイトル: ${embedData.title}`);
  if (embedData.description) parts.push(`本文: ${embedData.description}`);
  if (embedData.providerName) parts.push(`プロバイダ: ${embedData.providerName}`);
  if (embedData.footer) parts.push(`フッター: ${embedData.footer}`);
  if (embedData.timestamp) parts.push(`投稿日時: ${embedData.timestamp}`);
  if (embedData.videoUrl) parts.push(`動画URL: ${embedData.videoUrl}`);
  if (embedData.fields?.length) {
    parts.push("追加情報:");
    for (const f of embedData.fields) {
      parts.push(`  - ${f.name}: ${f.value}`);
    }
  }

  if (parts.length === 0) {
    throw new Error("Embed情報が不十分です");
  }

  const textContent = parts.join("\n");
  const promptText = `以下のX(Twitter)ポストの内容を日本語で簡潔に要約してください。画像が添付されている場合は、画像の内容も要約に含めてください。\n\nURL: ${embedData.url}\n\n${textContent}`;

  // 画像がある場合はvision付きで呼び出す
  const imageUrl = embedData.imageUrl || embedData.thumbnailUrl;
  let postSummary: string;

  if (imageUrl) {
    const image = await fetchImageAsBase64(imageUrl);
    if (image) {
      const blocks: Anthropic.Messages.ContentBlockParam[] = [
        {
          type: "image",
          source: { type: "base64", media_type: image.mediaType, data: image.data },
        },
        { type: "text", text: promptText },
      ];
      postSummary = await runClaude(blocks, { system: SYSTEM_PROMPT });
    } else {
      postSummary = await runClaude(promptText, { system: SYSTEM_PROMPT });
    }
  } else {
    postSummary = await runClaude(promptText, { system: SYSTEM_PROMPT });
  }

  // リンク先コンテンツの統合要約
  if (embedData.description) {
    const linkedSummaries = await fetchLinkedSummaries(embedData.description);
    if (linkedSummaries.length > 0) {
      const integrationPrompt = `以下のX(Twitter)ポストの要約と、ポスト内で参照されているリンク先の要約を統合し、日本語で包括的に要約してください。

## ポストの要約
${postSummary}

## リンク先コンテンツの要約
${linkedSummaries.join("\n\n")}

ポストの文脈を踏まえつつ、リンク先の重要な情報も含めた統合要約を生成してください。`;
      return runClaude(integrationPrompt, { system: SYSTEM_PROMPT });
    }
  }

  return postSummary;
}

export async function fetchTitle(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      ...DEFAULT_FETCH_OPTIONS,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const reader = response.body?.getReader();
    if (!reader) return null;

    // Read only first 32KB to find <title>
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (size < 32768) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      chunks.push(value);
    }
    reader.cancel();

    const html = new TextDecoder().decode(Buffer.concat(chunks));
    return extractTitle(html);
  } catch {
    return null;
  }
}
