import type { DatabaseSync } from 'node:sqlite'
import type { Event, EventInput, EventPatch, Occurrence } from '@shared/types'
import { expandEvents } from '@shared/recur'
import { datePart } from '@shared/dates'
import { assertNonEmpty } from './validate'

export type { EventInput, EventPatch } from '@shared/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToEvent = (r: any): Event => ({ ...r, all_day: !!r.all_day })

function assertValid(input: EventInput): void {
  assertNonEmpty(input.title, '事件标题')
  if (input.endAt < input.startAt) throw new Error('结束时间不能早于开始时间')
  const interval = input.repeatInterval ?? 1
  if (!Number.isInteger(interval) || interval < 1) throw new Error('重复间隔必须是不小于 1 的整数')
  if (input.repeatUntil && input.repeatUntil < datePart(input.startAt)) {
    throw new Error('重复截止日期不能早于事件起始日')
  }
}

export function getEvent(db: DatabaseSync, id: number): Event | null {
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(id)
  return row ? rowToEvent(row) : null
}

/** 与 [from, to] 有交集的事件行；重复事件即使起始日早于 from 也会返回 */
export function listEvents(db: DatabaseSync, from: string, to: string): Event[] {
  return db.prepare(`
    SELECT * FROM events
    WHERE date(start_at) <= ?
      AND (repeat_type <> 'none' OR date(end_at) >= ?)
      AND (repeat_until IS NULL OR repeat_until >= ?)
    ORDER BY start_at ASC, id ASC
  `).all(to, from, from).map(rowToEvent)
}

export function createEvent(db: DatabaseSync, input: EventInput): Event {
  assertValid(input)
  const info = db.prepare(`
    INSERT INTO events (title, start_at, end_at, all_day, location, note,
                        repeat_type, repeat_interval, repeat_until, remind_minutes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.title.trim(),
    input.startAt,
    input.endAt,
    input.allDay ? 1 : 0,
    input.location ?? null,
    input.note ?? null,
    input.repeatType ?? 'none',
    input.repeatInterval ?? 1,
    input.repeatUntil ?? null,
    input.remindMinutes ?? 15
  )
  return getEvent(db, Number(info.lastInsertRowid))!
}

export function updateEvent(db: DatabaseSync, id: number, patch: EventPatch): Event {
  const cur = getEvent(db, id)
  if (!cur) throw new Error(`event ${id} not found`)
  const merged: EventInput = {
    title: patch.title ?? cur.title,
    startAt: patch.startAt ?? cur.start_at,
    endAt: patch.endAt ?? cur.end_at,
    allDay: patch.allDay ?? cur.all_day,
    location: patch.location !== undefined ? patch.location : cur.location,
    note: patch.note !== undefined ? patch.note : cur.note,
    repeatType: patch.repeatType ?? cur.repeat_type,
    repeatInterval: patch.repeatInterval ?? cur.repeat_interval,
    repeatUntil: patch.repeatUntil !== undefined ? patch.repeatUntil : cur.repeat_until,
    remindMinutes: patch.remindMinutes ?? cur.remind_minutes
  }
  assertValid(merged)
  db.prepare(`
    UPDATE events SET title=?, start_at=?, end_at=?, all_day=?, location=?, note=?,
      repeat_type=?, repeat_interval=?, repeat_until=?, remind_minutes=?,
      updated_at=datetime('now','localtime')
    WHERE id=?
  `).run(
    merged.title.trim(),
    merged.startAt,
    merged.endAt,
    merged.allDay ? 1 : 0,
    merged.location ?? null,
    merged.note ?? null,
    merged.repeatType ?? 'none',
    merged.repeatInterval ?? 1,
    merged.repeatUntil ?? null,
    merged.remindMinutes ?? 15,
    id
  )
  return getEvent(db, id)!
}

export function deleteEvent(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM events WHERE id = ?').run(id)
}

/** 区间内的所有发生项（重复事件已展开、已排序） */
export function listOccurrences(db: DatabaseSync, from: string, to: string): Occurrence[] {
  return expandEvents(listEvents(db, from, to), from, to)
}
