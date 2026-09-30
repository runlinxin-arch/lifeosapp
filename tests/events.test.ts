import { describe, it, expect, beforeEach } from 'vitest'
import { openDb } from '../src/main/db'
import { createEvent, deleteEvent, getEvent, listEvents, listOccurrences, updateEvent } from '../src/main/db/events'

let db: ReturnType<typeof openDb>
beforeEach(() => { db = openDb(':memory:') })

const base = { title: '需求评审', startAt: '2026-09-30 14:00', endAt: '2026-09-30 15:30' }

describe('events CRUD', () => {
  it('创建后可读回，默认值正确', () => {
    const e = createEvent(db, base)
    expect(e).toMatchObject({
      title: '需求评审', start_at: '2026-09-30 14:00', end_at: '2026-09-30 15:30',
      all_day: false, repeat_type: 'none', repeat_interval: 1, repeat_until: null, remind_minutes: 15
    })
    expect(getEvent(db, e.id)?.title).toBe('需求评审')
  })

  it('地点、备注、重复规则、提醒分钟可写入', () => {
    const e = createEvent(db, {
      ...base, location: '会议室', note: '带电脑', repeatType: 'weekly',
      repeatInterval: 2, repeatUntil: '2026-12-31', remindMinutes: 30
    })
    expect(e).toMatchObject({
      location: '会议室', note: '带电脑', repeat_type: 'weekly',
      repeat_interval: 2, repeat_until: '2026-12-31', remind_minutes: 30
    })
  })

  it('全天事件落库为 1 并读回布尔 true', () => {
    const e = createEvent(db, { ...base, allDay: true, startAt: '2026-09-30 00:00', endAt: '2026-09-30 00:00' })
    expect(e.all_day).toBe(true)
    expect((db.prepare('SELECT all_day FROM events WHERE id = ?').get(e.id) as { all_day: number }).all_day).toBe(1)
  })

  it('标题为空、结束早于开始、间隔小于 1、截止早于起始日均报错', () => {
    expect(() => createEvent(db, { ...base, title: '  ' })).toThrow('事件标题')
    expect(() => createEvent(db, { ...base, endAt: '2026-09-30 13:00' })).toThrow('结束时间')
    expect(() => createEvent(db, { ...base, repeatType: 'daily', repeatInterval: 0 })).toThrow('重复间隔')
    expect(() => createEvent(db, { ...base, repeatType: 'daily', repeatUntil: '2026-09-29' })).toThrow('重复截止')
    expect(listEvents(db, '2026-01-01', '2027-01-01')).toHaveLength(0)
  })

  it('开始与结束同一时刻视为合法（零时长）', () => {
    const e = createEvent(db, { ...base, endAt: base.startAt })
    expect(e.start_at).toBe(e.end_at)
  })

  it('标题首尾空白被去掉', () => {
    expect(createEvent(db, { ...base, title: '  评审  ' }).title).toBe('评审')
  })

  it('更新是合并语义，未传字段保持不变', () => {
    const e = createEvent(db, { ...base, location: '会议室' })
    const u = updateEvent(db, e.id, { title: '评审（改）' })
    expect(u.title).toBe('评审（改）')
    expect(u.location).toBe('会议室')
    expect(u.start_at).toBe('2026-09-30 14:00')
  })

  it('可以清空可选字段', () => {
    const e = createEvent(db, { ...base, location: '会议室', note: '带电脑' })
    const u = updateEvent(db, e.id, { location: null, note: null })
    expect(u.location).toBeNull()
    expect(u.note).toBeNull()
  })

  it('更新时同样校验，非法值不落库', () => {
    const e = createEvent(db, base)
    expect(() => updateEvent(db, e.id, { endAt: '2026-09-30 13:00' })).toThrow('结束时间')
    expect(getEvent(db, e.id)!.end_at).toBe('2026-09-30 15:30')
  })

  it('更新不存在的事件报错', () => {
    expect(() => updateEvent(db, 999, { title: 'x' })).toThrow('not found')
  })

  it('删除后查不到', () => {
    const e = createEvent(db, base)
    deleteEvent(db, e.id)
    expect(getEvent(db, e.id)).toBeNull()
    expect(listEvents(db, '2026-09-01', '2026-09-30')).toHaveLength(0)
  })
})

describe('listEvents 区间查询', () => {
  it('按开始日过滤单次事件', () => {
    createEvent(db, base)
    createEvent(db, { title: '十月', startAt: '2026-10-05 09:00', endAt: '2026-10-05 10:00' })
    expect(listEvents(db, '2026-09-01', '2026-09-30').map((e) => e.title)).toEqual(['需求评审'])
  })

  it('起始日远早于区间但仍在重复的事件也要取到', () => {
    createEvent(db, { title: '每周站会', startAt: '2026-01-05 10:00', endAt: '2026-01-05 10:30', repeatType: 'weekly' })
    expect(listEvents(db, '2026-09-28', '2026-10-04').map((e) => e.title)).toEqual(['每周站会'])
  })

  it('repeat_until 早于区间的事件不再取到', () => {
    createEvent(db, { title: '已结束', startAt: '2026-01-05 10:00', endAt: '2026-01-05 10:30', repeatType: 'weekly', repeatUntil: '2026-03-01' })
    expect(listEvents(db, '2026-09-28', '2026-10-04')).toHaveLength(0)
  })

  it('区间边界包含端点', () => {
    createEvent(db, base)
    expect(listEvents(db, '2026-09-30', '2026-09-30')).toHaveLength(1)
    expect(listEvents(db, '2026-10-01', '2026-10-31')).toHaveLength(0)
  })
})

describe('listOccurrences', () => {
  it('把重复事件展开到区间内的每一天', () => {
    createEvent(db, { title: '晨跑', startAt: '2026-09-28 07:00', endAt: '2026-09-28 07:40', repeatType: 'daily' })
    const occ = listOccurrences(db, '2026-09-30', '2026-10-02')
    expect(occ.map((o) => o.date)).toEqual(['2026-09-30', '2026-10-01', '2026-10-02'])
    expect(occ[0].startAt).toBe('2026-09-30 07:00')
  })

  it('区间内没有事件时返回空数组', () => {
    expect(listOccurrences(db, '2026-09-30', '2026-09-30')).toEqual([])
  })

  it('删除事件后展开结果同步消失', () => {
    const e = createEvent(db, { title: '晨跑', startAt: '2026-09-28 07:00', endAt: '2026-09-28 07:40', repeatType: 'daily' })
    expect(listOccurrences(db, '2026-09-30', '2026-10-02')).toHaveLength(3)
    deleteEvent(db, e.id)
    expect(listOccurrences(db, '2026-09-30', '2026-10-02')).toHaveLength(0)
  })

  it('多个事件按开始时间排序返回', () => {
    createEvent(db, { title: '下午', startAt: '2026-09-30 14:00', endAt: '2026-09-30 15:00' })
    createEvent(db, { title: '上午', startAt: '2026-09-30 09:00', endAt: '2026-09-30 10:00' })
    expect(listOccurrences(db, '2026-09-30', '2026-09-30').map((o) => o.title)).toEqual(['上午', '下午'])
  })
})
