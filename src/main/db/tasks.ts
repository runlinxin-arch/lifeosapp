import type { DatabaseSync } from 'node:sqlite'
import type { Priority, Task, TaskSource } from '@shared/types'
import { assertDateStr, assertNonEmpty } from './validate'

const PRIORITIES: readonly Priority[] = ['low', 'mid', 'high']

function assertPriority(priority: string): void {
  if (!PRIORITIES.includes(priority as Priority)) {
    throw new Error(`优先级只能是 low / mid / high，收到：${priority}`)
  }
}

export interface TaskInput {
  title: string
  priority?: Priority
  date: string
  source_module?: TaskSource | null
  source_id?: number | null
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
  const title = assertNonEmpty(input.title, '待办标题')
  assertDateStr(input.date, '待办日期')
  if (input.priority !== undefined) assertPriority(input.priority)
  const info = db.prepare(
    'INSERT INTO tasks (title, priority, date, source_module, source_id) VALUES (?, ?, ?, ?, ?)'
  ).run(
    title,
    input.priority ?? 'mid',
    input.date,
    input.source_module ?? null,
    input.source_id ?? null
  )
  return getTask(db, Number(info.lastInsertRowid))!
}

export function getTask(db: DatabaseSync, id: number): Task | null {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
  return row ? rowToTask(row) : null
}

export function updateTask(db: DatabaseSync, id: number, patch: TaskPatch): Task {
  const cur = getTask(db, id)
  if (!cur) throw new Error(`task ${id} not found`)
  const title = patch.title !== undefined ? assertNonEmpty(patch.title, '待办标题') : cur.title
  if (patch.priority !== undefined) assertPriority(patch.priority)
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
