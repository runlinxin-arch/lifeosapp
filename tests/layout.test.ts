import { describe, it, expect } from 'vitest'
import { hourFromOffsetY, layoutMonth, layoutWeek, monthMatrix, weekDays, weekStart } from '../src/shared/layout'
import type { Occurrence } from '../src/shared/types'

const occ = (date: string, start: string, end: string, allDay = false, id = 1): Occurrence => ({
  eventId: id, title: `E${id}`, date, startAt: `${date} ${start}`, endAt: `${date} ${end}`,
  allDay, location: null, note: null, remindMinutes: 15
})

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

describe('layoutWeek', () => {
  it('按时间换算纵向位置与高度', () => {
    const { blocks } = layoutWeek([occ('2026-09-30', '09:00', '12:00')], '2026-09-30')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].dayIndex).toBe(2)
    expect(blocks[0].topPct).toBeCloseTo((9 * 60 / 1440) * 100)
    expect(blocks[0].heightPct).toBeCloseTo((3 * 60 / 1440) * 100)
  })

  it('区间外的事件不参与布局', () => {
    expect(layoutWeek([occ('2026-10-20', '09:00', '10:00')], '2026-09-30').blocks).toHaveLength(0)
  })

  it('返回该周的 7 天', () => {
    expect(layoutWeek([], '2026-09-30').days).toEqual([
      '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'
    ])
  })

  it('同一天重叠事件分道，不重叠共道', () => {
    const { blocks } = layoutWeek([
      occ('2026-09-30', '09:00', '11:00', false, 1),
      occ('2026-09-30', '10:00', '12:00', false, 2),
      occ('2026-09-30', '13:00', '14:00', false, 3)
    ], '2026-09-30')
    const byId = new Map(blocks.map((b) => [b.occurrence.eventId, b]))
    expect(byId.get(1)!.lane).toBe(0)
    expect(byId.get(2)!.lane).toBe(1)
    expect(byId.get(3)!.lane).toBe(0)
    expect(byId.get(1)!.laneCount).toBe(2)
  })

  it('相邻但不重叠（首尾相接）的事件共道', () => {
    const { blocks } = layoutWeek([
      occ('2026-09-30', '09:00', '10:00', false, 1),
      occ('2026-09-30', '10:00', '11:00', false, 2)
    ], '2026-09-30')
    expect(blocks.every((b) => b.lane === 0)).toBe(true)
  })

  it('不同天的事件各自从 0 道开始', () => {
    const { blocks } = layoutWeek([
      occ('2026-09-28', '09:00', '11:00', false, 1),
      occ('2026-09-29', '09:00', '11:00', false, 2)
    ], '2026-09-30')
    expect(blocks.every((b) => b.lane === 0)).toBe(true)
  })

  it('全天事件不进时间网格，单独返回', () => {
    const r = layoutWeek([occ('2026-09-30', '00:00', '00:00', true)], '2026-09-30')
    expect(r.blocks).toHaveLength(0)
    expect(r.allDay.map((o) => o.date)).toEqual(['2026-09-30'])
  })

  it('极短事件有最小高度，不会消失', () => {
    const { blocks } = layoutWeek([occ('2026-09-30', '09:00', '09:05')], '2026-09-30')
    expect(blocks[0].heightPct).toBeGreaterThanOrEqual(2)
  })

  it('结束早于或等于开始的事件按 30 分钟兜底', () => {
    const { blocks } = layoutWeek([occ('2026-09-30', '09:00', '09:00')], '2026-09-30')
    expect(blocks[0].heightPct).toBeCloseTo((30 / 1440) * 100)
  })
})

describe('layoutMonth', () => {
  it('每天最多 3 条，其余进 extra', () => {
    const list = [1, 2, 3, 4, 5].map((i) => occ('2026-09-30', `0${i}:00`, `0${i}:30`, false, i))
    const cell = layoutMonth(list, '2026-09-15').find((c) => c.date === '2026-09-30')!
    expect(cell.items).toHaveLength(3)
    expect(cell.extra).toBe(2)
    expect(cell.inMonth).toBe(true)
  })

  it('非本月格子标 inMonth=false', () => {
    const cell = layoutMonth([], '2026-09-15').find((c) => c.date === '2026-08-31')!
    expect(cell.inMonth).toBe(false)
  })

  it('返回 42 个格子且按日期升序', () => {
    const cells = layoutMonth([], '2026-09-15')
    expect(cells).toHaveLength(42)
    expect(cells[0].date < cells[41].date).toBe(true)
  })

  it('同一天的事件按开始时间排序', () => {
    const list = [
      occ('2026-09-30', '15:00', '16:00', false, 2),
      occ('2026-09-30', '09:00', '10:00', false, 1)
    ]
    const cell = layoutMonth(list, '2026-09-15').find((c) => c.date === '2026-09-30')!
    expect(cell.items.map((o) => o.eventId)).toEqual([1, 2])
  })

  it('恰好 3 条时 extra 为 0', () => {
    const list = [1, 2, 3].map((i) => occ('2026-09-30', `0${i}:00`, `0${i}:30`, false, i))
    const cell = layoutMonth(list, '2026-09-15').find((c) => c.date === '2026-09-30')!
    expect(cell.items).toHaveLength(3)
    expect(cell.extra).toBe(0)
  })
})

describe('hourFromOffsetY（待办拖入格子的落点换算）', () => {
  const H = 44

  it('落在格子上沿取下整点', () => {
    expect(hourFromOffsetY(0, H)).toBe(0)
    expect(hourFromOffsetY(44, H)).toBe(1)
    expect(hourFromOffsetY(9 * H, H)).toBe(9)
  })

  it('格内任意位置归到该小时', () => {
    expect(hourFromOffsetY(9 * H + 1, H)).toBe(9)
    expect(hourFromOffsetY(9 * H + H - 1, H)).toBe(9)
  })

  it('超出底部的落点夹到 23 点，不会产生 24 点', () => {
    expect(hourFromOffsetY(24 * H, H)).toBe(23)
    expect(hourFromOffsetY(99999, H)).toBe(23)
  })

  it('负的落点夹到 0 点', () => {
    expect(hourFromOffsetY(-10, H)).toBe(0)
  })

  it('非法输入回退到默认小时', () => {
    expect(hourFromOffsetY(NaN, H)).toBe(9)
    expect(hourFromOffsetY(100, 0)).toBe(9)
    expect(hourFromOffsetY(100, -5)).toBe(9)
    expect(hourFromOffsetY(100, NaN)).toBe(9)
    expect(hourFromOffsetY(100, H, 14)).toBe(2)
  })
})
