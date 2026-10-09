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

describe('学习模块迁移 v3', () => {
  it('新库含三张学习表', () => {
    const db = openDb(dbFile)
    expect(version(db)).toBe(LATEST_VERSION)
    expect(columns(db, 'learn_items')).toEqual([
      'id', 'title', 'type', 'status', 'total_units', 'done_units',
      'start_date', 'end_date', 'created_at', 'updated_at'
    ])
    expect(columns(db, 'learn_notes')).toContain('item_id')
    expect(columns(db, 'learn_sessions')).toContain('minutes')
    db.close()
  })

  it('M2 老库能平滑升级到 v3 且数据保留', () => {
    const raw = openDb(dbFile)
    // 模拟只有 M2 结构的库：先删子表再删父表，最后把版本退回 v2
    raw.exec('DROP TABLE learn_sessions')
    raw.exec('DROP TABLE learn_notes')
    raw.exec('DROP TABLE learn_items')
    raw.exec('PRAGMA user_version = 2')
    raw.prepare("INSERT INTO tasks (title, date) VALUES ('M2 老待办', '2026-10-09')").run()
    raw.close()

    const db = openDb(dbFile)
    expect(version(db)).toBe(LATEST_VERSION)
    expect(columns(db, 'learn_items')).toContain('total_units')
    expect(db.prepare('SELECT COUNT(*) c FROM tasks').get()).toEqual({ c: 1 })
    db.close()
  })

  it('删除学习项会级联删掉其笔记与学习记录', () => {
    const db = openDb(dbFile)
    db.prepare("INSERT INTO learn_items (title) VALUES ('雅思')").run()
    const itemId = (db.prepare('SELECT id FROM learn_items').get() as { id: number }).id
    db.prepare('INSERT INTO learn_notes (item_id, content) VALUES (?, ?)').run(itemId, '笔记')
    db.prepare('INSERT INTO learn_sessions (item_id, date, minutes) VALUES (?, ?, ?)').run(itemId, '2026-10-09', 30)

    db.prepare('DELETE FROM learn_items WHERE id = ?').run(itemId)
    expect(db.prepare('SELECT COUNT(*) c FROM learn_notes').get()).toEqual({ c: 0 })
    expect(db.prepare('SELECT COUNT(*) c FROM learn_sessions').get()).toEqual({ c: 0 })
    db.close()
  })

  it('学习项类型与状态受 CHECK 约束', () => {
    const db = openDb(dbFile)
    expect(() => db.prepare("INSERT INTO learn_items (title, type) VALUES ('x', 'video')").run()).toThrow()
    expect(() => db.prepare("INSERT INTO learn_items (title, status) VALUES ('x', 'paused')").run()).toThrow()
    db.close()
  })
})

