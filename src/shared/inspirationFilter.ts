import type { Inspiration } from './types'

export interface InspirationFilter {
  /** true 只看精选；false 只看非精选；undefined 不过滤 */
  starred?: boolean
  /** 数字只看该画板；'all' 或 undefined 不过滤 */
  boardId?: number | 'all'
  /** 全部命中（AND） */
  tags?: string[]
  /** 对 text / source_url / tags 拼接做不区分大小写包含 */
  keyword?: string
}

/**
 * 灵感筛选：
 * - starred 三态（true / false / 不过滤）
 * - boardId 为数字时只看该画板
 * - tags 为「全部命中」（AND）
 * - keyword 命中 文字 / 来源链接 / 标签
 * - 空白关键词视为不过滤
 */
export function filterInspirations(items: Inspiration[], filter: InspirationFilter): Inspiration[] {
  const keyword = (filter.keyword ?? '').trim().toLowerCase()
  const tags = filter.tags ?? []

  return items.filter((it) => {
    if (filter.starred !== undefined && it.starred !== filter.starred) return false
    if (typeof filter.boardId === 'number' && it.board_id !== filter.boardId) return false
    for (const t of tags) if (!it.tags.includes(t)) return false
    if (keyword) {
      const haystack = `${it.text}\n${it.source_url ?? ''}\n${it.tags.join(' ')}`.toLowerCase()
      if (!haystack.includes(keyword)) return false
    }
    return true
  })
}
