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
  "communication_style",
  "emotional_trigger",
  "decision_pattern",
  "motivation",
]);

function buildExtractionPrompt(
  conversationText: string,
  existingEntries: { key: string; content: string; category: string }[],
): string {
  const existingList =
    existingEntries.length > 0
      ? existingEntries.map((e) => `- [${e.category}] ${e.key}: ${e.content}`).join("\n")
      : "（まだ何も記録されていません）";

  return `あなたはユーザーの会話から、その人の人間性を深く読み取るアシスタントです。

## 既存のメモリ
${existingList}

## 最近の会話
${conversationText}

## タスク
上の会話から、ユーザーについての情報を抽出してください。
表層の事実だけでなく、**行間にある人間性**を読み取ってください:
- 「何を言ったか」だけでなく「どう言ったか」（言い回し、語気、テンション）
- 感情の動き（何に熱くなり、何にうんざりし、何を楽しんでいるか）
- 意思決定の癖（即断か熟考か、直感型か分析型か）
- 価値観の優先順位（何を大事にし、何を捨てられるか）

## ルール
- **既存メモリと意味的に同じ情報は、既存のkeyを指定して更新せよ。新しいkeyを作るな**
- 一時的な質問や一般知識は除外する
- 皮肉、仮定、ロールプレイの内容は除外する
- パスワード、APIキー、口座番号などの機密情報は絶対に含めない
- 最大5エントリまで
- 学びがなければ空配列 [] を返す

## カテゴリ
- preference（好み）: 具体的な好み・嗜好
- goal（目標）: 目指していること
- value（価値観）: 大事にしている信念
- expertise（専門知識）: スキル・知識領域
- context（状況・背景）: 職業・生活環境
- habit（習慣）: 行動パターン・ルーティン
- relationship（人間関係）: 周囲の人との関係
- communication_style（コミュニケーション）: 会話の癖・好み（例: 率直に結論から言われるのを好む）
- emotional_trigger（感情トリガー）: 感情の地雷・燃料（例: 権威主義的な態度に強く反発する）
- decision_pattern（意思決定パターン）: 判断の癖（例: 直感で仮説を立て後から検証する）
- motivation（動機）: 行動原理（例: 誇れるクオリティのものを世に出すこと）

## 出力形式
JSON配列のみを出力してください。マークダウンのコードブロックは不要です。
[
  {
    "key": "category:identifier",
    "content": "ユーザーについての情報（日本語）",
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

  return `以下のユーザープロファイルエントリから、**この人にどう接するべきか**という関係性の指針を生成してください。

## プロファイルエントリ
${entriesList}

## 出力フォーマット（必ずこの形式で）
## この人の本質
（2-3文で人間性の核を描写。事実の羅列ではなく、この人がどういう人間かを捉える）

## 接し方の指針
- （具体的な対話指針を3-5項目。「〜する」「〜しない」の形で）

## 注意すべきこと
- （地雷・避けるべきパターンを2-3項目）

## ルール
- 400トークン以内
- 2人称（「あなた」ではなく）ではなく、秘書が参照する指針として記述
- 事実の羅列ではなく、接し方に変換すること
- エントリが少ない場合は無理に埋めず、わかる範囲で書く`;
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
