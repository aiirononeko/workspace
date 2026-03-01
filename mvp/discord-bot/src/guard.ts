import type { ChatInputCommandInteraction } from "discord.js";
import { config } from "./config";

export function isAllowed(interaction: ChatInputCommandInteraction): boolean {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

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
