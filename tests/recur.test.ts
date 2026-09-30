import { describe, it, expect } from 'vitest'
import { expandEvent, expandEvents, occurrenceKey } from '../src/shared/recur'
import type { Event } from '../src/shared/types'

const ev = (p: Partial<Event>): Event => ({
  id: 1, title: '事件', start_at: '2026-09-30 09:00', end_at: '2026-09-30 10:00',
  all_day: false, location: null, note: null, repeat_type: 'none',
  repeat_interval: 1, repeat_until: null, remind_minutes: 15,
  created_at: '', updated_at: '', ...p
})

describe('expandEvent', () => {
  it('单次事件只落在自己那天', () => {
    const e = ev({})
    expect(expandEvent(e, '2026-09-01', '2026-09-30').map((o) => o.date)).toEqual(['2026-09-30'])
    expect(expandEvent(e, '2026-10-01', '2026-10-31')).toEqual([])
  })

  it('每天重复：区间内逐日展开且保留时分', () => {
    const e = ev({ repeat_type: 'daily', start_at: '2026-09-28 07:30', end_at: '2026-09-28 08:00' })
    const dates = expandEvent(e, '2026-09-30', '2026-10-02').map((o) => o.date)
    expect(dates).toEqual(['2026-09-30', '2026-10-01', '2026-10-02'])
    expect(expandEvent(e, '2026-09-30', '2026-09-30')[0].startAt).toBe('2026-09-30 07:30')
  })

  it('每 3 天重复：从起点对齐，而不是从区间起点重新计数', () => {
    const e = ev({ repeat_type: 'daily', repeat_interval: 3, start_at: '2026-09-28 09:00', end_at: '2026-09-28 10:00' })
    expect(expandEvent(e, '2026-09-29', '2026-10-05').map((o) => o.date))
      .toEqual(['2026-10-01', '2026-10-04'])
  })

  it('每周重复：跨周命中', () => {
    const e = ev({ repeat_type: 'weekly', start_at: '2026-09-07 20:00', end_at: '2026-09-07 21:00' })
    expect(expandEvent(e, '2026-09-28', '2026-10-12').map((o) => o.date))
      .toEqual(['2026-09-28', '2026-10-05', '2026-10-12'])
  })

  it('每两周重复', () => {
    const e = ev({ repeat_type: 'weekly', repeat_interval: 2, start_at: '2026-09-07 20:00', end_at: '2026-09-07 21:00' })
    expect(expandEvent(e, '2026-09-01', '2026-10-05').map((o) => o.date))
      .toEqual(['2026-09-07', '2026-09-21', '2026-10-05'])
  })

  it('每月重复：31 号在短月夹到月末，长月回到 31 号（不漂移）', () => {
    const e = ev({ repeat_type: 'monthly', start_at: '2026-01-31 10:00', end_at: '2026-01-31 11:00' })
    expect(expandEvent(e, '2026-02-01', '2026-05-31').map((o) => o.date))
      .toEqual(['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'])
  })

  it('每两月重复', () => {
    const e = ev({ repeat_type: 'monthly', repeat_interval: 2, start_at: '2026-01-15 10:00', end_at: '2026-01-15 11:00' })
    expect(expandEvent(e, '2026-01-01', '2026-07-31').map((o) => o.date))
      .toEqual(['2026-01-15', '2026-03-15', '2026-05-15', '2026-07-15'])
  })

  it('repeat_until 之后不再发生', () => {
    const e = ev({ repeat_type: 'daily', repeat_until: '2026-10-01' })
    expect(expandEvent(e, '2026-09-28', '2026-10-05').map((o) => o.date))
      .toEqual(['2026-09-30', '2026-10-01'])
  })

  it('repeat_until 早于查询区间时直接返回空', () => {
    const e = ev({ repeat_type: 'daily', repeat_until: '2026-09-01' })
    expect(expandEvent(e, '2026-09-28', '2026-10-05')).toEqual([])
  })

  it('全天事件透传 all_day，地点备注提醒分钟一并带出', () => {
    const e = ev({ all_day: true, location: '家', note: '备注', remind_minutes: 60, start_at: '2026-09-30 00:00', end_at: '2026-09-30 00:00' })
    const o = expandEvent(e, '2026-09-30', '2026-09-30')[0]
    expect(o).toMatchObject({ allDay: true, location: '家', note: '备注', remindMinutes: 60 })
    expect(occurrenceKey(o)).toBe('1@2026-09-30')
  })

  it('重复间隔为 0 或负数时按 1 处理，不会死循环', () => {
    const e = ev({ repeat_type: 'daily', repeat_interval: 0, start_at: '2026-09-28 09:00', end_at: '2026-09-28 10:00' })
    expect(expandEvent(e, '2026-09-30', '2026-10-02').map((o) => o.date))
      .toEqual(['2026-09-30', '2026-10-01', '2026-10-02'])
  })
})

describe('expandEvents', () => {
  it('多事件合并后按开始时间排序', () => {
    const list = [
      ev({ id: 1, title: '早', start_at: '2026-09-30 09:00', end_at: '2026-09-30 10:00' }),
      ev({ id: 2, title: '更早', start_at: '2026-09-30 07:00', end_at: '2026-09-30 08:00' })
    ]
    expect(expandEvents(list, '2026-09-30', '2026-09-30').map((o) => o.title)).toEqual(['更早', '早'])
  })

  it('开始时间相同时按事件 id 稳定排序', () => {
    const list = [
      ev({ id: 5, title: 'B', start_at: '2026-09-30 09:00', end_at: '2026-09-30 10:00' }),
      ev({ id: 3, title: 'A', start_at: '2026-09-30 09:00', end_at: '2026-09-30 10:00' })
    ]
    expect(expandEvents(list, '2026-09-30', '2026-09-30').map((o) => o.eventId)).toEqual([3, 5])
  })

  it('空输入返回空数组', () => {
    expect(expandEvents([], '2026-09-30', '2026-09-30')).toEqual([])
  })
})
