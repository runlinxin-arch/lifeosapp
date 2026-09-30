import type { DatabaseSync } from 'node:sqlite'
import type { Priority, Task } from '@shared/types'

export interface TaskInput {
  title: string
  priority?: Priority
  date: string
}

export type TaskPatch = Partial<Pick<Task, 'title' | 'done' | 'priority'>>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToTask = (r: any): Task => ({ ...r, done: !!r.done })

export function listTasksByDate(db: DatabaseSync, date: string): Task[] {
  return db.prepare(`
    SELECT * FROM tasks WHERE date = ?
    ORDER BY done ASC,
      CASE priority WHEN 'high' THEN 0 WHEN 'mid' THEN 1 ELSE 2 END,
      id ASC
  `).all(date).map(rowToTask)
}

export function createTask(db: DatabaseSync, input: TaskInput): Task {
  const info = db.prepare(
    'INSERT INTO tasks (title, priority, date) VALUES (?, ?, ?)'
  ).run(input.title, input.priority ?? 'mid', input.date)
  return getTask(db, Number(info.lastInsertRowid))!
}

export function getTask(db: DatabaseSync, id: number): Task | null {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
  return row ? rowToTask(row) : null
}

export function updateTask(db: DatabaseSync, id: number, patch: TaskPatch): Task {
  const cur = getTask(db, id)
  if (!cur) throw new Error(`task ${id} not found`)
  const title = patch.title ?? cur.title
  const priority = patch.priority ?? cur.priority
  const done = patch.done ?? cur.done
  const flag = done ? 1 : 0
  // done_at 统一走 SQLite 本地时间（与 created_at / updated_at 同格式），
  // 已完成的保留首次完成时间，取消勾选则清空
  db.prepare(`
    UPDATE tasks SET title=?, priority=?, done=?,
      done_at = CASE WHEN ? = 1 THEN COALESCE(done_at, datetime('now','localtime')) ELSE NULL END,
      updated_at = datetime('now','localtime')
    WHERE id=?
  `).run(title, priority, flag, flag, id)
  return getTask(db, id)!
}

export function deleteTask(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
}
