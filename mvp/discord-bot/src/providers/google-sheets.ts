/**
 * Google Sheets API v4 直接呼び出し。
 * Service Account認証でシフト表を取得。
 */

import { google } from "googleapis";
import { readFileSync } from "fs";

export interface ShiftEntry {
  period: string;
  role: string;
  dayOfWeek: string;
}

const SEARCH_NAMES = ["ちいかた", "片田"];
const ROLE_KEYWORDS = ["講師", "TA", "朝会", "講義", "レビュー・デモ会", "夕会"];

// 列インデックスと曜日の対応
const DAY_MAP: Record<number, string> = {
  2: "月",
  3: "火",
  4: "水",
  5: "木",
  6: "金",
  7: "土",
};

function getAuth() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credPath) throw new Error("GOOGLE_APPLICATION_CREDENTIALS is required");

  const creds = JSON.parse(readFileSync(credPath, "utf-8"));
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

export async function getTodayShifts(): Promise<ShiftEntry[]> {
  const spreadsheetId = process.env.SHIFT_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error("SHIFT_SPREADSHEET_ID is required");

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "シフト表!A1:AB2163",
  });

  const rows = result.data.values ?? [];
  if (rows.length === 0) return [];

  const today = formatDateForSheet(new Date());
  const todayDayIndex = getTodayDayIndex();
  if (todayDayIndex === null) return []; // 日曜日はシフトなし

  // 日付行を検索
  const dateRowIndex = rows.findIndex((row) =>
    row.some((cell: string) => typeof cell === "string" && cell.includes(today)),
  );

  if (dateRowIndex === -1) return [];

  // 日付行から30行分を走査してシフトを抽出
  const shifts: ShiftEntry[] = [];
  let currentPeriod = "";

  for (let i = dateRowIndex + 1; i < Math.min(dateRowIndex + 35, rows.length); i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    // 次の日付行に到達したら終了
    if (row.some((cell: string) => typeof cell === "string" && /^\d{4}\/\d{2}\/\d{2}/.test(cell))) {
      break;
    }

    const firstCell = (row[0] ?? "").toString();
    const secondCell = (row[1] ?? "").toString();

    // header行（期ID検出）
    if (firstCell.startsWith("#") || secondCell.startsWith("#")) {
      currentPeriod = firstCell || secondCell;
      continue;
    }

    // ロール行を検出
    const roleCell = secondCell || firstCell;
    const matchedRole = ROLE_KEYWORDS.find(
      (r) => roleCell.includes(r),
    );

    if (!matchedRole) continue;

    // 該当曜日のセルをチェック
    const cellValue = (row[todayDayIndex] ?? "").toString();
    if (SEARCH_NAMES.some((name) => cellValue.includes(name))) {
      shifts.push({
        period: currentPeriod,
        role: matchedRole,
        dayOfWeek: DAY_MAP[todayDayIndex] ?? "",
      });
    }
  }

  return shifts;
}

function formatDateForSheet(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}/${m}/${d}`;
}

function getTodayDayIndex(): number | null {
  const day = new Date().getDay(); // 0=日, 1=月, ..., 6=土
  if (day === 0) return null; // 日曜日はなし
  // 月=2, 火=3, 水=4, 木=5, 金=6, 土=7
  return day + 1;
}
