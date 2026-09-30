import { describe, it, expect, beforeEach } from 'vitest'
import { openDb } from '../src/main/db'
import { createEvent, deleteEvent, updateEvent } from '../src/main/db/events'
import { convertTaskToEvent, syncEventTasks } from '../src/main/db/interop'
import { createTask, listTasksByDate, updateTask } from '../src/main/db/tasks'

let db: ReturnType<typeof openDb>
beforeEach(() => { db = openDb(':memory:') })

const eventOn = (date: string, title = '站会') =>
  createEvent(db, { title, startAt: `${date} 10:00`, endAt: `${date} 10:30` })

describe('syncEventTasks', () => {
  it('当日事件汇入待办并带来源标记', () => {
    const e = eventOn('2026-09-30')
    syncEventTasks(db, '2026-09-30')
    const list = listTasksByDate(db, '2026-09-30')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ title: '站会', source_module: 'event', source_id: e.id, priority: 'mid', done: false })
  })

  it('重复执行不会重复插入（幂等）', () => {
    eventOn('2026-09-30')
    syncEventTasks(db, '2026-09-30')
    syncEventTasks(db, '2026-09-30')
    syncEventTasks(db, '2026-09-30')
    expect(listTasksByDate(db, '2026-09-30')).toHaveLength(1)
  })

  it('勾选完成后再同步，done 状态保留', () => {
    eventOn('2026-09-30')
    syncEventTasks(db, '2026-09-30')
    const t = listTasksByDate(db, '2026-09-30')[0]
    updateTask(db, t.id, { done: true })
    syncEventTasks(db, '2026-09-30')
    expect(listTasksByDate(db, '2026-09-30')[0].done).toBe(true)
  })

  it('用户改过的优先级不被同步覆盖', () => {
    eventOn('2026-09-30')
    syncEventTasks(db, '2026-09-30')
    const t = listTasksByDate(db, '2026-09-30')[0]
    updateTask(db, t.id, { priority: 'high' })
    syncEventTasks(db, '2026-09-30')
    expect(listTasksByDate(db, '2026-09-30')[0].priority).toBe('high')
  })

  it('事件改标题后同步，待办标题跟随', () => {
    const e = eventOn('2026-09-30')
    syncEventTasks(db, '2026-09-30')
    updateEvent(db, e.id, { title: '站会（改）' })
    syncEventTasks(db, '2026-09-30')
    const list = listTasksByDate(db, '2026-09-30')
    expect(list).toHaveLength(1)
    expect(list[0].title).toBe('站会（改）')
  })

  it('事件被删除后同步，对应待办行消失', () => {
    const e = eventOn('2026-09-30')
    syncEventTasks(db, '2026-09-30')
    deleteEvent(db, e.id)
    syncEventTasks(db, '2026-09-30')
    expect(listTasksByDate(db, '2026-09-30')).toHaveLength(0)
  })

  it('事件改到别的日期后，原日期的汇入行消失', () => {
    const e = eventOn('2026-09-30')
    syncEventTasks(db, '2026-09-30')
    updateEvent(db, e.id, { startAt: '2026-10-05 10:00', endAt: '2026-10-05 10:30' })
    syncEventTasks(db, '2026-09-30')
    expect(listTasksByDate(db, '2026-09-30')).toHaveLength(0)
    syncEventTasks(db, '2026-10-05')
    expect(listTasksByDate(db, '2026-10-05')).toHaveLength(1)
  })

  it('重复事件的每一天各自汇入', () => {
    createEvent(db, { title: '晨跑', startAt: '2026-09-28 07:00', endAt: '2026-09-28 07:40', repeatType: 'daily' })
    syncEventTasks(db, '2026-09-30')
    syncEventTasks(db, '2026-10-01')
    expect(listTasksByDate(db, '2026-09-30').map((t) => t.title)).toEqual(['晨跑'])
    expect(listTasksByDate(db, '2026-10-01').map((t) => t.title)).toEqual(['晨跑'])
    expect(listTasksByDate(db, '2026-09-30')[0].source_id).toBe(listTasksByDate(db, '2026-10-01')[0].source_id)
  })

  it('手工待办不受同步影响，也不会被误删', () => {
    createTask(db, { title: '手写一条', date: '2026-09-30' })
    syncEventTasks(db, '2026-09-30')
    expect(listTasksByDate(db, '2026-09-30').map((t) => t.title)).toEqual(['手写一条'])
  })

  it('手工待办与日程汇入行可以共存', () => {
    eventOn('2026-09-30')
    createTask(db, { title: '手写一条', priority: 'high', date: '2026-09-30' })
    syncEventTasks(db, '2026-09-30')
    expect(listTasksByDate(db, '2026-09-30').map((t) => t.title).sort()).toEqual(['手写一条', '站会'])
  })

  it('清空某天事件后，该天的汇入行全部清掉', () => {
    eventOn('2026-09-30', 'A')
    eventOn('2026-09-30', 'B')
    syncEventTasks(db, '2026-09-30')
    expect(listTasksByDate(db, '2026-09-30')).toHaveLength(2)
    for (const e of db.prepare("SELECT id FROM events WHERE title IN ('A','B')").all() as { id: number }[]) {
      deleteEvent(db, e.id)
    }
    syncEventTasks(db, '2026-09-30')
    expect(listTasksByDate(db, '2026-09-30')).toHaveLength(0)
  })
})

