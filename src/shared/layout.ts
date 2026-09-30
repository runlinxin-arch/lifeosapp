import type { Occurrence } from './types'
import { addDays, timeToMinutes } from './dates'

/** 周一为一周之始 */
export function weekStart(dateStr: string): string {
  const dow = new Date(dateStr + 'T00:00:00').getDay() // 0 = 周日
  return addDays(dateStr, -(dow === 0 ? 6 : dow - 1))
}

/** 该日期所在周的 7 天（周一 → 周日） */
export function weekDays(anchor: string): string[] {
  const from = weekStart(anchor)
  return Array.from({ length: 7 }, (_, i) => addDays(from, i))
}

/** 固定 42 格（6 周 × 7 天），首格为当月 1 号所在周的周一 */
export function monthMatrix(anchor: string): string[] {
  const first = `${anchor.slice(0, 7)}-01`
  const start = weekStart(first)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

export interface WeekBlock {
  occurrence: Occurrence
  dayIndex: number
  topPct: number
  heightPct: number
  lane: number
  laneCount: number
}

export interface WeekLayout {
  days: string[]
  allDay: Occurrence[]
  blocks: WeekBlock[]
}

/** 一天的分钟数，用于把时间换算成纵向百分比 */
const MINUTES_PER_DAY = 1440
/** 时间倒挂或零时长事件的兜底时长（分钟） */
const FALLBACK_DURATION = 30

export function layoutWeek(occurrences: Occurrence[], anchor: string, minHeightPct = 2): WeekLayout {
  const days = weekDays(anchor)
  const index = new Map(days.map((d, i) => [d, i]))

  const inWeek = occurrences.filter((o) => index.has(o.date))
  const allDay = inWeek.filter((o) => o.allDay)
  const timed = inWeek.filter((o) => !o.allDay)

  const byDay = new Map<number, Occurrence[]>()
  for (const o of timed) {
    const i = index.get(o.date)!
    const list = byDay.get(i) ?? []
    list.push(o)
    byDay.set(i, list)
  }

  const blocks: WeekBlock[] = []
  for (const [dayIndex, list] of byDay) {
    const sorted = [...list].sort((a, b) => a.startAt.localeCompare(b.startAt))
    const laneEnds: number[] = []
    const placed = sorted.map((o) => {
      const start = timeToMinutes(o.startAt.slice(11))
      let end = timeToMinutes(o.endAt.slice(11))
      if (end <= start) end = start + FALLBACK_DURATION
      let lane = laneEnds.findIndex((e) => e <= start)
      if (lane === -1) {
        lane = laneEnds.length
        laneEnds.push(0)
      }
      laneEnds[lane] = end
      return { o, start, end, lane }
    })
    const laneCount = laneEnds.length
    for (const p of placed) {
      blocks.push({
        occurrence: p.o,
        dayIndex,
        topPct: (p.start / MINUTES_PER_DAY) * 100,
        heightPct: Math.max(((p.end - p.start) / MINUTES_PER_DAY) * 100, minHeightPct),
        lane: p.lane,
        laneCount
      })
    }
  }

  return { days, allDay, blocks }
}

export interface MonthCell {
  date: string
  inMonth: boolean
  items: Occurrence[]
  extra: number
}
/** 拖拽落点 → 小时（0–23）。非法输入回退到上班时间的默认小时 */
export function hourFromOffsetY(offsetY: number, hourHeight: number, fallbackHour = 9): number {
  if (!Number.isFinite(offsetY) || !Number.isFinite(hourHeight) || hourHeight <= 0) return fallbackHour
  return Math.max(0, Math.min(23, Math.floor(offsetY / hourHeight)))
}export function layoutMonth(occurrences: Occurrence[], anchor: string, maxPerDay = 3): MonthCell[] {
  const month = anchor.slice(0, 7)
  const byDate = new Map<string, Occurrence[]>()
  for (const o of occurrences) {
    const list = byDate.get(o.date) ?? []
    list.push(o)
    byDate.set(o.date, list)
  }
  return monthMatrix(anchor).map((date) => {
    const all = (byDate.get(date) ?? []).sort((a, b) => a.startAt.localeCompare(b.startAt))
    return {
      date,
      inMonth: date.slice(0, 7) === month,
      items: all.slice(0, maxPerDay),
      extra: Math.max(0, all.length - maxPerDay)
    }
  })
}
