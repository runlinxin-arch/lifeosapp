import type { WorkoutItem } from './types'
import { addDays } from './dates'

/** ISO 星期：1=周一 … 7=周日（JS 的 getDay 里 0 是周日） */
export function isoWeekday(date: string): number {
  const d = new Date(`${date}T00:00:00`).getDay()
  return d === 0 ? 7 : d
}

/** 某天该练什么；没有安排返回 null */
export function planForDate(schedule: Record<string, string>, date: string): string | null {
  const v = schedule[String(isoWeekday(date))]
  return v && v.trim() ? v : null
}

/** 单个动作的容量 = 重量 × 组数 × 次数（自重动作 weight=0 → 容量 0，但仍算练了） */
export function itemVolume(item: WorkoutItem): number {
  return item.weight * item.sets * item.reps
}

interface DatedLog {
  date: string
  content?: WorkoutItem[]
}

const inRange = (date: string, from: string, to: string): boolean => date >= from && date <= to

/** 区间内（含端点）总容量 */
export function totalVolume(logs: DatedLog[], from: string, to: string): number {
  let sum = 0
  for (const log of logs) {
    if (!inRange(log.date, from, to)) continue
    for (const item of log.content ?? []) sum += itemVolume(item)
  }
  return sum
}

/** 区间内（含端点）训练次数——按打卡记录条数计 */
export function workoutCount(logs: { date: string }[], from: string, to: string): number {
  let n = 0
  for (const log of logs) if (inRange(log.date, from, to)) n++
  return n
}

/**
 * 连续打卡天数：今天有则从今天往前连数；
 * 今天没有但昨天有则从昨天往前（连续尚未中断）；否则 0。
 * 与 learnStats.streakDays 同语义。
 */
export function workoutStreak(logs: { date: string }[], today: string): number {
  const days = new Set(logs.map((l) => l.date))
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

export interface SvgPoint { x: number; y: number }

/**
 * 把数值序列映射到 SVG 坐标。
 * - 空数组 → []
 * - 单点 → x 居中
 * - 所有值相同 → 全部落在垂直中点（避免除零）
 * - x 按下标均匀分布；y 反向映射（SVG 的 y 向下，值越大 y 越小）
 * - 结果夹在 [pad, width-pad] × [pad, height-pad]
 */
export function toSvgPoints(
  points: { date: string; value: number }[],
  width: number,
  height: number,
  pad = 0
): SvgPoint[] {
  if (points.length === 0) return []

  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min

  const innerW = Math.max(0, width - pad * 2)
  const innerH = Math.max(0, height - pad * 2)

  return points.map((p, i) => {
    const x = points.length === 1
      ? width / 2
      : pad + (innerW * i) / (points.length - 1)

    // 值域退化为一个点（或只有一个数据点）时落在垂直中点
    const ratio = span === 0 ? 0.5 : (p.value - min) / span
    const y = pad + innerH * (1 - ratio)

    return {
      x: Math.max(pad, Math.min(width - pad, x)),
      y: Math.max(pad, Math.min(height - pad, y))
    }
  })
}

const round1 = (n: number): number => Math.round(n * 10) / 10

/** SVG 折线路径；坐标保留一位小数 */
export function linePath(pts: SvgPoint[]): string {
  if (pts.length === 0) return ''
  const head = `M ${round1(pts[0].x)} ${round1(pts[0].y)}`
  if (pts.length === 1) return head
  return head + pts.slice(1).map((p) => ` L ${round1(p.x)} ${round1(p.y)}`).join('')
}

/** 取日期最大的一条记录 */
export function latestMetric<T extends { date: string }>(rows: T[]): T | null {
  if (rows.length === 0) return null
  let best = rows[0]
  for (const r of rows) if (r.date > best.date) best = r
  return best
}
