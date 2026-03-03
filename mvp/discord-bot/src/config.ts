import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseEnvFile(path: string): Record<string, string> {
  const vars: Record<string, string> = {};
  try {
    const content = readFileSync(path, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      // Remove surrounding quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      vars[key] = value;
    }
  } catch {
    // File not found is OK
  }
  return vars;
}

function required(key: string, env: Record<string, string | undefined>): string {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function csvList(value: string): string[] {
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

// Detect workspace root (two levels up from this file's directory)
const defaultWorkspaceDir = resolve(__dirname, "../../../..");

// Merge: process.env < bot .env
const botEnv = parseEnvFile(resolve(__dirname, "../.env"));
const merged = { ...process.env, ...botEnv };

export const config = {
  discord: {
    token: required("DISCORD_TOKEN", merged),
    applicationId: required("DISCORD_APPLICATION_ID", merged),
  },
  allowed: {
    guildIds: csvList(required("ALLOWED_GUILD_IDS", merged)),
    userIds: csvList(required("ALLOWED_USER_IDS", merged)),
  },
  anthropic: {
    apiKey: required("ANTHROPIC_API_KEY", merged),
    model: merged.ANTHROPIC_MODEL || "claude-sonnet-4-6",
    maxTokens: parsePositiveInt(merged.ANTHROPIC_MAX_TOKENS, 4096),
  },
  workspaceDir: merged.WORKSPACE_DIR || defaultWorkspaceDir,
  claudeTimeoutMs: parsePositiveInt(merged.CLAUDE_TIMEOUT_MS, 300_000),
  rateLimitPerMinute: parsePositiveInt(merged.RATE_LIMIT_PER_MINUTE, 5),
  obsidianVaultPath: merged.OBSIDIAN_VAULT_PATH || "",
  bookmarkChannelIds: merged.BOOKMARK_CHANNEL_IDS ? csvList(merged.BOOKMARK_CHANNEL_IDS) : [],
  dataDir: merged.DATA_DIR || resolve(__dirname, "../data"),
} as const;
