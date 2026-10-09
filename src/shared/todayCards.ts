import type { LearnItem, Project } from './types'

/**
 * 「今天」页学习卡片该显示哪些学习项：
 * 先「学习中」，再「未开始」，最后「已完成」；同级按 id 升序；最多 limit 条。
 * 「已完成」只在没有别的可显示时才出现，避免今日卡片被已完成项占满。
 */
export function pickTodayLearnItems(items: LearnItem[], limit = 3): LearnItem[] {
  const rank = (s: LearnItem['status']): number =>
    s === 'learning' ? 0 : s === 'not_started' ? 1 : 2
  return [...items]
    .sort((a, b) => rank(a.status) - rank(b.status) || a.id - b.id)
    .slice(0, Math.max(0, limit))
}

/** 「今天」页开发卡片：只显示进行中的项目 */
export function activeProjects(projects: Project[]): Project[] {
  return projects.filter((p) => p.status === 'in_progress')
}
