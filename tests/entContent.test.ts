import { describe, it, expect } from 'vitest'
import {
  MEDIA_TYPES, MEDIA_TYPE_LABELS, MEDIA_STATUSES, MEDIA_STATUS_LABELS,
  isMediaType, isMediaStatus,
  clampRating, normalizeComment, stars
} from '../src/shared/entContent'

describe('枚举与标签', () => {
  it('影视书类型固定三种', () => {
    expect(MEDIA_TYPES).toEqual(['movie', 'series', 'book'])
    expect(MEDIA_TYPE_LABELS).toEqual({ movie: '电影', series: '剧集', book: '书籍' })
  })
  it('影视书状态固定三种', () => {
    expect(MEDIA_STATUSES).toEqual(['planned', 'doing', 'done'])
    expect(MEDIA_STATUS_LABELS).toEqual({ planned: '想看', doing: '在看', done: '看完' })
  })
  it('类型守卫', () => {
    expect(isMediaType('movie')).toBe(true)
    expect(isMediaType('anime')).toBe(false)
    expect(isMediaStatus('doing')).toBe(true)
    expect(isMediaStatus('dropped')).toBe(false)
  })
})

describe('clampRating', () => {
  it('取整并夹到 0–5', () => {
    expect(clampRating(4)).toBe(4)
    expect(clampRating(4.4)).toBe(4)
    expect(clampRating(4.6)).toBe(5)
    expect(clampRating(-3)).toBe(0)
    expect(clampRating(9)).toBe(5)
  })
  it('非数字归 0', () => {
    expect(clampRating(NaN)).toBe(0)
    expect(clampRating('3')).toBe(0)
    expect(clampRating(undefined)).toBe(0)
    expect(clampRating(null)).toBe(0)
  })
})

describe('normalizeComment', () => {
  it('去首尾空白', () => {
    expect(normalizeComment('  很棒  ')).toBe('很棒')
    expect(normalizeComment('')).toBe('')
  })
  it('非字符串归空串', () => {
    expect(normalizeComment(null)).toBe('')
    expect(normalizeComment(undefined)).toBe('')
    expect(normalizeComment(42)).toBe('')
  })
})

describe('stars', () => {
  it('按评分拼星', () => {
    expect(stars(0)).toBe('☆☆☆☆☆')
    expect(stars(3)).toBe('★★★☆☆')
    expect(stars(5)).toBe('★★★★★')
  })
  it('越界按夹取后的值展示', () => {
    expect(stars(9)).toBe('★★★★★')
    expect(stars(-1)).toBe('☆☆☆☆☆')
  })
})
