import type { Occurrence } from './types'
import { parseLocal } from './dates'

export interface ReminderHit {
  key: string
  eventId: number
  title: string
  startAt: string
}

/** 提前量为空或非法时的兜底分钟数 */
export const FALLBACK_LEAD_MINUTES = 15

export function reminderKey(o: Occurrence): string {
  return `${o.eventId}@${o.date}`
}

/**
 * 命中条件：start - lead <= now < start，且该次发生尚未提醒过。
 * 应用在窗口期内启动会立刻补发；已经开始的事件不再打扰。
 * 提前量 lead 为 0 时窗口为空，视为关闭该次提醒（永不触发）。
 */
export function dueReminders(
  now: Date,
  occurrences: Occurrence[],
  fired: ReadonlySet<string>
): ReminderHit[] {
  const t = now.getTime()
  const hits: ReminderHit[] = []
  for (const o of occurrences) {
    const key = reminderKey(o)
    if (fired.has(key)) continue
    const start = parseLocal(o.startAt).getTime()
    const lead = Number.isFinite(o.remindMinutes) ? o.remindMinutes : FALLBACK_LEAD_MINUTES
    if (t >= start - lead * 60000 && t < start) {
      hits.push({ key, eventId: o.eventId, title: o.title, startAt: o.startAt })
    }
  }
  return hits.sort((a, b) => a.startAt.localeCompare(b.startAt) || a.eventId - b.eventId)
}