describe('convertTaskToEvent', () => {
  it('一个事务里建事件、删原待办，且当天待办改由日程汇入', () => {
    const t = createTask(db, { title: '买咖啡豆', priority: 'high', date: '2026-09-30' })
    const e = convertTaskToEvent(db, t.id, { startAt: '2026-09-30 18:00', endAt: '2026-09-30 18:30' })

    expect(e.title).toBe('买咖啡豆')
    syncEventTasks(db, '2026-09-30')
    const list = listTasksByDate(db, '2026-09-30')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ title: '买咖啡豆', source_module: 'event', source_id: e.id })
  })

  it('参数非法时整体回滚，原待办仍在', () => {
    const t = createTask(db, { title: '买咖啡豆', date: '2026-09-30' })
    expect(() => convertTaskToEvent(db, t.id, { startAt: '2026-09-30 18:00', endAt: '2026-09-30 17:00' })).toThrow('结束时间')
    expect(listTasksByDate(db, '2026-09-30')).toHaveLength(1)
    expect(db.prepare('SELECT COUNT(*) c FROM events').get()).toEqual({ c: 0 })
  })

  it('事件来源的待办不能再转', () => {
    const e = eventOn('2026-09-30')
    syncEventTasks(db, '2026-09-30')
    const t = listTasksByDate(db, '2026-09-30')[0]
    expect(() => convertTaskToEvent(db, t.id, { startAt: '2026-09-30 18:00', endAt: '2026-09-30 18:30' })).toThrow('已经来自日程')
    expect(listTasksByDate(db, '2026-09-30')).toHaveLength(1)
    expect(e.id).toBe(t.source_id)
  })

  it('待办不存在时报错', () => {
    expect(() => convertTaskToEvent(db, 999, { startAt: '2026-09-30 18:00', endAt: '2026-09-30 18:30' })).toThrow('not found')
  })

  it('转换后事件带着地点、备注与提醒分钟', () => {
    const t = createTask(db, { title: '复盘', date: '2026-09-30' })
    const e = convertTaskToEvent(db, t.id, {
      startAt: '2026-09-30 21:00', endAt: '2026-09-30 21:30',
      location: '书房', note: '带笔记本', remindMinutes: 30
    })
    expect(e).toMatchObject({ location: '书房', note: '带笔记本', remind_minutes: 30 })
  })

  it('转换到别的日期时，当天待办列表不再有它', () => {
    const t = createTask(db, { title: '下周的事', date: '2026-09-30' })
    convertTaskToEvent(db, t.id, { startAt: '2026-10-05 09:00', endAt: '2026-10-05 10:00' })
    syncEventTasks(db, '2026-09-30')
    expect(listTasksByDate(db, '2026-09-30')).toHaveLength(0)
    syncEventTasks(db, '2026-10-05')
    expect(listTasksByDate(db, '2026-10-05').map((x) => x.title)).toEqual(['下周的事'])
  })
})
