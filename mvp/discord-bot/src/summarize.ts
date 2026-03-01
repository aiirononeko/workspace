import { runClaude } from "./claude";

const MAX_TEXT_LENGTH = 50000;
const FETCH_TIMEOUT_MS = 10000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;

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

export async function fetchAndSummarize(url: string): Promise<string> {
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
  const html = new TextDecoder().decode(Buffer.concat(chunks));
  const text = extractText(html);

  if (!text || text.length < 10) {
    throw new Error("ページからテキストを抽出できませんでした。");
  }

  const prompt = `以下のWebページの内容を日本語で簡潔に要約してください。\n\nURL: ${url}\n\n${text}`;
  return runClaude(prompt);
}

export async function summarizeFromEmbed(embedData: {
  url: string;
  author?: string;
  description?: string;
  title?: string;
}): Promise<string> {
  const parts: string[] = [];
  if (embedData.author) parts.push(`投稿者: ${embedData.author}`);
  if (embedData.title) parts.push(`タイトル: ${embedData.title}`);
  if (embedData.description) parts.push(`本文: ${embedData.description}`);

  if (parts.length === 0) {
    throw new Error("Embed情報が不十分です");
  }

  const text = parts.join("\n");
  const prompt = `以下のX(Twitter)ポストの内容を日本語で簡潔に要約してください。\n\nURL: ${embedData.url}\n\n${text}`;
  return runClaude(prompt);
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
