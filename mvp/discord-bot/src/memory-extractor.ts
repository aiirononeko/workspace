/**
 * Claude による記憶抽出・統合。
 * 依存: claude.ts + memory.ts（personality.ts はimportしない）
 */

import type Anthropic from "@anthropic-ai/sdk";
import { runClaude } from "./claude";
import {
  getCoreMemory,
  getCoreMemoryUpdatedAt,
  getActiveProfileEntries,
  getProfileEntryCount,
  upsertProfileEntry,
  updateCoreMemory,
} from "./memory";

const PII_PATTERNS = [
  /パスワード|password/i,
  /api[_\s]?key/i,
  /口座|account.*number/i,
  /秘密鍵|private.*key|secret/i,
  /クレジットカード|credit.*card/i,
  /マイナンバー/i,
  /social.*security/i,
];

interface ExtractedEntry {
  key: string;
  content: string;
  category: string;
  confidence: number;
}

function validateEntry(entry: ExtractedEntry): boolean {
  if (entry.confidence < 0.5) return false;
  if (PII_PATTERNS.some((p) => p.test(entry.content))) return false;
  if (PII_PATTERNS.some((p) => p.test(entry.key))) return false;
  return true;
}

const VALID_CATEGORIES = new Set([
  "preference",
  "goal",
  "value",
  "expertise",
  "context",
  "habit",
  "relationship",
]);

function buildExtractionPrompt(
  conversationText: string,
  existingEntries: { key: string; content: string; category: string }[],
): string {
  const existingList =
    existingEntries.length > 0
      ? existingEntries.map((e) => `- [${e.category}] ${e.key}: ${e.content}`).join("\n")
      : "（まだ何も記録されていません）";

  return `あなたはユーザーの会話から長期的に有用な事実を抽出するアシスタントです。

## 既存のメモリ
${existingList}

## 最近の会話
${conversationText}

## タスク
上の会話から、ユーザーについての新しい事実を抽出してください。

## ルール
- 既存メモリと重複する情報は除外する
- 一時的な質問や一般知識は除外する
- 皮肉、仮定、ロールプレイの内容は除外する
- パスワード、APIキー、口座番号などの機密情報は絶対に含めない
- 最大5エントリまで
- 学びがなければ空配列 [] を返す

## カテゴリ
preference（好み）, goal（目標）, value（価値観）, expertise（専門知識）, context（状況・背景）, habit（習慣）, relationship（人間関係）

## 出力形式
JSON配列のみを出力してください。マークダウンのコードブロックは不要です。
[
  {
    "key": "category:identifier",
    "content": "ユーザーについての事実（日本語）",
    "category": "preference",
    "confidence": 0.9
  }
]`;
}

function buildCoreMemoryPrompt(
  entries: { key: string; content: string; category: string }[],
): string {
  const entriesList = entries
    .map((e) => `- [${e.category}] ${e.key}: ${e.content}`)
    .join("\n");

  return `以下のユーザープロファイルエントリを200トークン以内の簡潔な要約にまとめてください。
ユーザーの本質的な特徴、価値観、目標を中心に記述してください。

## プロファイルエントリ
${entriesList}

## ルール
- 要約のみを出力（マークダウン装飾不要）
- 200トークン以内
- 3人称で記述（「ユーザーは〜」）
- 最も重要な特徴を優先`;
}

export async function extractAndUpdateMemory(
  messages: Anthropic.Messages.MessageParam[],
  sourceMessageId?: string,
): Promise<void> {
  try {
    // Build conversation text from messages
    const conversationText = messages
      .map((m) => {
        const role = m.role === "user" ? "ユーザー" : "アシスタント";
        const content = typeof m.content === "string" ? m.content : "[メディアコンテンツ]";
        return `${role}: ${content}`;
      })
      .join("\n");

    const existingEntries = getActiveProfileEntries().map((e) => ({
      key: e.key,
      content: e.content,
      category: e.category,
    }));

    const prompt = buildExtractionPrompt(conversationText, existingEntries);
    const result = await runClaude(prompt);

    // Parse JSON from response
    const entries = parseExtractedEntries(result);
    let updatedCount = 0;

    for (const entry of entries) {
      if (!validateEntry(entry)) continue;
      if (!VALID_CATEGORIES.has(entry.category)) continue;

      upsertProfileEntry({
        key: entry.key,
        content: entry.content,
        category: entry.category,
        confidence: entry.confidence,
        sourceMessageId: sourceMessageId ?? null,
      });
      updatedCount++;
    }

    // Core Memory integration triggers
    await maybeSynthesizeCoreMemory(updatedCount);

    if (updatedCount > 0) {
      console.log(`[memory-extractor] ${updatedCount} entries updated`);
    }
  } catch (error) {
    console.error("[memory-extractor] Extraction failed:", error);
  }
}

export async function synthesizeCoreMemory(): Promise<void> {
  const activeEntries = getActiveProfileEntries();
  if (activeEntries.length === 0) {
    updateCoreMemory("");
    return;
  }

  const prompt = buildCoreMemoryPrompt(
    activeEntries.map((e) => ({
      key: e.key,
      content: e.content,
      category: e.category,
    })),
  );

  const summary = await runClaude(prompt);
  updateCoreMemory(summary.trim());
  console.log("[memory-extractor] Core memory synthesized");
}

async function maybeSynthesizeCoreMemory(updatedCount: number): Promise<void> {
  const coreMemory = getCoreMemory();
  const entryCount = getProfileEntryCount();

  // Trigger 1: Core Memory empty but entries exist
  if (!coreMemory && entryCount > 0) {
    await synthesizeCoreMemory();
    return;
  }

  // Trigger 2: 5+ entries updated in this extraction
  if (updatedCount >= 5) {
    await synthesizeCoreMemory();
    return;
  }

  // Trigger 3: Core Memory stale (24h+) and entries were updated
  if (updatedCount > 0) {
    const updatedAt = getCoreMemoryUpdatedAt();
    if (updatedAt) {
      const lastUpdate = new Date(updatedAt).getTime();
      const hoursSinceUpdate = (Date.now() - lastUpdate) / (1000 * 60 * 60);
      if (hoursSinceUpdate >= 24) {
        await synthesizeCoreMemory();
      }
    }
  }
}

function parseExtractedEntries(text: string): ExtractedEntry[] {
  try {
    // Try to extract JSON array from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (item: unknown): item is ExtractedEntry =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as Record<string, unknown>).key === "string" &&
          typeof (item as Record<string, unknown>).content === "string" &&
          typeof (item as Record<string, unknown>).category === "string" &&
          typeof (item as Record<string, unknown>).confidence === "number",
      )
      .slice(0, 5);
  } catch {
    console.error("[memory-extractor] Failed to parse extraction result");
    return [];
  }
}
