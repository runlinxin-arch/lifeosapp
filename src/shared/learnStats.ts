import type { LearnSession } from './types'
import { addDays } from './dates'
import { weekDays } from './layout'

/** 含端点的时长合计 */
export function sumMinutes(sessions: LearnSession[], from: string, to: string): number {
  let total = 0
  for (const s of sessions) if (s.date >= from && s.date <= to) total += s.minutes
  return total
}

/** 按给定日期序列汇总（缺失记 0，顺序与入参一致，可直接喂柱状图） */
export function dailyMinutes(sessions: LearnSession[], days: string[]): { date: string; minutes: number }[] {
  const byDate = new Map<string, number>()
  for (const s of sessions) byDate.set(s.date, (byDate.get(s.date) ?? 0) + s.minutes)
  return days.map((date) => ({ date, minutes: byDate.get(date) ?? 0 }))
}

/**
 * 连续学习天数：
 * 今天有记录 → 从今天往前连数；今天没有但昨天有 → 从昨天往前连数（连续尚未中断）；否则 0
 */
export function streakDays(sessions: LearnSession[], today: string): number {
  const days = new Set(sessions.map((s) => s.date))
  if (days.size === 0) return 0
  let cursor = days.has(today) ? today : addDays(today, -1)
  if (!days.has(cursor)) return 0
  let count = 0
  while (days.has(cursor)) {
    count++
    cursor = addDays(cursor, -1)
  }
  return count
}

/** 本周（周一~周日）合计时长 */
export function weekMinutes(sessions: LearnSession[], today: string): number {
  const days = weekDays(today)
  return sumMinutes(sessions, days[0], days[6])
}
