import { describe, it, expect, beforeEach } from 'vitest'
import { openDb } from '../src/main/db'
import { listTasksByDate, createTask, updateTask, deleteTask } from '../src/main/db/tasks'

let db: ReturnType<typeof openDb>
beforeEach(() => { db = openDb(':memory:') })

describe('tasks', () => {
  it('creates and lists by date, un-done first, priority ordered', () => {
    createTask(db, { title: '低', priority: 'low', date: '2026-09-29' })
    createTask(db, { title: '高', priority: 'high', date: '2026-09-29' })
    createTask(db, { title: '默认', date: '2026-09-29' })
    const t = createTask(db, { title: '完成', priority: 'high', date: '2026-09-29' })
    updateTask(db, t.id, { done: true })
    const list = listTasksByDate(db, '2026-09-29')
    expect(list.map((x) => x.title)).toEqual(['高', '默认', '低', '完成'])
    expect(list[0].done).toBe(false)
    expect(list[3].done_at).toBeTruthy()
  })
  it('updates title and priority', () => {
    const t = createTask(db, { title: 'a', date: '2026-09-29' })
    const u = updateTask(db, t.id, { title: 'b', priority: 'high' })
    expect(u.title).toBe('b')
    expect(u.priority).toBe('high')
  })
  it('deletes', () => {
    const t = createTask(db, { title: 'a', date: '2026-09-29' })
    deleteTask(db, t.id)
    expect(listTasksByDate(db, '2026-09-29')).toHaveLength(0)
  })
  it('does not leak across dates', () => {
    createTask(db, { title: '今天', date: '2026-09-29' })
    expect(listTasksByDate(db, '2026-09-30')).toHaveLength(0)
  })
})

describe('done_at 时间戳一致性（隐患修复回归）', () => {
  it('使用本地时间格式，与表内其他时间戳一致', () => {
    const t = createTask(db, { title: 'a', date: '2026-09-30' })
    const u = updateTask(db, t.id, { done: true })
    expect(u.done_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(u.done_at).not.toContain('T')
    expect(u.done_at).not.toContain('Z')
  })

  it('不会写入 UTC 时间（否则与 created_at 相差 8 小时）', () => {
    const t = createTask(db, { title: 'a', date: '2026-09-30' })
    const u = updateTask(db, t.id, { done: true })
    const createdHour = Number(u.created_at.slice(11, 13))
    const doneHour = Number(u.done_at!.slice(11, 13))
    expect(Math.abs(doneHour - createdHour)).toBeLessThanOrEqual(1)
    expect(u.done_at!.slice(0, 10)).toBe(u.created_at.slice(0, 10))
  })

  it('取消勾选会清空 done_at', () => {
    const t = createTask(db, { title: 'a', date: '2026-09-30' })
    expect(updateTask(db, t.id, { done: true }).done_at).toBeTruthy()
    expect(updateTask(db, t.id, { done: false }).done_at).toBeNull()
  })

  it('重复更新保留首次完成时间', () => {
    const t = createTask(db, { title: 'a', date: '2026-09-30' })
    const first = updateTask(db, t.id, { done: true })
    const second = updateTask(db, t.id, { title: '改名' })
    expect(second.done_at).toBe(first.done_at)
  })
})
