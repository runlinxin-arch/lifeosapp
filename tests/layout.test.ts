import { describe, it, expect } from 'vitest'
import { monthMatrix, weekDays, weekStart } from '../src/shared/layout'

describe('weekStart / weekDays', () => {
  it('周三的周一是两天前', () => {
    expect(weekStart('2026-09-30')).toBe('2026-09-28')
  })
  it('周一自己就是周一', () => {
    expect(weekStart('2026-09-28')).toBe('2026-09-28')
  })
  it('周日归入本周而不是下周', () => {
    expect(weekStart('2026-10-04')).toBe('2026-09-28')
  })
  it('weekDays 返回连续 7 天并跨月正确', () => {
    expect(weekDays('2026-09-30')).toEqual([
      '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'
    ])
  })
})

describe('monthMatrix', () => {
  it('固定 42 格，从所在周的周一开始，首尾跨月', () => {
    const grid = monthMatrix('2026-09-15')
    expect(grid).toHaveLength(42)
    expect(grid[0]).toBe('2026-08-31')
    expect(grid[41]).toBe('2026-10-11')
  })

  it('当月 1 号正好是周一时首格就是 1 号', () => {
    expect(monthMatrix('2026-06-10')[0]).toBe('2026-06-01')
  })

  it('跨年月份正确', () => {
    const grid = monthMatrix('2027-01-15')
    expect(grid[0]).toBe('2026-12-28')
  })
})
