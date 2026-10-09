import type { Snippet } from './types'

/** 解析数据库里存的 tags（JSON 数组文本）；坏数据一律回退空数组，避免炸界面 */
export function parseTags(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((t): t is string => typeof t === 'string')
  } catch {
    return []
  }
}

export interface SnippetFilter {
  keyword?: string
  tags?: string[]
}

/**
 * 代码片段筛选：
 * - 关键词对 标题 / 代码 / 语言 做不区分大小写的包含匹配
 * - tags 为「全部命中」（AND）
 * - 两者同时给出取交集；空条件返回全部
 */
export function filterSnippets(items: Snippet[], filter: SnippetFilter): Snippet[] {
  const keyword = (filter.keyword ?? '').trim().toLowerCase()
  const tags = filter.tags ?? []

  return items.filter((s) => {
    if (keyword) {
      const haystack = `${s.title}\n${s.code}\n${s.language}`.toLowerCase()
      if (!haystack.includes(keyword)) return false
    }
    for (const t of tags) if (!s.tags.includes(t)) return false
    return true
  })
}
