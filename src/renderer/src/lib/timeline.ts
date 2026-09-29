import type { LongTask } from '@shared/types'
import { diffDays } from './dates'

export interface TimelineBlock {
  id: number
  title: string
  color: string
  leftPct: number
  widthPct: number
  lane: number
}

export function calcBlocks(tasks: LongTask[], from: string, to: string): TimelineBlock[] {
  const total = diffDays(to, from) + 1
  const sorted = [...tasks].sort((a, b) => a.start_date.localeCompare(b.start_date))
  const laneEnds: string[] = []
  return sorted.map((t) => {
    const s = t.start_date < from ? from : t.start_date
    const e = t.end_date > to ? to : t.end_date
    let lane = laneEnds.findIndex((end) => end < s)
    if (lane === -1) { lane = laneEnds.length; laneEnds.push('') }
    laneEnds[lane] = t.end_date
    return {
      id: t.id,
      title: t.title,
      color: t.color,
      leftPct: (diffDays(s, from) / total) * 100,
      widthPct: ((diffDays(e, s) + 1) / total) * 100,
      lane
    }
  }).filter((b) => b.widthPct > 0)
}
