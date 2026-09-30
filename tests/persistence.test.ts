import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openDb, ensureDataDir } from '../src/main/db'
import { createTask, listTasksByDate, updateTask } from '../src/main/db/tasks'
import { createLongTask, listRange } from '../src/main/db/longTasks'

/**
 * M1 验收 8.1 的自动化版本：
 * "新增待办 + 长期任务 → 关闭重开 → 数据完整"。
 * 这里用「关闭连接后重新打开同一文件」模拟应用重启（数据目录布局与真实运行一致）。
 */

let dir: string
let dbFile: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lifeos-persist-'))
  dbFile = path.join(dir, 'app.db')
})
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

describe('ensureDataDir（数据目录布局）', () => {
  it('创建 app.db 所在目录与 images/ backups/ 子目录', () => {
    ensureDataDir(dir)
    expect(fs.existsSync(dir)).toBe(true)
    expect(fs.existsSync(path.join(dir, 'images'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'backups'))).toBe(true)
  })

  it('重复调用不报错', () => {
    ensureDataDir(dir)
    expect(() => ensureDataDir(dir)).not.toThrow()
  })

  it('目录已存在时保留原有内容', () => {
    ensureDataDir(dir)
    const marker = path.join(dir, 'images', 'keep.txt')
    fs.writeFileSync(marker, 'x')
    ensureDataDir(dir)
    expect(fs.existsSync(marker)).toBe(true)
  })
})

describe('重开数据库后数据完整（M1 8.1 核心验收）', () => {
  it('待办与长期任务在关闭重开后完整存在', () => {
    // 第一次「运行」：写入数据后关闭
    const first = openDb(dbFile)
    const task = createTask(first, { title: '买咖啡豆', priority: 'high', date: '2026-09-30' })
    updateTask(first, task.id, { done: true })
    createLongTask(first, { title: '备考雅思', startDate: '2026-10-01', endDate: '2026-12-01' })
    createLongTask(first, { title: '独立任务', startDate: '2026-10-01', endDate: '2026-11-01' })
    first.close()

    // 第二次「运行」：重新打开同一文件
    const second = openDb(dbFile)
    const tasks = listTasksByDate(second, '2026-09-30')
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({ title: '买咖啡豆', priority: 'high', done: true })
    expect(tasks[0].done_at).toBeTruthy()

    const longs = listRange(second, '2026-01-01', '2027-01-01')
    expect(longs.map((t) => t.title).sort()).toEqual(['备考雅思', '独立任务'])
    expect(longs.every((t) => t.done === false)).toBe(true)
    second.close()
  })

  it('未完成/已完成的勾选状态跨重开保持', () => {
    const first = openDb(dbFile)
    const a = createTask(first, { title: '已完成', date: '2026-09-30' })
    createTask(first, { title: '未完成', date: '2026-09-30' })
    updateTask(first, a.id, { done: true })
    first.close()

    const second = openDb(dbFile)
    const byTitle = new Map(listTasksByDate(second, '2026-09-30').map((t) => [t.title, t]))
    expect(byTitle.get('已完成')!.done).toBe(true)
    expect(byTitle.get('未完成')!.done).toBe(false)
    second.close()
  })

  it('优先级排序在重开后依然生效', () => {
    const first = openDb(dbFile)
    createTask(first, { title: '低', priority: 'low', date: '2026-09-30' })
    createTask(first, { title: '高', priority: 'high', date: '2026-09-30' })
    createTask(first, { title: '中', priority: 'mid', date: '2026-09-30' })
    first.close()

    const second = openDb(dbFile)
    expect(listTasksByDate(second, '2026-09-30').map((t) => t.title)).toEqual(['高', '中', '低'])
    second.close()
  })

  it('长期任务的来源标记与颜色跨重开保持', () => {
    const first = openDb(dbFile)
    createLongTask(first, { title: '独立', startDate: '2026-10-01', endDate: '2026-11-01', color: '#4ade80' })
    first.close()

    const second = openDb(dbFile)
    const t = listRange(second, '2026-10-01', '2026-10-01')[0]
    expect(t).toMatchObject({ title: '独立', color: '#4ade80', source_module: null, source_id: null })
    second.close()
  })

  it('多次重开不会重复执行迁移或丢数据', () => {
    for (let i = 0; i < 3; i++) {
      const db = openDb(dbFile)
      if (i === 0) createTask(db, { title: '只写一次', date: '2026-09-30' })
      expect(listTasksByDate(db, '2026-09-30')).toHaveLength(1)
      expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(2)
      db.close()
    }
  })

  it('数据库文件落在传入路径上（对应 %APPDATA%\\LifeOS\\app.db）', () => {
    const db = openDb(dbFile)
    createTask(db, { title: 'x', date: '2026-09-30' })
    db.close()
    expect(fs.existsSync(dbFile)).toBe(true)
    expect(path.basename(dbFile)).toBe('app.db')
    expect(fs.statSync(dbFile).size).toBeGreaterThan(0)
  })
})
