import { describe, it, expect } from 'vitest'
import { dailyMinutes, streakDays, sumMinutes, weekMinutes } from '../src/shared/learnStats'
import type { LearnSession } from '../src/shared/types'

const s = (date: string, minutes: number, id = 0): LearnSession => ({
  id, item_id: 1, date, minutes, created_at: ''
})

describe('sumMinutes', () => {
  it('含端点按日期汇总', () => {
    const list = [s('2026-10-01', 30), s('2026-10-05', 45), s('2026-10-09', 20)]
    expect(sumMinutes(list, '2026-10-05', '2026-10-09')).toBe(65)
    expect(sumMinutes(list, '2026-10-01', '2026-10-01')).toBe(30)
  })

  it('同一天多条累加', () => {
    expect(sumMinutes([s('2026-10-09', 10), s('2026-10-09', 25)], '2026-10-09', '2026-10-09')).toBe(35)
  })

  it('空区间返回 0', () => {
    expect(sumMinutes([], '2026-10-01', '2026-10-31')).toBe(0)
  })

  it('区间外的不计入', () => {
    expect(sumMinutes([s('2026-09-30', 99), s('2026-10-09', 10)], '2026-10-01', '2026-10-31')).toBe(10)
  })
})

describe('dailyMinutes', () => {
  it('按给定日期序列汇总，缺失记 0 且顺序不变', () => {
    const list = [s('2026-10-07', 30), s('2026-10-07', 15), s('2026-10-09', 60)]
    const days = ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']
    expect(dailyMinutes(list, days)).toEqual([
      { date: '2026-10-06', minutes: 0 },
      { date: '2026-10-07', minutes: 45 },
      { date: '2026-10-08', minutes: 0 },
      { date: '2026-10-09', minutes: 60 }
    ])
  })

  it('空输入返回全 0', () => {
    expect(dailyMinutes([], ['2026-10-09'])).toEqual([{ date: '2026-10-09', minutes: 0 }])
  })

  it('不包含在日期序列里的记录被忽略', () => {
    expect(dailyMinutes([s('2026-10-01', 50)], ['2026-10-09'])).toEqual([{ date: '2026-10-09', minutes: 0 }])
  })
})

describe('streakDays', () => {
  const today = '2026-10-09'

  it('今天有记录：从今天往前连数', () => {
    const list = [s('2026-10-09', 10), s('2026-10-08', 10), s('2026-10-07', 10)]
    expect(streakDays(list, today)).toBe(3)
  })

  it('今天没有但昨天有：连续未断，仍计数', () => {
    const list = [s('2026-10-08', 10), s('2026-10-07', 10)]
    expect(streakDays(list, today)).toBe(2)
  })

  it('断档则只数到断点', () => {
    const list = [s('2026-10-09', 10), s('2026-10-07', 10), s('2026-10-06', 10)]
    expect(streakDays(list, today)).toBe(1)
  })

  it('今天与昨天都没有则归零', () => {
    expect(streakDays([s('2026-10-06', 10)], today)).toBe(0)
  })

  it('无任何记录返回 0', () => {
    expect(streakDays([], today)).toBe(0)
  })

  it('同一天多条只算一天', () => {
    expect(streakDays([s('2026-10-09', 10), s('2026-10-09', 20)], today)).toBe(1)
  })

  it('跨月连续正确', () => {
    const list = [s('2026-10-01', 10), s('2026-09-30', 10), s('2026-09-29', 10)]
    expect(streakDays(list, '2026-10-01')).toBe(3)
  })

  it('跨年连续正确', () => {
    const list = [s('2027-01-01', 10), s('2026-12-31', 10), s('2026-12-30', 10)]
    expect(streakDays(list, '2027-01-01')).toBe(3)
  })
})

describe('weekMinutes', () => {
  it('统计本周一~周日合计（跨月也算同一周）', () => {
    // 2026-09-28 是周一
    const list = [s('2026-09-28', 30), s('2026-10-04', 20), s('2026-10-05', 99)]
    expect(weekMinutes(list, '2026-09-30')).toBe(50)
  })

  it('本周边界外的不计入', () => {
    // 2026-10-09 是周五 → 本周为 10-05（周一）~ 10-11（周日）
    const list = [s('2026-10-04', 99), s('2026-10-12', 99), s('2026-10-09', 15)]
    expect(weekMinutes(list, '2026-10-09')).toBe(15)
  })

  it('本周两端（周一与周日）都计入', () => {
    const list = [s('2026-10-05', 30), s('2026-10-11', 20)]
    expect(weekMinutes(list, '2026-10-09')).toBe(50)
  })
})
