import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  AttachmentBuilder,
} from "discord.js";
import { isAllowed, checkRateLimit } from "../guard";
import { runClaude } from "../claude";

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
  if (!isAllowed(interaction)) {
    await interaction.reply({ content: "このコマンドを使用する権限がありません。", ephemeral: true });
    return;
  }

  if (!checkRateLimit(interaction.user.id)) {
    await interaction.reply({ content: "レート制限中です。1分後に再試行してください。", ephemeral: true });
    return;
  }

  const prompt = interaction.options.getString("prompt", true);

  await interaction.deferReply();

  try {
    const result = await runClaude(prompt);

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
  } catch (error) {
    const message = error instanceof Error ? error.message : "不明なエラーが発生しました";
    await interaction.editReply(`エラー: ${message}`);
  }
}
