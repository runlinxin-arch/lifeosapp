import type { DatabaseSync } from 'node:sqlite'
import type { LongTask, LongTaskPatch, MarkFromSourceInput, ModuleKey } from '@shared/types'
import { MODULE_COLORS } from '@shared/types'
import { diffDays } from '@shared/dates'
import { assertDateRange, assertNonEmpty } from './validate'

export type { LongTaskPatch, MarkFromSourceInput } from '@shared/types'

/** 独立长期任务的默认色（灰） */
export const INDEPENDENT_COLOR = '#8b8d98'
/** PRD 4.9：仅 ≥2 天的长期任务上轴 */
const MIN_DAYS = 2

export interface LongTaskInput {
  title: string
  startDate: string
  endDate: string
  color?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToLongTask = (r: any): LongTask => ({ ...r, done: !!r.done })

function assertSpan(startDate: string, endDate: string): void {
  assertDateRange(startDate, endDate)
  if (diffDays(endDate, startDate) < MIN_DAYS - 1) {
    throw new Error('长期任务至少需要 2 天；当天完成的小事请用今日待办')
  }
}

export function listRange(db: DatabaseSync, from: string, to: string): LongTask[] {
  return db.prepare(`
    SELECT * FROM long_tasks
    WHERE start_date <= ? AND end_date >= ?
    ORDER BY start_date ASC, id ASC
  `).all(to, from).map(rowToLongTask)
}

export function getLongTask(db: DatabaseSync, id: number): LongTask | null {
  const row = db.prepare('SELECT * FROM long_tasks WHERE id = ?').get(id)
  return row ? rowToLongTask(row) : null
}

export function createLongTask(db: DatabaseSync, input: LongTaskInput): LongTask {
  const title = assertNonEmpty(input.title, '长期任务标题')
  assertSpan(input.startDate, input.endDate)
  const info = db.prepare(`
    INSERT INTO long_tasks (title, start_date, end_date, color) VALUES (?, ?, ?, ?)
  `).run(title, input.startDate, input.endDate, input.color ?? INDEPENDENT_COLOR)
  return getLongTask(db, Number(info.lastInsertRowid))!
}

export function updateLongTask(db: DatabaseSync, id: number, patch: LongTaskPatch): LongTask {
  const cur = getLongTask(db, id)
  if (!cur) throw new Error(`long_task ${id} not found`)
  const title = patch.title !== undefined ? assertNonEmpty(patch.title, '长期任务标题') : cur.title
  const start = patch.start_date ?? cur.start_date
  const end = patch.end_date ?? cur.end_date
  assertSpan(start, end)
  db.prepare(`
    UPDATE long_tasks SET title=?, start_date=?, end_date=?, color=?, done=?,
      updated_at=datetime('now','localtime')
    WHERE id=?
  `).run(
    title,
    start,
    end,
    patch.color ?? cur.color,
    (patch.done ?? cur.done) ? 1 : 0,
    id
  )
  return getLongTask(db, id)!
}

export function setLongTaskDone(db: DatabaseSync, id: number, done: boolean): LongTask {
  return updateLongTask(db, id, { done })
}

/** 模块事项标记为长期任务：同来源二次调用是更新，色块颜色取来源模块色 */
export function markFromSource(db: DatabaseSync, input: MarkFromSourceInput): LongTask {
  const title = assertNonEmpty(input.title, '长期任务标题')
  assertSpan(input.startDate, input.endDate)
  const color = MODULE_COLORS[input.sourceModule] ?? INDEPENDENT_COLOR

  const existing = db.prepare(
    'SELECT * FROM long_tasks WHERE source_module = ? AND source_id = ?'
  ).get(input.sourceModule, input.sourceId)

  if (existing) {
    const row = rowToLongTask(existing)
    return updateLongTask(db, row.id, {
      title,
      start_date: input.startDate,
      end_date: input.endDate,
      color
    })
  }

  const info = db.prepare(`
    INSERT INTO long_tasks (title, start_date, end_date, color, source_module, source_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(title, input.startDate, input.endDate, color, input.sourceModule, input.sourceId)
  return getLongTask(db, Number(info.lastInsertRowid))!
}

/** 来源事项被删除时同步清掉色块（M3/M4 模块删除流程调用） */
export function removeBySource(db: DatabaseSync, sourceModule: ModuleKey, sourceId: number): void {
  db.prepare('DELETE FROM long_tasks WHERE source_module = ? AND source_id = ?').run(sourceModule, sourceId)
}

export function deleteLongTask(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM long_tasks WHERE id = ?').run(id)
}
