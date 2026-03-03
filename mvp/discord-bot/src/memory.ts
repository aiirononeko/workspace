/**
 * メモリストレージ層（AI非依存）。
 * Bun内蔵SQLiteで永続化。WALモードで競合・破損に強い。
 * 依存: config.ts のみ（リーフライク）
 */

import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { resolve } from "path";
import { config } from "./config";

const MAX_PROFILE_ENTRIES = 50;

export interface ProfileEntry {
  key: string;
  content: string;
  category: string;
  confidence: number;
  reinforceCount: number;
  sourceMessageId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

let db: Database;

export function initMemoryDb(): void {
  mkdirSync(config.dataDir, { recursive: true });
  const dbPath = resolve(config.dataDir, "memory.db");
  db = new Database(dbPath);
  db.run("PRAGMA journal_mode=WAL");
  db.run("PRAGMA foreign_keys=ON");

  db.run(`
    CREATE TABLE IF NOT EXISTS core_memory (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK(id = 1),
      summary TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS profile_entries (
      key TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      category TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.8,
      reinforce_count INTEGER NOT NULL DEFAULT 1,
      source_message_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Ensure core_memory row exists
  const row = db.query("SELECT id FROM core_memory WHERE id = 1").get();
  if (!row) {
    db.run("INSERT INTO core_memory (id, summary, updated_at) VALUES (1, '', '')");
  }
}

export function getCoreMemory(): string {
  const row = db.query<{ summary: string }, []>(
    "SELECT summary FROM core_memory WHERE id = 1",
  ).get();
  return row?.summary ?? "";
}

export function updateCoreMemory(summary: string): void {
  db.query(
    "UPDATE core_memory SET summary = ?, updated_at = ? WHERE id = 1",
  ).run(summary, new Date().toISOString());
}

export function getCoreMemoryUpdatedAt(): string {
  const row = db.query<{ updated_at: string }, []>(
    "SELECT updated_at FROM core_memory WHERE id = 1",
  ).get();
  return row?.updated_at ?? "";
}

export function getActiveProfileEntries(): ProfileEntry[] {
  const rows = db.query<{
    key: string;
    content: string;
    category: string;
    confidence: number;
    reinforce_count: number;
    source_message_id: string | null;
    status: string;
    created_at: string;
    updated_at: string;
  }, []>(
    "SELECT * FROM profile_entries WHERE status = 'active' ORDER BY (reinforce_count * confidence) DESC",
  ).all();

  return rows.map(toProfileEntry);
}

export function getTopProfileEntries(limit = 5): ProfileEntry[] {
  const rows = db.query<{
    key: string;
    content: string;
    category: string;
    confidence: number;
    reinforce_count: number;
    source_message_id: string | null;
    status: string;
    created_at: string;
    updated_at: string;
  }, [number]>(
    "SELECT * FROM profile_entries WHERE status = 'active' ORDER BY (reinforce_count * confidence) DESC LIMIT ?",
  ).all(limit);

  return rows.map(toProfileEntry);
}

export function upsertProfileEntry(entry: {
  key: string;
  content: string;
  category: string;
  confidence: number;
  sourceMessageId?: string | null;
}): void {
  const now = new Date().toISOString();
  const existing = db.query<{ reinforce_count: number; status: string }, [string]>(
    "SELECT reinforce_count, status FROM profile_entries WHERE key = ?",
  ).get(entry.key);

  if (existing) {
    // deleted のエントリは更新しない（復活バグ防止）
    if (existing.status === "deleted") return;

    db.query(
      `UPDATE profile_entries
       SET content = ?, confidence = ?, reinforce_count = ?, updated_at = ?
       WHERE key = ?`,
    ).run(
      entry.content,
      entry.confidence,
      existing.reinforce_count + 1,
      now,
      entry.key,
    );
  } else {
    db.query(
      `INSERT INTO profile_entries (key, content, category, confidence, reinforce_count, source_message_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, 'active', ?, ?)`,
    ).run(
      entry.key,
      entry.content,
      entry.category,
      entry.confidence,
      entry.sourceMessageId ?? null,
      now,
      now,
    );
  }

  // Max entries enforcement: evict lowest-score active entries
  evictIfNeeded();
}

export function deleteProfileEntry(key: string): boolean {
  const result = db.query(
    "UPDATE profile_entries SET status = 'deleted', updated_at = ? WHERE key = ? AND status = 'active'",
  ).run(key, new Date().toISOString());
  return result.changes > 0;
}

export function hardDeleteEntry(key: string): void {
  db.query("DELETE FROM profile_entries WHERE key = ?").run(key);
}

export function clearAllMemory(): void {
  db.run("UPDATE core_memory SET summary = '', updated_at = '' WHERE id = 1");
  db.run("DELETE FROM profile_entries");
}

export function getProfileEntryCount(): number {
  const row = db.query<{ count: number }, []>(
    "SELECT COUNT(*) as count FROM profile_entries WHERE status = 'active'",
  ).get();
  return row?.count ?? 0;
}

function evictIfNeeded(): void {
  const count = getProfileEntryCount();
  if (count <= MAX_PROFILE_ENTRIES) return;

  const excess = count - MAX_PROFILE_ENTRIES;
  db.query(
    `UPDATE profile_entries SET status = 'deleted', updated_at = ?
     WHERE key IN (
       SELECT key FROM profile_entries
       WHERE status = 'active'
       ORDER BY (reinforce_count * confidence) ASC
       LIMIT ?
     )`,
  ).run(new Date().toISOString(), excess);
}

function toProfileEntry(row: {
  key: string;
  content: string;
  category: string;
  confidence: number;
  reinforce_count: number;
  source_message_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}): ProfileEntry {
  return {
    key: row.key,
    content: row.content,
    category: row.category,
    confidence: row.confidence,
    reinforceCount: row.reinforce_count,
    sourceMessageId: row.source_message_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
