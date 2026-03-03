import { SYSTEM_PROMPT } from "./personality";
import { getCoreMemory, getTopProfileEntries } from "./memory";

export function buildSystemPromptWithMemory(): string {
  const coreMemory = getCoreMemory();
  const topEntries = getTopProfileEntries(10);

  if (!coreMemory && topEntries.length === 0) return SYSTEM_PROMPT;

  let memorySection = "\n\n## ユーザーとの関係性\n";

  if (coreMemory) {
    memorySection += `\n${coreMemory}\n`;
  }

  if (topEntries.length > 0) {
    memorySection += "\n### プロファイル詳細\n";
    const grouped = groupByCategory(topEntries);
    for (const [category, entries] of Object.entries(grouped)) {
      memorySection += `\n**${category}**\n`;
      for (const entry of entries) {
        memorySection += `- ${entry.content}\n`;
      }
    }
  }

  return SYSTEM_PROMPT + memorySection;
}

function groupByCategory(entries: { category: string; content: string }[]): Record<string, { content: string }[]> {
  const groups: Record<string, { content: string }[]> = {};
  for (const entry of entries) {
    if (!groups[entry.category]) groups[entry.category] = [];
    groups[entry.category].push({ content: entry.content });
  }
  return groups;
}
