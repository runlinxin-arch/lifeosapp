import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'

export interface Migration {
  version: number
  up: (db: DatabaseSync) => void
}

function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return rows.some((r) => r.name === column)
}

function addColumnIfMissing(db: DatabaseSync, table: string, column: string, ddl: string): void {
  if (!hasColumn(db, table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`)
}

export const MIGRATIONS: Migration[] = [
  {
    // v1 —— M1 基线（全部 IF NOT EXISTS，对已存在的 M1 库同样安全）
    version: 1,
    up: (db) => db.exec(`
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
  },
  {
    // v2 —— M2：日程事件表 + 长期任务完成标记
    version: 2,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          start_at TEXT NOT NULL,
          end_at TEXT NOT NULL,
          all_day INTEGER NOT NULL DEFAULT 0,
          location TEXT,
          note TEXT,
          repeat_type TEXT NOT NULL DEFAULT 'none' CHECK (repeat_type IN ('none','daily','weekly','monthly')),
          repeat_interval INTEGER NOT NULL DEFAULT 1,
          repeat_until TEXT,
          remind_minutes INTEGER NOT NULL DEFAULT 15,
          created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_at);
      `)
      addColumnIfMissing(db, 'long_tasks', 'done', 'INTEGER NOT NULL DEFAULT 0')
    }
  },
  {
    // v3 —— M3-1：自我学习三张表
    version: 3,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS learn_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'book' CHECK (type IN ('book','course','skill')),
          status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','learning','done')),
          total_units INTEGER NOT NULL DEFAULT 0,
          done_units INTEGER NOT NULL DEFAULT 0,
          start_date TEXT,
          end_date TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE INDEX IF NOT EXISTS idx_learn_items_status ON learn_items(status);

        CREATE TABLE IF NOT EXISTS learn_notes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          item_id INTEGER NOT NULL REFERENCES learn_items(id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE INDEX IF NOT EXISTS idx_learn_notes_item ON learn_notes(item_id);

        CREATE TABLE IF NOT EXISTS learn_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          item_id INTEGER NOT NULL REFERENCES learn_items(id) ON DELETE CASCADE,
          date TEXT NOT NULL,
          minutes INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE INDEX IF NOT EXISTS idx_learn_sessions_date ON learn_sessions(date);
      `)
    }
  },
  {
    // v4 —— M3-2：开发模块六张表
    version: 4,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','paused','done')),
          description TEXT NOT NULL DEFAULT '',
          start_date TEXT,
          end_date TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

        CREATE TABLE IF NOT EXISTS dev_tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          column_name TEXT NOT NULL DEFAULT 'todo' CHECK (column_name IN ('todo','doing','done')),
          position INTEGER NOT NULL DEFAULT 0,
          priority TEXT NOT NULL DEFAULT 'mid' CHECK (priority IN ('low','mid','high')),
          start_date TEXT,
          due_date TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE INDEX IF NOT EXISTS idx_dev_tasks_board ON dev_tasks(project_id, column_name, position);

        CREATE TABLE IF NOT EXISTS bugs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          priority TEXT NOT NULL DEFAULT 'mid' CHECK (priority IN ('low','mid','high')),
          status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','fixing','fixed')),
          created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE INDEX IF NOT EXISTS idx_bugs_project ON bugs(project_id, status);

        CREATE TABLE IF NOT EXISTS snippets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          code TEXT NOT NULL DEFAULT '',
          language TEXT NOT NULL DEFAULT '',
          tags TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS tech_notes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS dev_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id INTEGER NOT NULL REFERENCES dev_tasks(id) ON DELETE CASCADE,
          started_at TEXT NOT NULL,
          ended_at TEXT NOT NULL,
          minutes INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE INDEX IF NOT EXISTS idx_dev_sessions_task ON dev_sessions(task_id);
      `)
    }
  },
  {
    // v5 —— M3-3：设计灵感（画板 + 灵感条目）
    version: 5,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS inspiration_boards (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS inspirations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          board_id INTEGER REFERENCES inspiration_boards(id) ON DELETE SET NULL,
          text TEXT NOT NULL DEFAULT '',
          image_path TEXT,
          source_url TEXT,
          starred INTEGER NOT NULL DEFAULT 0,
          tags TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE INDEX IF NOT EXISTS idx_inspirations_board ON inspirations(board_id);
        CREATE INDEX IF NOT EXISTS idx_inspirations_starred ON inspirations(starred);
      `)
    }
  },
  {
    // v6 —— M4-1：健身（计划 / 打卡 / 身体数据）
    version: 6,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS workout_plans (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          schedule TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS workout_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          plan_id INTEGER REFERENCES workout_plans(id) ON DELETE SET NULL,
          date TEXT NOT NULL,
          content TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE INDEX IF NOT EXISTS idx_workout_logs_date ON workout_logs(date);

        CREATE TABLE IF NOT EXISTS body_metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL UNIQUE,
          weight REAL NOT NULL,
          body_fat REAL,
          created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE INDEX IF NOT EXISTS idx_body_metrics_date ON body_metrics(date);
      `)
    }
  },
  {
    // v7 —— M4-2：饮食（餐次记录 / 饮食计划）
    version: 7,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS meals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          type TEXT NOT NULL,
          items TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_meals_date_type ON meals(date, type);
        CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(date);

        CREATE TABLE IF NOT EXISTS meal_plans (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          type TEXT NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_plans_date_type ON meal_plans(date, type);
        CREATE INDEX IF NOT EXISTS idx_meal_plans_date ON meal_plans(date);
      `)
    }
  }
]

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version

/**
 * 逐个执行未应用的迁移。
 * 全部待应用迁移包在同一个事务里：任一迁移失败则整批回滚，
 * 既不会留下半套表结构，user_version 也不会前进。
 */
export function runMigrations(db: DatabaseSync, migrations: Migration[]): void {
  const current = Number(
    (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
  )
  const pending = migrations.filter((m) => m.version > current)
  if (pending.length === 0) return

  db.exec('BEGIN')
  try {
    for (const m of pending) {
      m.up(db)
      db.exec(`PRAGMA user_version = ${m.version}`)
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export function openDb(file: string): DatabaseSync {
  if (file !== ':memory:') {
    const idx = Math.max(file.lastIndexOf('\\'), file.lastIndexOf('/'))
    if (idx > 0) fs.mkdirSync(file.substring(0, idx), { recursive: true })
  }
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  runMigrations(db, MIGRATIONS)
  return db
}

export function ensureDataDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
  fs.mkdirSync(`${dir}\\backups`, { recursive: true })
  fs.mkdirSync(`${dir}\\images`, { recursive: true })
}
