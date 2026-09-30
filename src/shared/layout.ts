import { addDays } from './dates'

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
