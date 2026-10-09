import type { Media, MediaStatus, MediaType, Play } from './types'
import { MEDIA_STATUSES, MEDIA_TYPES } from './entContent'
import { weekDays } from './layout'

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

// ---------- 游玩记录的统计区间与筛选 ----------

/** 统计区间：本周 / 本月 / 全部 */
export type PlayRange = 'week' | 'month' | 'all'

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** 区间边界（含端点）；全部返回 null 表示不过滤 */
export function playRangeBounds(range: PlayRange, today: string): { from: string; to: string } | null {
  if (range === 'all') return null
  if (range === 'week') {
    const days = weekDays(today)
    return { from: days[0], to: days[6] }
  }
  const [y, m] = today.split('-').map(Number)
  const ym = `${y}-${pad2(m)}`
  // new Date(y, m, 0) 即「第 m 月的最后一天」（m 为 1 基）
  return { from: `${ym}-01`, to: `${ym}-${pad2(new Date(y, m, 0).getDate())}` }
}

/** 按「区间 × 游戏名」过滤游玩记录；游戏名为空视为不筛，不修改入参 */
export function filterPlays(
  plays: Play[],
  opts: { game?: string | null; range?: PlayRange; today: string }
): Play[] {
  const bounds = playRangeBounds(opts.range ?? 'all', opts.today)
  const game = String(opts.game ?? '').trim()
  return plays.filter((p) => {
    if (bounds && (p.date < bounds.from || p.date > bounds.to)) return false
    if (game && String(p.game ?? '').trim() !== game) return false
    return true
  })
}

// ---------- 影视书：影视 / 书籍 分栏 ----------

/** 展示范围：影视（电影 + 剧集）/ 书籍 */
export type MediaScope = 'screen' | 'book'

export function mediaInScope(media: Media[], scope: MediaScope): Media[] {
  return media.filter((m) => (scope === 'book' ? m.type === 'book' : m.type !== 'book'))
}
