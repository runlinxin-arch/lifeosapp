import type { Media, MediaStatus, MediaType, Play, WishItem } from './types'
import { MEDIA_STATUSES, MEDIA_TYPES, PRIORITY_ORDER } from './entContent'

/**
 * 游戏娱乐聚合纯函数：口径只在这里实现一次，界面只做展示。
 */

/** 单个游戏的聚合结果 */
export interface GameSummary {
  game: string
  totalMinutes: number
  sessions: number
  /** 最近一次游玩日期 */
  lastDate: string
}

/**
 * 按游戏汇总：总时长 / 次数 / 最近游玩。
 * 分组用去空白后的原始名称（**大小写敏感**，不隐式合并用户输入）；
 * 排序：总时长降序，同则游戏名升序。
 */
export function gameSummaries(plays: Play[]): GameSummary[] {
  const map = new Map<string, GameSummary>()
  for (const p of plays) {
    const game = String(p.game ?? '').trim()
    if (!game) continue
    const cur = map.get(game)
    if (cur) {
      cur.totalMinutes += p.minutes
      cur.sessions += 1
      if (p.date > cur.lastDate) cur.lastDate = p.date
    } else {
      map.set(game, { game, totalMinutes: p.minutes, sessions: 1, lastDate: p.date })
    }
  }
  return [...map.values()].sort(
    (a, b) => b.totalMinutes - a.totalMinutes || a.game.localeCompare(b.game)
  )
}

/** 区间内的总游玩分钟数（含端点）；不传区间统计全部 */
export function totalMinutes(plays: Play[], from?: string, to?: string): number {
  return plays
    .filter((p) => (from && to ? p.date >= from && p.date <= to : true))
    .reduce((sum, p) => sum + p.minutes, 0)
}

/** 最近 n 条游玩记录（日期倒序，同日按 id 倒序） */
export function recentPlays(plays: Play[], n: number): Play[] {
  if (!Number.isFinite(n) || n <= 0) return []
  return [...plays]
    .sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1))
    .slice(0, Math.floor(n))
}

/** 愿望单排序：高优先级在前，同级按 id 升序；不修改入参 */
export function sortWishlist(items: WishItem[]): WishItem[] {
  return [...items].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1) || a.id - b.id
  )
}

/** 按状态分组；总是返回三个键，组内保持传入顺序 */
export function mediaGroups(media: Media[]): Record<MediaStatus, Media[]> {
  const out = {} as Record<MediaStatus, Media[]>
  for (const s of MEDIA_STATUSES) out[s] = media.filter((m) => m.status === s)
  return out
}

/** 按类型分组；总是返回三个键 */
export function mediaByType(media: Media[]): Record<MediaType, Media[]> {
  const out = {} as Record<MediaType, Media[]>
  for (const t of MEDIA_TYPES) out[t] = media.filter((m) => m.type === t)
  return out
}
