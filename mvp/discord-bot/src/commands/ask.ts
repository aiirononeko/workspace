import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  AttachmentBuilder,
} from "discord.js";
import { enforceGuards } from "../guard";
import { runClaude } from "../claude";
import { SYSTEM_PROMPT } from "../personality";
import { getCoreMemory, getTopProfileEntries } from "../memory";
import { extractAndUpdateMemory } from "../memory-extractor";

export const data = new SlashCommandBuilder()
  .setName("ask")
  .setDescription("Claude Codeに質問する")
  .addStringOption((option) =>
    option
      .setName("prompt")
      .setDescription("質問内容")
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!(await enforceGuards(interaction))) return;

  const prompt = interaction.options.getString("prompt", true);

  await interaction.deferReply();

  try {
    const systemPrompt = buildSystemPromptWithMemory();
    const result = await runClaude(prompt, { system: systemPrompt });

    if (result.length <= 2000) {
      await interaction.editReply(result);
    } else {
      // Send as markdown file attachment
      const buffer = Buffer.from(result, "utf-8");
      const attachment = new AttachmentBuilder(buffer, { name: "response.md" });
      await interaction.editReply({
        content: "回答が長いためファイルとして添付します。",
        files: [attachment],
      });
    }

    // 非同期でメモリ抽出
    extractAndUpdateMemory([{ role: "user", content: prompt }]).catch((err) =>
      console.error("[ask] Memory extraction failed:", err),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "不明なエラーが発生しました";
    await interaction.editReply(`エラー: ${message}`);
  }
}

function buildSystemPromptWithMemory(): string {
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
