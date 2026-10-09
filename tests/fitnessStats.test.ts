import { describe, it, expect } from 'vitest'
import {
  isoWeekday, planForDate, itemVolume, totalVolume, workoutCount,
  workoutStreak, toSvgPoints, linePath, latestMetric
} from '../src/shared/fitnessStats'
import type { WorkoutItem } from '../src/shared/types'

const wi = (name: string, weight: number, sets: number, reps: number): WorkoutItem => ({ name, weight, sets, reps })
const log = (date: string, content: WorkoutItem[] = []) => ({ date, content })

describe('isoWeekday', () => {
  it('2026-10-09 是周五 → 5', () => {
    expect(isoWeekday('2026-10-09')).toBe(5)
  })
  it('周一是 1、周日是 7', () => {
    expect(isoWeekday('2026-10-05')).toBe(1)
    expect(isoWeekday('2026-10-11')).toBe(7)
  })
  it('跨月与跨年都正确', () => {
    expect(isoWeekday('2026-09-28')).toBe(1)
    expect(isoWeekday('2027-01-01')).toBe(5)
  })
})

describe('planForDate', () => {
  const schedule = { '1': '胸', '5': '腿' }
  it('命中当天安排', () => {
    expect(planForDate(schedule, '2026-10-09')).toBe('腿')
    expect(planForDate(schedule, '2026-10-05')).toBe('胸')
  })
  it('没有安排返回 null', () => {
    expect(planForDate(schedule, '2026-10-06')).toBeNull()
    expect(planForDate({}, '2026-10-09')).toBeNull()
  })
  it('空白值视为没有安排', () => {
    expect(planForDate({ '5': '   ' }, '2026-10-09')).toBeNull()
  })
})

describe('itemVolume / totalVolume', () => {
  it('单动作容量 = 重量 × 组数 × 次数', () => {
    expect(itemVolume(wi('卧推', 60, 4, 8))).toBe(1920)
  })
  it('自重动作容量为 0', () => {
    expect(itemVolume(wi('引体向上', 0, 4, 10))).toBe(0)
  })
  it('区间内总容量（含端点）', () => {
    const logs = [
      log('2026-10-05', [wi('卧推', 60, 4, 8)]),
      log('2026-10-09', [wi('深蹲', 100, 5, 5)]),
      log('2026-10-12', [wi('硬拉', 120, 3, 5)])
    ]
    expect(totalVolume(logs, '2026-10-05', '2026-10-11')).toBe(1920 + 2500)
  })
  it('空区间为 0', () => {
    expect(totalVolume([], '2026-10-01', '2026-10-31')).toBe(0)
  })
  it('同一天多条记录累加', () => {
    const logs = [log('2026-10-09', [wi('a', 10, 2, 5)]), log('2026-10-09', [wi('b', 20, 2, 5)])]
    expect(totalVolume(logs, '2026-10-09', '2026-10-09')).toBe(100 + 200)
  })
  it('同一次训练多个动作累加', () => {
    const logs = [log('2026-10-09', [wi('卧推', 60, 4, 8), wi('飞鸟', 15, 3, 12)])]
    expect(totalVolume(logs, '2026-10-09', '2026-10-09')).toBe(1920 + 540)
  })
})

describe('workoutCount', () => {
  it('按记录条数统计（自重训练也算一次）', () => {
    const logs = [log('2026-10-05'), log('2026-10-07'), log('2026-10-12')]
    expect(workoutCount(logs, '2026-10-05', '2026-10-11')).toBe(2)
  })
  it('同一天两条算两次', () => {
    expect(workoutCount([log('2026-10-09'), log('2026-10-09')], '2026-10-09', '2026-10-09')).toBe(2)
  })
  it('空输入为 0', () => {
    expect(workoutCount([], '2026-10-01', '2026-10-31')).toBe(0)
  })
})