describe('开发模块迁移 v4', () => {
  it('新库含六张开发表', () => {
    const db = openDb(dbFile)
    expect(version(db)).toBe(LATEST_VERSION)
    expect(columns(db, 'projects')).toContain('status')
    expect(columns(db, 'dev_tasks')).toContain('column_name')
    expect(columns(db, 'dev_tasks')).toContain('position')
    expect(columns(db, 'dev_tasks')).toContain('priority')
    expect(columns(db, 'bugs')).toContain('priority')
    expect(columns(db, 'snippets')).toContain('tags')
    expect(columns(db, 'tech_notes')).toContain('project_id')
    expect(columns(db, 'dev_sessions')).toContain('minutes')
    db.close()
  })

  it('v3 老库能平滑升级到 v4 且学习数据保留', () => {
    const raw = openDb(dbFile)
    raw.exec('DROP TABLE dev_sessions')
    raw.exec('DROP TABLE tech_notes')
    raw.exec('DROP TABLE snippets')
    raw.exec('DROP TABLE bugs')
    raw.exec('DROP TABLE dev_tasks')
    raw.exec('DROP TABLE projects')
    raw.exec('PRAGMA user_version = 3')
    raw.prepare("INSERT INTO learn_items (title) VALUES ('M3-1 老学习项')").run()
    raw.close()

    const db = openDb(dbFile)
    expect(version(db)).toBe(LATEST_VERSION)
    expect(columns(db, 'projects')).toContain('status')
    expect(db.prepare('SELECT COUNT(*) c FROM learn_items').get()).toEqual({ c: 1 })
    db.close()
  })

  it('删除项目级联删掉其看板任务、Bug 与计时记录', () => {
    const db = openDb(dbFile)
    db.prepare("INSERT INTO projects (name) VALUES ('LifeOS')").run()
    const pid = (db.prepare('SELECT id FROM projects').get() as { id: number }).id
    db.prepare("INSERT INTO dev_tasks (project_id, title) VALUES (?, '看板任务')").run(pid)
    const tid = (db.prepare('SELECT id FROM dev_tasks').get() as { id: number }).id
    db.prepare("INSERT INTO bugs (project_id, title) VALUES (?, '一个 Bug')").run(pid)
    db.prepare("INSERT INTO dev_sessions (task_id, started_at, ended_at, minutes) VALUES (?, '2026-10-09 09:00', '2026-10-09 10:00', 60)").run(tid)

    db.prepare('DELETE FROM projects WHERE id = ?').run(pid)
    expect(db.prepare('SELECT COUNT(*) c FROM dev_tasks').get()).toEqual({ c: 0 })
    expect(db.prepare('SELECT COUNT(*) c FROM bugs').get()).toEqual({ c: 0 })
    expect(db.prepare('SELECT COUNT(*) c FROM dev_sessions').get()).toEqual({ c: 0 })
    db.close()
  })

  it('删除项目时技术笔记保留，只解除关联', () => {
    const db = openDb(dbFile)
    db.prepare("INSERT INTO projects (name) VALUES ('P')").run()
    const pid = (db.prepare('SELECT id FROM projects').get() as { id: number }).id
    db.prepare("INSERT INTO tech_notes (title, project_id) VALUES ('笔记', ?)").run(pid)

    db.prepare('DELETE FROM projects WHERE id = ?').run(pid)
    const note = db.prepare('SELECT title, project_id FROM tech_notes').get() as { title: string; project_id: number | null }
    expect(note.title).toBe('笔记')
    expect(note.project_id).toBeNull()
    db.close()
  })

  it('看板列、项目状态、Bug 状态受 CHECK 约束', () => {
    const db = openDb(dbFile)
    db.prepare("INSERT INTO projects (name) VALUES ('P')").run()
    const pid = (db.prepare('SELECT id FROM projects').get() as { id: number }).id
    expect(() => db.prepare("INSERT INTO projects (name, status) VALUES ('X', 'archived')").run()).toThrow()
    expect(() => db.prepare("INSERT INTO dev_tasks (project_id, title, column_name) VALUES (?, 'T', 'review')").run(pid)).toThrow()
    expect(() => db.prepare("INSERT INTO bugs (project_id, title, status) VALUES (?, 'B', 'wontfix')").run(pid)).toThrow()
    db.close()
  })
})

describe('灵感模块迁移 v5', () => {
  it('新库含两张灵感表', () => {
    const db = openDb(dbFile)
    expect(version(db)).toBe(LATEST_VERSION)
    expect(columns(db, 'inspiration_boards')).toEqual(['id', 'name', 'created_at', 'updated_at'])
    expect(columns(db, 'inspirations')).toContain('board_id')
    expect(columns(db, 'inspirations')).toContain('image_path')
    expect(columns(db, 'inspirations')).toContain('source_url')
    expect(columns(db, 'inspirations')).toContain('starred')
    expect(columns(db, 'inspirations')).toContain('tags')
    db.close()
  })

  it('v4 老库能平滑升级到 v5 且开发数据保留', () => {
    const raw = openDb(dbFile)
    raw.exec('DROP TABLE inspirations')
    raw.exec('DROP TABLE inspiration_boards')
    raw.exec('PRAGMA user_version = 4')
    raw.prepare("INSERT INTO projects (name) VALUES ('M3-2 老项目')").run()
    raw.close()

    const db = openDb(dbFile)
    expect(version(db)).toBe(LATEST_VERSION)
    expect(columns(db, 'inspirations')).toContain('starred')
    expect(db.prepare('SELECT COUNT(*) c FROM projects').get()).toEqual({ c: 1 })
    db.close()
  })

  it('删除画板时灵感保留，只解除归属', () => {
    const db = openDb(dbFile)
    db.prepare("INSERT INTO inspiration_boards (name) VALUES ('配色')").run()
    const bid = (db.prepare('SELECT id FROM inspiration_boards').get() as { id: number }).id
    db.prepare("INSERT INTO inspirations (board_id, text) VALUES (?, '一条灵感')").run(bid)

    db.prepare('DELETE FROM inspiration_boards WHERE id = ?').run(bid)
    const row = db.prepare('SELECT text, board_id FROM inspirations').get() as
      { text: string; board_id: number | null }
    expect(row.text).toBe('一条灵感')
    expect(row.board_id).toBeNull()
    db.close()
  })

  it('starred 默认 0、tags 默认空数组文本', () => {
    const db = openDb(dbFile)
    db.prepare("INSERT INTO inspirations (text) VALUES ('x')").run()
    const row = db.prepare('SELECT starred, tags, image_path, source_url FROM inspirations').get() as
      { starred: number; tags: string; image_path: string | null; source_url: string | null }
    expect(row).toEqual({ starred: 0, tags: '[]', image_path: null, source_url: null })
    db.close()
  })
})

