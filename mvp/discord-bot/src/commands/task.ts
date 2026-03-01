import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { enforceGuards } from "../guard";

const PROJECT_NUMBER = "3";
const PROJECT_ID = "PVT_kwHOAydZm84BQBr1";
const OWNER = "aiirononeko";
const STATUS_FIELD_ID = "PVTSSF_lAHOAydZm84BQBr1zg-Q9WI";
const TARGET_DATE_FIELD_ID = "PVTF_lAHOAydZm84BQBr1zg-Q9bo";
const ASSIGNEE_NODE_ID = "U_kgDOAydZmw";

const STATUS_OPTIONS: Record<string, string> = {
  Backlog: "f75ad846",
  Ready: "61e4505c",
  "In progress": "47fc9ee4",
  Done: "98236657",
};

export const data = new SlashCommandBuilder()
  .setName("task")
  .setDescription("GitHub Projectsにタスクを作成する")
  .addStringOption((option) =>
    option
      .setName("title")
      .setDescription("タスクのタイトル")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("description")
      .setDescription("タスクの説明")
      .setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName("status")
      .setDescription("ステータス（デフォルト: Backlog）")
      .setRequired(false)
      .addChoices(
        { name: "Backlog", value: "Backlog" },
        { name: "Ready", value: "Ready" },
        { name: "In progress", value: "In progress" },
        { name: "Done", value: "Done" }
      )
  )
  .addStringOption((option) =>
    option
      .setName("target_date")
      .setDescription("期限（YYYY-MM-DD）")
      .setRequired(false)
  );

async function runGh(args: string[]): Promise<string> {
  const proc = Bun.spawn(["gh", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    console.error("gh failed", { args, exitCode, stderr: stderr.trim() });
    throw new Error("GitHub操作に失敗しました");
  }

  return stdout.trim();
}

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!(await enforceGuards(interaction))) return;

  const title = interaction.options.getString("title", true);
  const description = interaction.options.getString("description") ?? "";
  const status = interaction.options.getString("status") ?? "Backlog";
  const targetDate = interaction.options.getString("target_date");

  // Validate target_date format and value
  const isValidDate = (d: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    const parsed = new Date(`${d}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d;
  };
  if (targetDate && !isValidDate(targetDate)) {
    await interaction.reply({
      content: "期限の形式が正しくありません。YYYY-MM-DD形式で指定してください。",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  try {
    // 1. Create draft issue
    const createArgs = [
      "project",
      "item-create",
      PROJECT_NUMBER,
      "--owner",
      OWNER,
      "--title",
      title,
      "--body",
      description,
      "--format",
      "json",
    ];

    const createOutput = await runGh(createArgs);
    const createResult = JSON.parse(createOutput);
    const itemId = createResult.id;
    const draftIssueId = createResult.content?.id;

    if (!itemId) {
      throw new Error("アイテムIDの取得に失敗しました");
    }

    // 2-4. Set status, target date, assignee in parallel
    const fieldUpdates: Promise<string>[] = [];

    const statusOptionId = STATUS_OPTIONS[status];
    if (statusOptionId) {
      fieldUpdates.push(runGh([
        "project", "item-edit",
        "--id", itemId,
        "--project-id", PROJECT_ID,
        "--field-id", STATUS_FIELD_ID,
        "--single-select-option-id", statusOptionId,
      ]));
    }

    if (targetDate) {
      fieldUpdates.push(runGh([
        "project", "item-edit",
        "--id", itemId,
        "--project-id", PROJECT_ID,
        "--field-id", TARGET_DATE_FIELD_ID,
        "--date", targetDate,
      ]));
    }

    if (draftIssueId) {
      const mutation = `mutation($draftIssueId: ID!, $assigneeIds: [ID!]!) {
  updateProjectV2DraftIssue(input: {draftIssueId: $draftIssueId, assigneeIds: $assigneeIds}) {
    draftIssue { id }
  }
}`;
      fieldUpdates.push(runGh([
        "api", "graphql",
        "-f", `query=${mutation}`,
        "-F", `draftIssueId=${draftIssueId}`,
        "-F", `assigneeIds[]=${ASSIGNEE_NODE_ID}`,
      ]));
    }

    await Promise.all(fieldUpdates);

    // Build response message
    const parts = [
      `タスクを作成しました`,
      `**タイトル**: ${title}`,
      `**ステータス**: ${status}`,
    ];

    if (description) {
      parts.push(`**説明**: ${description}`);
    }

    if (targetDate) {
      parts.push(`**期限**: ${targetDate}`);
    }

    parts.push(`**担当者**: ${OWNER}`);

    await interaction.editReply(parts.join("\n"));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "不明なエラーが発生しました";
    await interaction.editReply(`タスク作成エラー: ${message}`);
  }
}