describe('workoutStreak', () => {
  const today = '2026-10-09'
  it('今天有打卡则从今天往前连数', () => {
    expect(workoutStreak([log(today), log('2026-10-08'), log('2026-10-07')], today)).toBe(3)
  })
  it('今天没有但昨天有则从昨天往前（连续未断）', () => {
    expect(workoutStreak([log('2026-10-08'), log('2026-10-07')], today)).toBe(2)
  })
  it('断档只数到断点', () => {
    expect(workoutStreak([log(today), log('2026-10-07')], today)).toBe(1)
  })
  it('今天与昨天都没有归零', () => {
    expect(workoutStreak([log('2026-10-05')], today)).toBe(0)
  })
  it('同一天多条只算一天', () => {
    expect(workoutStreak([log(today), log(today)], today)).toBe(1)
  })
  it('空输入为 0', () => {
    expect(workoutStreak([], today)).toBe(0)
  })
  it('跨月连续正确', () => {
    expect(workoutStreak([log('2026-10-01'), log('2026-09-30'), log('2026-09-29')], '2026-10-01')).toBe(3)
  })
})

describe('toSvgPoints', () => {
  it('空数组返回空', () => {
    expect(toSvgPoints([], 100, 50)).toEqual([])
  })
  it('单点水平居中，y 按值域映射', () => {
    const pts = toSvgPoints([{ date: '2026-10-09', value: 70 }], 100, 50, 5)
    expect(pts).toHaveLength(1)
    expect(pts[0].x).toBe(50)
    expect(pts[0].y).toBeGreaterThanOrEqual(5)
    expect(pts[0].y).toBeLessThanOrEqual(45)
  })
  it('所有值相同时落在垂直中点（不除零）', () => {
    const pts = toSvgPoints([
      { date: '2026-10-01', value: 70 }, { date: '2026-10-02', value: 70 }, { date: '2026-10-03', value: 70 }
    ], 100, 50, 5)
    expect(pts.map((p) => p.y)).toEqual([25, 25, 25])
  })
  it('x 均匀分布且首尾贴到内边距', () => {
    const pts = toSvgPoints([
      { date: '2026-10-01', value: 1 }, { date: '2026-10-02', value: 2 }, { date: '2026-10-03', value: 3 }
    ], 100, 50, 10)
    expect(pts[0].x).toBe(10)
    expect(pts[2].x).toBe(90)
    expect(pts[1].x).toBe(50)
  })
  it('y 轴反向：值越大 y 越小', () => {
    const pts = toSvgPoints([
      { date: '2026-10-01', value: 60 }, { date: '2026-10-02', value: 80 }
    ], 100, 50, 0)
    expect(pts[0].y).toBeGreaterThan(pts[1].y)
  })
  it('结果夹在边界内', () => {
    const pts = toSvgPoints([
      { date: '2026-10-01', value: -1e9 }, { date: '2026-10-02', value: 1e9 }
    ], 100, 50, 5)
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(5); expect(p.x).toBeLessThanOrEqual(95)
      expect(p.y).toBeGreaterThanOrEqual(5); expect(p.y).toBeLessThanOrEqual(45)
    }
  })
  it('默认内边距为 0', () => {
    const pts = toSvgPoints([{ date: 'a', value: 1 }, { date: 'b', value: 2 }], 100, 50)
    expect(pts[0].x).toBe(0)
  })
  it('保持输入顺序', () => {
    const pts = toSvgPoints([
      { date: 'c', value: 1 }, { date: 'a', value: 3 }, { date: 'b', value: 2 }
    ], 100, 50, 0)
    expect(pts.map((p) => p.x)).toEqual([0, 50, 100])
  })
})

describe('linePath', () => {
  it('0 点为空串', () => {
    expect(linePath([])).toBe('')
  })
  it('1 点只有 M', () => {
    expect(linePath([{ x: 10, y: 20 }])).toBe('M 10 20')
  })
  it('多点折线', () => {
    expect(linePath([{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 0 }])).toBe('M 0 0 L 10 5 L 20 0')
  })
  it('坐标保留一位小数', () => {
    expect(linePath([{ x: 1.234, y: 5.678 }])).toBe('M 1.2 5.7')
  })
})

describe('latestMetric', () => {
  it('取日期最大的一条', () => {
    expect(latestMetric([{ date: '2026-10-01' }, { date: '2026-10-09' }, { date: '2026-10-05' }])!.date)
      .toBe('2026-10-09')
  })
  it('空数组返回 null', () => {
    expect(latestMetric([])).toBeNull()
  })
  it('不修改入参', () => {
    const rows = [{ date: '2026-10-01' }, { date: '2026-10-09' }]
    latestMetric(rows)
    expect(rows[0].date).toBe('2026-10-01')
  })
})
