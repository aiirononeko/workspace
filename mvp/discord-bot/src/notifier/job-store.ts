/**
 * Job実行管理・RSS既読管理。
 * Bun内蔵SQLite（WALモード）で永続化。
 */

import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../../data");

let db: Database;

export function initJobStore(): void {
  mkdirSync(DATA_DIR, { recursive: true });
  const dbPath = resolve(DATA_DIR, "jobs.db");
  db = new Database(dbPath);
  db.run("PRAGMA journal_mode=WAL");

  db.run(`
    CREATE TABLE IF NOT EXISTS job_runs (
      job_name TEXT NOT NULL,
      run_date TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL,
      PRIMARY KEY (job_name, run_date)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS seen_feed_items (
      feed_url TEXT NOT NULL,
      item_id TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      PRIMARY KEY (feed_url, item_id)
    )
  `);
}

export function hasRunToday(jobName: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  const row = db
    .query<{ status: string }, [string, string]>(
      "SELECT status FROM job_runs WHERE job_name = ? AND run_date = ?",
    )
    .get(jobName, today);
  return row?.status === "success";
}

export function markRun(
  jobName: string,
  status: "success" | "partial" | "error",
  error?: string,
): void {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  db.query(
    `INSERT OR REPLACE INTO job_runs (job_name, run_date, status, error, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(jobName, today, status, error ?? null, now);
}

export function isItemSeen(feedUrl: string, itemId: string): boolean {
  const row = db
    .query<{ item_id: string }, [string, string]>(
      "SELECT item_id FROM seen_feed_items WHERE feed_url = ? AND item_id = ?",
    )
    .get(feedUrl, itemId);
  return row !== null;
}

export function markItemSeen(feedUrl: string, itemId: string): void {
  const now = new Date().toISOString();
  db.query(
    `INSERT OR IGNORE INTO seen_feed_items (feed_url, item_id, first_seen_at)
     VALUES (?, ?, ?)`,
  ).run(feedUrl, itemId, now);
}
