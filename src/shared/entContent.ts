import type { MediaStatus, MediaType } from './types'

/**
 * 游戏娱乐模块的枚举、标签与展示换算。
 * 枚举顺序即界面展示顺序，避免各处各写一遍。
 */

export const MEDIA_TYPES: MediaType[] = ['movie', 'series', 'book']
export const MEDIA_TYPE_LABELS: Record<MediaType, string> = { movie: '电影', series: '剧集', book: '书籍' }

export const MEDIA_STATUSES: MediaStatus[] = ['planned', 'doing', 'done']
export const MEDIA_STATUS_LABELS: Record<MediaStatus, string> = { planned: '想看', doing: '在看', done: '看完' }

const TYPES = new Set<string>(MEDIA_TYPES)
const STATUSES = new Set<string>(MEDIA_STATUSES)

export function isMediaType(v: unknown): v is MediaType {
  return typeof v === 'string' && TYPES.has(v)
}

export function isMediaStatus(v: unknown): v is MediaStatus {
  return typeof v === 'string' && STATUSES.has(v)
}

/** 五星评分：取整并夹到 0–5；非数字一律 0（未评分） */
export function clampRating(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0
  return Math.min(5, Math.max(0, Math.round(n)))
}

/** 短评：非字符串归空串，否则去首尾空白 */
export function normalizeComment(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** 4 → '★★★★☆' */
export function stars(rating: number): string {
  const n = clampRating(rating)
  return '★'.repeat(n) + '☆'.repeat(5 - n)
}
