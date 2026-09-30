import { addDays } from './dates'

export interface TimelineRange {
  from: string
  to: string
}

/**
 * 时间轴可见区间：以"今天"为基准，向前 back 天、向后 rangeDays 天。
 * 纯函数——每次调用都重新计算，避免把范围固化在模块加载时刻。
 */
export function computeTimelineRange(today: string, rangeDays: number, pastDays = 3): TimelineRange {
  const days = Number.isFinite(rangeDays) && rangeDays > 0 ? Math.floor(rangeDays) : 30
  const back = Number.isFinite(pastDays) && pastDays >= 0 ? Math.floor(pastDays) : 3
  return { from: addDays(today, -back), to: addDays(today, days) }
}

/** 距离下一个本地零点还有多少毫秒（用于跨零点自动刷新） */
export function msUntilNextMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0)
  return next.getTime() - now.getTime()
}