describe('健身模块迁移 v6', () => {
  it('新库含三张健身表', () => {
    const db = openDb(dbFile)
    expect(version(db)).toBe(LATEST_VERSION)
    expect(columns(db, 'workout_plans')).toEqual(['id', 'name', 'schedule', 'created_at', 'updated_at'])
    expect(columns(db, 'workout_logs')).toContain('plan_id')
    expect(columns(db, 'workout_logs')).toContain('content')
    expect(columns(db, 'body_metrics')).toContain('weight')
    expect(columns(db, 'body_metrics')).toContain('body_fat')
    db.close()
  })

  it('v5 老库能平滑升级到 v6 且灵感数据保留', () => {
    const raw = openDb(dbFile)
    raw.exec('DROP TABLE body_metrics')
    raw.exec('DROP TABLE workout_logs')
    raw.exec('DROP TABLE workout_plans')
    raw.exec('PRAGMA user_version = 5')
    raw.prepare("INSERT INTO inspirations (text) VALUES ('M3-3 老灵感')").run()
    raw.close()

    const db = openDb(dbFile)
    expect(version(db)).toBe(LATEST_VERSION)
    expect(columns(db, 'workout_plans')).toContain('schedule')
    expect(db.prepare('SELECT COUNT(*) c FROM inspirations').get()).toEqual({ c: 1 })
    db.close()
  })

  it('删除训练计划时打卡记录保留，只解除关联', () => {
    const db = openDb(dbFile)
    db.prepare("INSERT INTO workout_plans (name) VALUES ('推拉腿')").run()
    const pid = (db.prepare('SELECT id FROM workout_plans').get() as { id: number }).id
    db.prepare("INSERT INTO workout_logs (plan_id, date, content) VALUES (?, '2026-10-09', '[]')").run(pid)

    db.prepare('DELETE FROM workout_plans WHERE id = ?').run(pid)
    const row = db.prepare('SELECT date, plan_id FROM workout_logs').get() as
      { date: string; plan_id: number | null }
    expect(row.date).toBe('2026-10-09')
    expect(row.plan_id).toBeNull()
    db.close()
  })

  it('身体数据每天只允许一条（date 唯一）', () => {
    const db = openDb(dbFile)
    db.prepare("INSERT INTO body_metrics (date, weight) VALUES ('2026-10-09', 70.5)").run()
    expect(() => db.prepare("INSERT INTO body_metrics (date, weight) VALUES ('2026-10-09', 71)").run()).toThrow()
    db.close()
  })

  it('schedule 与 content 默认值正确', () => {
    const db = openDb(dbFile)
    db.prepare("INSERT INTO workout_plans (name) VALUES ('P')").run()
    expect(db.prepare('SELECT schedule FROM workout_plans').get()).toEqual({ schedule: '{}' })
    const pid = (db.prepare('SELECT id FROM workout_plans').get() as { id: number }).id
    db.prepare("INSERT INTO workout_logs (plan_id, date) VALUES (?, '2026-10-09')").run(pid)
    expect(db.prepare('SELECT content FROM workout_logs').get()).toEqual({ content: '[]' })
    db.close()
  })
})
