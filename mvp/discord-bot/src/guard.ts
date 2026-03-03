import type { ChatInputCommandInteraction, Message } from "discord.js";
import { config } from "./config";

export function isAllowed(interaction: ChatInputCommandInteraction): boolean {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  if (guildId && !config.allowed.guildIds.includes(guildId)) return false;
  if (!config.allowed.userIds.includes(userId)) return false;

  return true;
}

export function isMessageAllowed(message: Message): boolean {
  const guildId = message.guildId;
  const userId = message.author.id;

  if (guildId && !config.allowed.guildIds.includes(guildId)) return false;
  if (!config.allowed.userIds.includes(userId)) return false;

  return true;
}

const timestamps = new Map<string, number[]>();

export function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const entries = timestamps.get(userId) ?? [];

  // Remove entries outside the window
  const recent = entries.filter((t) => now - t < windowMs);

  if (recent.length >= config.rateLimitPerMinute) {
    timestamps.set(userId, recent);
    return false;
  }

  recent.push(now);
  timestamps.set(userId, recent);
  return true;
}

export async function enforceGuards(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!isAllowed(interaction)) {
    await interaction.reply({ content: "このコマンドを使用する権限がありません。", ephemeral: true });
    return false;
  }
  if (!checkRateLimit(interaction.user.id)) {
    await interaction.reply({ content: "レート制限中です。1分後に再試行してください。", ephemeral: true });
    return false;
  }
  return true;
}
