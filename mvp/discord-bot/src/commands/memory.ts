import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { enforceGuards } from "../guard";
import {
  getCoreMemory,
  getActiveProfileEntries,
  deleteProfileEntry,
  clearAllMemory,
} from "../memory";
import { synthesizeCoreMemory } from "../memory-extractor";

export const data = new SlashCommandBuilder()
  .setName("memory")
  .setDescription("ボットのメモリを管理する")
  .addSubcommand((sub) =>
    sub.setName("show").setDescription("記憶している内容を表示する"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("delete")
      .setDescription("特定の記憶を削除する")
      .addStringOption((opt) =>
        opt
          .setName("key")
          .setDescription("削除するエントリのキー")
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("clear").setDescription("全ての記憶を削除する"),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!(await enforceGuards(interaction))) return;

  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case "show":
      await handleShow(interaction);
      break;
    case "delete":
      await handleDelete(interaction);
      break;
    case "clear":
      await handleClear(interaction);
      break;
  }
}

async function handleShow(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const coreMemory = getCoreMemory();
  const entries = getActiveProfileEntries();

  let response = "**📝 メモリ内容**\n\n";

  if (coreMemory) {
    response += `**Core Memory:**\n${coreMemory}\n\n`;
  } else {
    response += "**Core Memory:** （空）\n\n";
  }

  if (entries.length > 0) {
    response += `**Profile Entries (${entries.length}件):**\n`;
    for (const entry of entries) {
      const score = (entry.reinforceCount * entry.confidence).toFixed(1);
      response += `- \`${entry.key}\` [${entry.category}] ${entry.content} (confidence: ${entry.confidence}, score: ${score})\n`;
    }
  } else {
    response += "**Profile Entries:** （空）\n";
  }

  if (response.length > 2000) {
    response = response.slice(0, 1997) + "...";
  }

  await interaction.editReply(response);
}

async function handleDelete(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const key = interaction.options.getString("key", true);
  const deleted = deleteProfileEntry(key);

  if (deleted) {
    // Core Memory再統合をトリガー（削除されたエントリを反映）
    synthesizeCoreMemory().catch((err) =>
      console.error("[memory] Core memory synthesis after delete failed:", err),
    );
    await interaction.editReply(`\`${key}\` を削除しました。Core Memoryを再統合中...`);
  } else {
    await interaction.editReply(`\`${key}\` が見つからないか、既に削除されています。`);
  }
}

async function handleClear(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  clearAllMemory();
  await interaction.editReply("全てのメモリを削除しました。");
}
