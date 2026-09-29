import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'

export function openDb(file: string): DatabaseSync {
  if (file !== ':memory:') {
    const idx = Math.max(file.lastIndexOf('\\'), file.lastIndexOf('/'))
    if (idx > 0) fs.mkdirSync(file.substring(0, idx), { recursive: true })
  }
  const db = new DatabaseSync(file)
  db.exec("PRAGMA journal_mode = WAL")
  db.exec("PRAGMA foreign_keys = ON")
  migrate(db)
  return db
}

export function ensureDataDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
  fs.mkdirSync(`${dir}\\backups`, { recursive: true })
  fs.mkdirSync(`${dir}\\images`, { recursive: true })
}

function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'mid' CHECK (priority IN ('low','mid','high')),
      done_at TEXT,
      date TEXT NOT NULL,
      source_module TEXT,
      source_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(date);
    CREATE TABLE IF NOT EXISTS long_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#8b8d98',
      source_module TEXT,
      source_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_long_tasks_range ON long_tasks(start_date, end_date);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
}
