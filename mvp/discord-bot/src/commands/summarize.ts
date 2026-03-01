import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  AttachmentBuilder,
} from "discord.js";
import { isAllowed, checkRateLimit } from "../guard";
import { validateUrl, fetchAndSummarize } from "../summarize";

export const data = new SlashCommandBuilder()
  .setName("summarize")
  .setDescription("URLの内容を要約する")
  .addStringOption((option) =>
    option.setName("url").setDescription("要約するURL").setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!isAllowed(interaction)) {
    await interaction.reply({ content: "このコマンドを使用する権限がありません。", ephemeral: true });
    return;
  }

  if (!checkRateLimit(interaction.user.id)) {
    await interaction.reply({ content: "レート制限中です。1分後に再試行してください。", ephemeral: true });
    return;
  }

  const url = interaction.options.getString("url", true);

  const validation = validateUrl(url);
  if (!validation.valid) {
    await interaction.reply({ content: validation.reason, ephemeral: true });
    return;
  }

  await interaction.deferReply();

  try {
    const result = await fetchAndSummarize(url);

    if (result.length <= 2000) {
      await interaction.editReply(result);
    } else {
      const buffer = Buffer.from(result, "utf-8");
      const attachment = new AttachmentBuilder(buffer, { name: "summary.md" });
      await interaction.editReply({
        content: "要約が長いためファイルとして添付します。",
        files: [attachment],
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "不明なエラーが発生しました";
    await interaction.editReply(`エラー: ${message}`);
  }
}
