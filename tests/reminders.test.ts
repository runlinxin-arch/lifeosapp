import { describe, it, expect } from 'vitest'
import { dueReminders, reminderKey } from '../src/shared/reminders'
import type { Occurrence } from '../src/shared/types'

const occ = (id: number, startAt: string, remindMinutes = 15): Occurrence => ({
  eventId: id, title: `事件${id}`, date: startAt.slice(0, 10), startAt,
  endAt: `${startAt.slice(0, 10)} 23:00`, allDay: false, location: null, note: null, remindMinutes
})

describe('dueReminders', () => {
  const now = new Date('2026-09-30T09:50:00')

  it('进入提前窗口后命中', () => {
    const hits = dueReminders(now, [occ(1, '2026-09-30 10:00', 15)], new Set())
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ eventId: 1, title: '事件1', startAt: '2026-09-30 10:00' })
    expect(hits[0].key).toBe('1@2026-09-30')
  })

  it('恰好等于提醒时刻也算命中（含边界）', () => {
    expect(dueReminders(new Date('2026-09-30T09:45:00'), [occ(1, '2026-09-30 10:00', 15)], new Set())).toHaveLength(1)
  })

  it('还没到提醒时刻不命中', () => {
    expect(dueReminders(new Date('2026-09-30T09:44:00'), [occ(1, '2026-09-30 10:00', 15)], new Set())).toHaveLength(0)
  })

  it('事件已经开始就不再提醒', () => {
    expect(dueReminders(new Date('2026-09-30T10:00:00'), [occ(1, '2026-09-30 10:00', 15)], new Set())).toHaveLength(0)
    expect(dueReminders(new Date('2026-09-30T11:00:00'), [occ(1, '2026-09-30 10:00', 15)], new Set())).toHaveLength(0)
  })

  it('每个事件用自己的提前量', () => {
    const list = [occ(1, '2026-09-30 10:00', 5), occ(2, '2026-09-30 10:00', 15)]
    expect(dueReminders(now, list, new Set()).map((h) => h.eventId)).toEqual([2])
  })

  it('提前量为 0 视为关闭提醒（到点也不提醒）', () => {
    expect(dueReminders(new Date('2026-09-30T09:59:00'), [occ(1, '2026-09-30 10:00', 0)], new Set())).toHaveLength(0)
    expect(dueReminders(new Date('2026-09-30T10:00:00'), [occ(1, '2026-09-30 10:00', 0)], new Set())).toHaveLength(0)
    expect(dueReminders(new Date('2026-09-30T10:01:00'), [occ(1, '2026-09-30 10:00', 0)], new Set())).toHaveLength(0)
  })

  it('已提醒过的发生项不再重复', () => {
    const o = occ(1, '2026-09-30 10:00', 15)
    expect(dueReminders(now, [o], new Set([reminderKey(o)]))).toHaveLength(0)
  })

  it('多条同时命中的按开始时间排序返回', () => {
    const list = [occ(2, '2026-09-30 10:00'), occ(1, '2026-09-30 09:55')]
    expect(dueReminders(now, list, new Set()).map((h) => h.eventId)).toEqual([1, 2])
  })

  it('明天的发生项不会被今天的轮询误发', () => {
    expect(dueReminders(now, [occ(1, '2026-10-01 10:00', 15)], new Set())).toHaveLength(0)
  })

  it('提前量异常时按 15 分钟兜底', () => {
    const o = occ(1, '2026-09-30 10:00', NaN)
    expect(dueReminders(new Date('2026-09-30T09:50:00'), [o], new Set())).toHaveLength(1)
    expect(dueReminders(new Date('2026-09-30T09:40:00'), [o], new Set())).toHaveLength(0)
  })

  it('空列表返回空数组', () => {
    expect(dueReminders(now, [], new Set())).toEqual([])
  })
})

describe('reminderKey', () => {
  it('同一事件的同一天是同一个键，不同天不同', () => {
    expect(reminderKey(occ(1, '2026-09-30 10:00'))).toBe('1@2026-09-30')
    expect(reminderKey(occ(1, '2026-10-01 10:00'))).toBe('1@2026-10-01')
    expect(reminderKey(occ(2, '2026-09-30 10:00'))).toBe('2@2026-09-30')
  })
})
