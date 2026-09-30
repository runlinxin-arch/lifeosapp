import type { LongTask } from '@shared/types'
import { diffDays } from './dates'

/** 色块高度：紧凑 / 展开两态 */
export const TIMELINE_BAR_H = { compact: 8, expanded: 14 } as const
/** 泳道之间的间距 */
export const TIMELINE_ROW_GAP = 4
/** 轴区上方刻度文字预留 */
export const TIMELINE_TOP_PAD = 14
/** 轴区下方留白 */
export const TIMELINE_BOTTOM_PAD = 6
/** 标题栏最小高度（与 AppShell 的 min-h 保持一致） */
export const TIMELINE_MIN_H = 40
/** 色块区最大高度：超出后内部滚动，避免时间轴无限吃掉主内容区 */
export const TIMELINE_GRID_MAX_H = 140

export function timelineBarHeight(expanded: boolean): number {
  return expanded ? TIMELINE_BAR_H.expanded : TIMELINE_BAR_H.compact
}

/** 色块区实际高度（含封顶），非法泳道数按 1 条处理 */
export function timelineGridHeight(expanded: boolean, laneCount: number): number {
  const rows = Number.isFinite(laneCount) ? Math.max(1, Math.floor(laneCount)) : 1
  const needed = rows * (timelineBarHeight(expanded) + TIMELINE_ROW_GAP) + TIMELINE_BOTTOM_PAD
  return Math.min(needed, TIMELINE_GRID_MAX_H)
}

/** 标题栏总高度：随泳道数增长，且不小于 TIMELINE_MIN_H、不超过封顶值 */
export function timelineHeight(expanded: boolean, laneCount: number): number {
  const needed = TIMELINE_TOP_PAD + timelineGridHeight(expanded, laneCount) + TIMELINE_BOTTOM_PAD
  return Math.max(TIMELINE_MIN_H, needed)
}

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
