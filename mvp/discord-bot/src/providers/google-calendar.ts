/**
 * Google Calendar API v3 直接呼び出し。
 * OAuth認証情報を使用。
 */

import { google } from "googleapis";
import { readFileSync } from "fs";

export interface CalendarEvent {
  summary: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
}

function getAuth() {
  const credPath = process.env.GOOGLE_OAUTH_CREDENTIALS;
  if (!credPath) throw new Error("GOOGLE_OAUTH_CREDENTIALS is required");

  const creds = JSON.parse(readFileSync(credPath, "utf-8"));
  const client = creds.installed ?? creds.web;
  if (!client) throw new Error("Invalid OAuth credentials format");

  const oauth2Client = new google.auth.OAuth2(
    client.client_id,
    client.client_secret,
  );

  const tokenPath = credPath.replace(/\.json$/, "-token.json");
  try {
    const token = JSON.parse(readFileSync(tokenPath, "utf-8"));
    oauth2Client.setCredentials(token);
  } catch {
    throw new Error(
      `OAuth token not found at ${tokenPath}. Run the MCP calendar auth flow first.`,
    );
  }

  return oauth2Client;
}

export async function getTodayEvents(): Promise<CalendarEvent[]> {
  const auth = getAuth();
  const calendar = google.calendar({ version: "v3", auth });

  const calendarIds = (process.env.GOOGLE_CALENDAR_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (calendarIds.length === 0) {
    throw new Error("GOOGLE_CALENDAR_IDS is required");
  }

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const events: CalendarEvent[] = [];

  const results = await Promise.allSettled(
    calendarIds.map((calendarId) =>
      calendar.events.list({
        calendarId,
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
      }),
    ),
  );

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("[google-calendar] Failed to fetch:", result.reason);
      continue;
    }

    for (const event of result.value.data.items ?? []) {
      const isAllDay = !!event.start?.date;
      const startTime = isAllDay
        ? "終日"
        : formatTime(event.start?.dateTime ?? "");
      const endTime = isAllDay
        ? ""
        : formatTime(event.end?.dateTime ?? "");

      events.push({
        summary: event.summary ?? "(no title)",
        startTime,
        endTime,
        isAllDay,
      });
    }
  }

  return events;
}

function formatTime(isoString: string): string {
  if (!isoString) return "";
  const d = new Date(isoString);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}
