import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openDb, runMigrations, LATEST_VERSION, type Migration } from '../src/main/db'

let dir: string
let dbFile: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lifeos-mig-')); dbFile = path.join(dir, 'app.db') })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

const columns = (db: ReturnType<typeof openDb>, table: string): string[] =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name)

const version = (db: ReturnType<typeof openDb>): number =>
  (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version

describe('migrate', () => {
  it('新库迁移到最新版本，events 表与 long_tasks.done 就位', () => {
    const db = openDb(dbFile)
    expect(version(db)).toBe(LATEST_VERSION)
    expect(columns(db, 'events')).toContain('repeat_type')
    expect(columns(db, 'events')).toContain('remind_minutes')
    expect(columns(db, 'events')).toContain('all_day')
    expect(columns(db, 'long_tasks')).toContain('done')
    db.close()
  })

  it('M1 老库（user_version=0 且 long_tasks 无 done）能平滑升级且数据保留', () => {
    // 手工造一个 M1 形态的库：没有 user_version、long_tasks 无 done 列
    const raw = openDb(dbFile)
    raw.exec('DROP TABLE long_tasks')
    raw.exec(`CREATE TABLE long_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL,
      start_date TEXT NOT NULL, end_date TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#8b8d98',
      source_module TEXT, source_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')))`)
    raw.exec('PRAGMA user_version = 0')
    raw.prepare("INSERT INTO long_tasks (title, start_date, end_date) VALUES ('备考', '2026-10-01', '2026-12-01')").run()
    raw.prepare("INSERT INTO tasks (title, date) VALUES ('老待办', '2026-09-30')").run()
    raw.close()

    const db = openDb(dbFile)
    expect(version(db)).toBe(LATEST_VERSION)
    expect(columns(db, 'long_tasks')).toContain('done')
    expect(db.prepare('SELECT title, done FROM long_tasks').get()).toEqual({ title: '备考', done: 0 })
    expect(db.prepare('SELECT COUNT(*) c FROM tasks').get()).toEqual({ c: 1 })
    db.close()
  })

  it('重复打开是幂等的', () => {
    openDb(dbFile).close()
    const db = openDb(dbFile)
    expect(version(db)).toBe(LATEST_VERSION)
    expect(columns(db, 'long_tasks').filter((c) => c === 'done')).toHaveLength(1)
    db.close()
  })

  it('某个迁移抛错时整批回滚，版本号不前进', () => {
    const db = openDb(dbFile)
    const before = version(db)
    const bad: Migration[] = [
      { version: before + 1, up: (d) => { d.exec('CREATE TABLE tmp_ok (id INTEGER)') } },
      { version: before + 2, up: () => { throw new Error('boom') } }
    ]
    expect(() => runMigrations(db, bad)).toThrow('boom')
    expect(version(db)).toBe(before)
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
      .map((t) => t.name)
    expect(tables).not.toContain('tmp_ok')
    db.close()
  })

  it('迁移成功后版本号等于最后一个已应用迁移', () => {
    const db = openDb(dbFile)
    const before = version(db)
    runMigrations(db, [{ version: before + 1, up: (d) => { d.exec('CREATE TABLE tmp_next (id INTEGER)') } }])
    expect(version(db)).toBe(before + 1)
    db.close()
  })
})
