/**
 * 朝の定期通知Job。
 * GitHub Tasks + Google Calendar + Google Sheets のデータを統合してDiscordに送信。
 */

import { initJobStore, hasRunToday, markRun } from "../notifier/job-store";
import { sendEmbed, type Embed, type EmbedField } from "../notifier/webhook";
import { getTodayTasks } from "../providers/github-tasks";
import { getTodayEvents } from "../providers/google-calendar";
import { getTodayShifts } from "../providers/google-sheets";

function getWebhookUrl(): string {
  const url = process.env.NOTIFY_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
  if (!url) throw new Error("NOTIFY_WEBHOOK_URL or DISCORD_WEBHOOK_URL is required");
  return url;
}

async function main(): Promise<void> {
  console.log("[daily-briefing] Starting...");

  initJobStore();

  if (hasRunToday("daily-briefing")) {
    console.log("[daily-briefing] Already ran today. Skipping.");
    return;
  }

  const webhookUrl = getWebhookUrl();

  // 3つのproviderを並列実行
  const [tasksResult, eventsResult, shiftsResult] = await Promise.allSettled([
    getTodayTasks(),
    getTodayEvents(),
    getTodayShifts(),
  ]);

  const fields: EmbedField[] = [];
  let hasError = false;

  // タスク
  if (tasksResult.status === "fulfilled") {
    const tasks = tasksResult.value;
    if (tasks.length > 0) {
      const taskList = tasks
        .slice(0, 5)
        .map((t) => `- **[${t.status}]** ${t.title}`)
        .join("\n");
      fields.push({
        name: `📋 今日のタスク (${tasks.length}件)`,
        value: taskList + (tasks.length > 5 ? `\n...他${tasks.length - 5}件` : ""),
      });
    } else {
      fields.push({
        name: "📋 今日のタスク",
        value: "期限が今日のタスクはありません",
      });
    }
  } else {
    console.error("[daily-briefing] Tasks failed:", tasksResult.reason);
    fields.push({ name: "📋 今日のタスク", value: "⚠️ 取得失敗" });
    hasError = true;
  }

  // カレンダー
  if (eventsResult.status === "fulfilled") {
    const events = eventsResult.value;
    if (events.length > 0) {
      const eventList = events
        .slice(0, 5)
        .map((e) => {
          const time = e.isAllDay ? "終日" : `${e.startTime}〜${e.endTime}`;
          return `- ${time} ${e.summary}`;
        })
        .join("\n");
      fields.push({
        name: `📆 今日の予定 (${events.length}件)`,
        value: eventList + (events.length > 5 ? `\n...他${events.length - 5}件` : ""),
      });
    } else {
      fields.push({
        name: "📆 今日の予定",
        value: "予定はありません",
      });
    }
  } else {
    console.error("[daily-briefing] Calendar failed:", eventsResult.reason);
    fields.push({ name: "📆 今日の予定", value: "⚠️ 取得失敗" });
    hasError = true;
  }

  // シフト
  if (shiftsResult.status === "fulfilled") {
    const shifts = shiftsResult.value;
    if (shifts.length > 0) {
      const shiftList = shifts
        .map((s) => `- ${s.period} ${s.role}`)
        .join("\n");
      fields.push({
        name: `🏫 今日のシフト (${shifts.length}件)`,
        value: shiftList,
      });
    }
    // シフトがない場合はフィールド自体を省略
  } else {
    console.error("[daily-briefing] Shifts failed:", shiftsResult.reason);
    fields.push({ name: "🏫 今日のシフト", value: "⚠️ 取得失敗" });
    hasError = true;
  }

  const today = new Date().toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  const embed: Embed = {
    title: `📅 ${today}`,
    color: 0x5865f2,
    fields,
    timestamp: new Date().toISOString(),
  };

  await sendEmbed(webhookUrl, [embed]);

  const status = hasError ? "partial" : "success";
  markRun("daily-briefing", status);
  console.log(`[daily-briefing] Done (${status}).`);
}

main().catch((error) => {
  console.error("[daily-briefing] Fatal error:", error);
  // Record the failure so we can retry
  try {
    initJobStore();
    markRun("daily-briefing", "error", String(error));
  } catch { /* ignore */ }
  process.exit(1);
});
