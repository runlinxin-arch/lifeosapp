import type { DatabaseSync } from 'node:sqlite'
import type { Event, Occurrence, RepeatType } from '@shared/types'
import { createEvent, listOccurrences } from './events'
import { getTask } from './tasks'

export interface ConvertInput {
  startAt: string
  endAt: string
  location?: string | null
  note?: string | null
  remindMinutes?: number
  repeatType?: RepeatType
  repeatInterval?: number
  repeatUntil?: string | null
}

interface EventTaskRow {
  id: number
  source_id: number | null
  title: string
}

/**
 * 把 date 当天的日程发生项同步为待办行：
 * 新增缺失、标题跟随事件、保留 done、清理来源已不在当天的行。整体一个事务。
 */
export function syncEventTasks(db: DatabaseSync, date: string): void {
  const wanted = new Map<number, Occurrence>()
  for (const o of listOccurrences(db, date, date)) wanted.set(o.eventId, o)

  db.exec('BEGIN')
  try {
    const rows = db.prepare(
      "SELECT id, source_id, title FROM tasks WHERE date = ? AND source_module = 'event'"
    ).all(date) as unknown as EventTaskRow[]

    // 1) 来源事件已不在当天的行 → 删除
    for (const r of rows) {
      if (r.source_id === null || !wanted.has(r.source_id)) {
        db.prepare('DELETE FROM tasks WHERE id = ?').run(r.id)
      }
    }

    const live = new Map<number, EventTaskRow>()
    for (const r of rows) {
      if (r.source_id !== null && wanted.has(r.source_id)) live.set(r.source_id, r)
    }

    // 2) 缺失的新增；标题跟随事件（done / priority / date 不动）
    for (const [eventId, o] of wanted) {
      const existing = live.get(eventId)
      if (!existing) {
        db.prepare(`
          INSERT INTO tasks (title, priority, date, source_module, source_id)
          VALUES (?, 'mid', ?, 'event', ?)
        `).run(o.title, date, eventId)
      } else if (existing.title !== o.title) {
        db.prepare("UPDATE tasks SET title = ?, updated_at = datetime('now','localtime') WHERE id = ?")
          .run(o.title, existing.id)
      }
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

/** 待办转日程：同一事务内创建事件并删除原待办 */
export function convertTaskToEvent(db: DatabaseSync, taskId: number, input: ConvertInput): Event {
  const task = getTask(db, taskId)
  if (!task) throw new Error(`task ${taskId} not found`)
  if (task.source_module === 'event') throw new Error('该待办已经来自日程，不能再次转换')

  db.exec('BEGIN')
  try {
    const ev = createEvent(db, {
      title: task.title,
      startAt: input.startAt,
      endAt: input.endAt,
      location: input.location ?? null,
      note: input.note ?? null,
      remindMinutes: input.remindMinutes ?? 15,
      repeatType: input.repeatType ?? 'none',
      repeatInterval: input.repeatInterval ?? 1,
      repeatUntil: input.repeatUntil ?? null
    })
    db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId)
    db.exec('COMMIT')
    return ev
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}
