import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { isAllowed, checkRateLimit } from "../guard";
import { config } from "../config";
import { mkdirSync, writeFileSync } from "fs";
import { join, resolve, relative, isAbsolute } from "path";

export const data = new SlashCommandBuilder()
  .setName("save")
  .setDescription("Obsidian Vaultにメモを保存する")
  .addStringOption((option) =>
    option.setName("title").setDescription("メモのタイトル").setRequired(true)
  )
  .addStringOption((option) =>
    option.setName("content").setDescription("メモの内容").setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("tags")
      .setDescription("タグ（カンマ区切り）")
      .setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName("folder")
      .setDescription("保存先フォルダ（デフォルト: Inbox）")
      .setRequired(false)
  );

function toSlug(title: string): string {
  return title
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u3000-\u9FFF\u4E00-\u9FFF\uF900-\uFAFF\-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

function toISOWithOffset(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const absOffset = Math.abs(offset);
  const hours = String(Math.floor(absOffset / 60)).padStart(2, "0");
  const minutes = String(absOffset % 60).padStart(2, "0");
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${hours}:${minutes}`
  );
}

export interface SaveToObsidianOptions {
  title: string;
  content: string;
  tags?: string[];
  folder?: string;
  source?: string;
  sourceType?: string;
  summary?: string;
  sourceUrl?: string;
}

export interface SaveResult {
  success: boolean;
  filePath?: string;
  relativePath?: string;
  error?: string;
}

export function saveToObsidian(options: SaveToObsidianOptions): SaveResult {
  const vaultPath = config.obsidianVaultPath;
  if (!vaultPath) {
    return { success: false, error: "OBSIDIAN_VAULT_PATH が設定されていません" };
  }

  const {
    title, content, tags = [], folder = "Inbox",
    source = "discord", sourceType, summary, sourceUrl,
  } = options;

  const vaultRoot = resolve(vaultPath);
  const dirPath = resolve(vaultRoot, folder);
  const rel = relative(vaultRoot, dirPath);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    return { success: false, error: "保存先フォルダが不正です" };
  }

  const now = new Date();
  const timestamp = formatTimestamp(now);
  const slug = toSlug(title);
  const fileName = `${timestamp}-${slug}.md`;

  const tagsYaml =
    tags.length > 0
      ? `tags: [${tags.join(", ")}]`
      : "tags: []";

  const frontmatterLines = [
    "---",
    `title: "${title.replace(/"/g, '\\"')}"`,
    `date: "${toISOWithOffset(now)}"`,
    tagsYaml,
    `source: ${source}`,
  ];

  if (sourceType) {
    frontmatterLines.push(`source_type: ${sourceType}`);
  }
  if (sourceUrl) {
    frontmatterLines.push(`url: "${sourceUrl}"`);
  }
  if (summary) {
    frontmatterLines.push(`summary: "${summary.replace(/"/g, '\\"').replace(/\n/g, " ")}"`);
  }
  frontmatterLines.push(`status: fleeting`);
  frontmatterLines.push("---");

  const markdown = frontmatterLines.join("\n") + "\n\n" + content + "\n";

  const filePath = join(dirPath, fileName);

  try {
    mkdirSync(dirPath, { recursive: true });
    writeFileSync(filePath, markdown, "utf-8");
    return { success: true, filePath, relativePath: `${folder}/${fileName}` };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "不明なエラーが発生しました";
    return { success: false, error: message };
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!isAllowed(interaction)) {
    await interaction.reply({
      content: "このコマンドを使用する権限がありません。",
      ephemeral: true,
    });
    return;
  }

  if (!checkRateLimit(interaction.user.id)) {
    await interaction.reply({
      content: "レート制限中です。1分後に再試行してください。",
      ephemeral: true,
    });
    return;
  }

  if (!config.obsidianVaultPath) {
    await interaction.reply({
      content: "エラー: OBSIDIAN_VAULT_PATH が設定されていません。",
      ephemeral: true,
    });
    return;
  }

  const title = interaction.options.getString("title", true);
  const content = interaction.options.getString("content", true);
  const tagsRaw = interaction.options.getString("tags");
  const folderInput = interaction.options.getString("folder") || "Inbox";

  const tags = tagsRaw
    ? tagsRaw.split(",").map((t: string) => t.trim()).filter(Boolean)
    : [];

  const result = saveToObsidian({ title, content, tags, folder: folderInput });

  if (result.success) {
    await interaction.reply({
      content: `保存しました: \`${result.relativePath}\``,
    });
  } else {
    await interaction.reply({
      content: `保存に失敗しました: ${result.error}`,
      ephemeral: true,
    });
  }
}
