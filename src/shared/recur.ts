import type { Event, Occurrence } from './types'
import { addDays, addMonthsClamped, datePart, diffDays, monthIndex, timePart } from './dates'

function occurrenceOf(ev: Event, date: string): Occurrence {
  return {
    eventId: ev.id,
    title: ev.title,
    date,
    startAt: `${date} ${timePart(ev.start_at)}`,
    endAt: `${date} ${timePart(ev.end_at)}`,
    allDay: ev.all_day,
    location: ev.location,
    note: ev.note,
    remindMinutes: ev.remind_minutes
  }
}

/** 单个事件在 [from, to]（含端点）内的所有发生项 */
export function expandEvent(ev: Event, from: string, to: string): Occurrence[] {
  const first = datePart(ev.start_at)
  const stop = ev.repeat_until && ev.repeat_until < to ? ev.repeat_until : to
  if (stop < from) return []

  if (ev.repeat_type === 'none') {
    return first >= from && first <= stop ? [occurrenceOf(ev, first)] : []
  }

  const interval = Math.max(1, ev.repeat_interval)
  const out: Occurrence[] = []

  if (ev.repeat_type === 'monthly') {
    const startMonth = monthIndex(first)
    const fromMonth = monthIndex(from)
    let k = fromMonth > startMonth ? Math.ceil((fromMonth - startMonth) / interval) : 0
    for (;;) {
      const d = addMonthsClamped(first, k * interval)
      if (d > stop) break
      if (d >= first && d >= from) out.push(occurrenceOf(ev, d))
      k++
    }
    return out
  }

  const stepDays = ev.repeat_type === 'weekly' ? interval * 7 : interval
  let d = first
  if (d < from) d = addDays(first, Math.ceil(diffDays(from, first) / stepDays) * stepDays)
  while (d <= stop) {
    out.push(occurrenceOf(ev, d))
    d = addDays(d, stepDays)
  }
  return out
}

/** 多事件展开并按开始时间排序 */
export function expandEvents(events: Event[], from: string, to: string): Occurrence[] {
  const out: Occurrence[] = []
  for (const ev of events) out.push(...expandEvent(ev, from, to))
  return out.sort((a, b) => a.startAt.localeCompare(b.startAt) || a.eventId - b.eventId)
}

/** 同一事件的同一天只算一次，用于提醒去重与待办同步 */
export function occurrenceKey(o: Occurrence): string {
  return `${o.eventId}@${o.date}`
}
