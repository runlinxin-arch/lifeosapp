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
