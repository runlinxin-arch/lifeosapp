import { describe, it, expect, beforeEach } from 'vitest'
import { openDb } from '../src/main/db'
import {
  createLearnItem, listLearnItems, getLearnItem, updateLearnItem,
  setLearnProgress, deleteLearnItem, progressPercent,
  listNotes, createNote, updateNote, deleteNote, countNotes,
  listSessions, createSession, deleteSession
} from '../src/main/db/learn'
import { listRange } from '../src/main/db/longTasks'

let db: ReturnType<typeof openDb>
beforeEach(() => { db = openDb(':memory:') })

describe('学习项 CRUD', () => {
  it('创建后可读回，默认值正确', () => {
    const it0 = createLearnItem(db, { title: '雅思词汇' })
    expect(it0).toMatchObject({
      title: '雅思词汇', type: 'book', status: 'not_started',
      total_units: 0, done_units: 0, start_date: null, end_date: null
    })
    expect(getLearnItem(db, it0.id)?.title).toBe('雅思词汇')
  })

  it('类型、状态、总量、起止日期可写入', () => {
    const it0 = createLearnItem(db, {
      title: 'TypeScript 课程', type: 'course', status: 'learning',
      totalUnits: 30, doneUnits: 12, startDate: '2026-10-01', endDate: '2026-12-01'
    })
    expect(it0).toMatchObject({
      type: 'course', status: 'learning', total_units: 30, done_units: 12,
      start_date: '2026-10-01', end_date: '2026-12-01'
    })
  })

  it('标题为空被拒绝', () => {
    expect(() => createLearnItem(db, { title: '   ' })).toThrow('学习项标题不能为空')
    expect(listLearnItems(db)).toHaveLength(0)
  })

  it('标题首尾空白被去掉', () => {
    expect(createLearnItem(db, { title: '  雅思  ' }).title).toBe('雅思')
  })

  it('非法类型与状态被拒绝', () => {
    expect(() => createLearnItem(db, { title: 'x', type: 'video' as never })).toThrow('类型')
    expect(() => createLearnItem(db, { title: 'x', status: 'paused' as never })).toThrow('状态')
  })

  it('进度不得超过总量', () => {
    expect(() => createLearnItem(db, { title: 'x', totalUnits: 10, doneUnits: 11 })).toThrow('进度')
  })

  it('未设目标时进度必须为 0', () => {
    expect(() => createLearnItem(db, { title: 'x', doneUnits: 3 })).toThrow('总量')
  })

  it('负数与小数被拒绝', () => {
    expect(() => createLearnItem(db, { title: 'x', totalUnits: -1 })).toThrow('总量')
    expect(() => createLearnItem(db, { title: 'x', totalUnits: 10, doneUnits: 1.5 })).toThrow('进度')
  })

  it('只给一端日期时不校验区间，两端都给时才校验', () => {
    expect(() => createLearnItem(db, { title: 'x', startDate: '2026-10-01' })).not.toThrow()
    expect(() => createLearnItem(db, { title: 'y', startDate: '2026-12-01', endDate: '2026-10-01' })).toThrow('结束日期')
  })

  it('非法日期格式被拒绝', () => {
    expect(() => createLearnItem(db, { title: 'x', startDate: '2026-9-1' })).toThrow('开始日期')
    expect(() => createLearnItem(db, { title: 'x', endDate: '2026-02-31' })).toThrow('结束日期')
  })

  it('更新是合并语义，未传字段不变', () => {
    const it0 = createLearnItem(db, { title: '雅思', totalUnits: 30, doneUnits: 5 })
    const u = updateLearnItem(db, it0.id, { title: '雅思（改）' })
    expect(u.title).toBe('雅思（改）')
    expect(u.total_units).toBe(30)
    expect(u.done_units).toBe(5)
  })

  it('更新为 done 且已设总量时进度补满', () => {
    const it0 = createLearnItem(db, { title: '雅思', totalUnits: 30, doneUnits: 5 })
    const u = updateLearnItem(db, it0.id, { status: 'done' })
    expect(u.status).toBe('done')
    expect(u.done_units).toBe(30)
  })

  it('可以清空起止日期', () => {
    const it0 = createLearnItem(db, { title: '雅思', startDate: '2026-10-01', endDate: '2026-12-01' })
    const u = updateLearnItem(db, it0.id, { startDate: null, endDate: null })
    expect(u.start_date).toBeNull()
    expect(u.end_date).toBeNull()
  })

  it('setLearnProgress 单独更新进度', () => {
    const it0 = createLearnItem(db, { title: '雅思', totalUnits: 30 })
    expect(setLearnProgress(db, it0.id, 12).done_units).toBe(12)
    expect(() => setLearnProgress(db, it0.id, 31)).toThrow('进度')
  })

  it('列表按 学习中 → 未开始 → 已完成 排序', () => {
    createLearnItem(db, { title: 'C', status: 'done', totalUnits: 1, doneUnits: 1 })
    createLearnItem(db, { title: 'A', status: 'not_started' })
    createLearnItem(db, { title: 'B', status: 'learning' })
    expect(listLearnItems(db).map((i) => i.title)).toEqual(['B', 'A', 'C'])
  })

  it('更新不存在的学习项报错', () => {
    expect(() => updateLearnItem(db, 999, { title: 'x' })).toThrow('not found')
  })

  it('删除学习项后查不到', () => {
    const it0 = createLearnItem(db, { title: '雅思' })
    deleteLearnItem(db, it0.id)
    expect(getLearnItem(db, it0.id)).toBeNull()
    expect(listLearnItems(db)).toHaveLength(0)
  })
})

describe('progressPercent', () => {
  it('未设总量返回 0（不除零）', () => {
    expect(progressPercent({ total_units: 0, done_units: 0 })).toBe(0)
  })
  it('正常四舍五入', () => {
    expect(progressPercent({ total_units: 30, done_units: 13 })).toBe(43)
    expect(progressPercent({ total_units: 3, done_units: 1 })).toBe(33)
  })
  it('夹在 0–100', () => {
    expect(progressPercent({ total_units: 10, done_units: 0 })).toBe(0)
    expect(progressPercent({ total_units: 10, done_units: 10 })).toBe(100)
  })
})

describe('学习笔记', () => {
  it('增删改查', () => {
    const it0 = createLearnItem(db, { title: '雅思' })
    const n = createNote(db, it0.id, '第一章：词汇')
    expect(listNotes(db, it0.id)).toHaveLength(1)
    expect(updateNote(db, n.id, '第一章：词汇（补）').content).toBe('第一章：词汇（补）')
    deleteNote(db, n.id)
    expect(listNotes(db, it0.id)).toHaveLength(0)
  })

  it('内容为空被拒绝', () => {
    const it0 = createLearnItem(db, { title: '雅思' })
    expect(() => createNote(db, it0.id, '  ')).toThrow('笔记内容不能为空')
  })

  it('笔记首尾空白被去掉', () => {
    const it0 = createLearnItem(db, { title: '雅思' })
    expect(createNote(db, it0.id, '  重点  ').content).toBe('重点')
  })

  it('countNotes 统计笔记数', () => {
    const it0 = createLearnItem(db, { title: '雅思' })
    createNote(db, it0.id, 'a')
    createNote(db, it0.id, 'b')
    expect(countNotes(db, it0.id)).toBe(2)
    expect(countNotes(db, 999)).toBe(0)
  })

  it('给不存在的学习项加笔记报错', () => {
    expect(() => createNote(db, 999, 'a')).toThrow('not found')
  })

  it('更新不存在的笔记报错', () => {
    expect(() => updateNote(db, 999, 'a')).toThrow('not found')
  })

  it('笔记按创建顺序返回', () => {
    const it0 = createLearnItem(db, { title: '雅思' })
    createNote(db, it0.id, '第一条')
    createNote(db, it0.id, '第二条')
    expect(listNotes(db, it0.id).map((n) => n.content)).toEqual(['第一条', '第二条'])
  })

  it('删除学习项会连带删除笔记', () => {
    const it0 = createLearnItem(db, { title: '雅思' })
    createNote(db, it0.id, 'a')
    deleteLearnItem(db, it0.id)
    expect(listNotes(db, it0.id)).toHaveLength(0)
  })
})

describe('学习记录（sessions）', () => {
  it('写入后可查询，按日期区间过滤', () => {
    const it0 = createLearnItem(db, { title: '雅思' })
    createSession(db, it0.id, '2026-10-01', 30)
    createSession(db, it0.id, '2026-10-09', 45)
    expect(listSessions(db)).toHaveLength(2)
    expect(listSessions(db, '2026-10-05', '2026-10-31')).toHaveLength(1)
    expect(listSessions(db, '2026-10-05', '2026-10-31')[0].minutes).toBe(45)
  })

  it('时长必须是 ≥1 的整数，日期必须合法', () => {
    const it0 = createLearnItem(db, { title: '雅思' })
    expect(() => createSession(db, it0.id, '2026-10-09', 0)).toThrow('时长')
    expect(() => createSession(db, it0.id, '2026-10-09', -5)).toThrow('时长')
    expect(() => createSession(db, it0.id, '2026-10-09', 1.5)).toThrow('时长')
    expect(() => createSession(db, it0.id, 'bad', 10)).toThrow('日期')
  })

  it('给不存在的学习项加记录报错', () => {
    expect(() => createSession(db, 999, '2026-10-09', 10)).toThrow('not found')
  })

  it('按日期升序返回', () => {
    const it0 = createLearnItem(db, { title: '雅思' })
    createSession(db, it0.id, '2026-10-09', 30)
    createSession(db, it0.id, '2026-10-01', 20)
    expect(listSessions(db).map((s) => s.date)).toEqual(['2026-10-01', '2026-10-09'])
  })

  it('删除记录', () => {
    const it0 = createLearnItem(db, { title: '雅思' })
    const s = createSession(db, it0.id, '2026-10-09', 30)
    deleteSession(db, s.id)
    expect(listSessions(db)).toHaveLength(0)
  })

  it('删除学习项会连带删除学习记录', () => {
    const it0 = createLearnItem(db, { title: '雅思' })
    createSession(db, it0.id, '2026-10-09', 30)
    deleteLearnItem(db, it0.id)
    expect(listSessions(db)).toHaveLength(0)
  })
})

describe('与长期任务的联动', () => {
  it('删除学习项会清掉它的长期任务色块', () => {
    const it0 = createLearnItem(db, { title: '雅思', startDate: '2026-10-01', endDate: '2026-12-01' })
    db.prepare(`
      INSERT INTO long_tasks (title, start_date, end_date, color, source_module, source_id)
      VALUES (?, ?, ?, '#4ade80', 'learning', ?)
    `).run('雅思备考', '2026-10-01', '2026-12-01', it0.id)
    expect(listRange(db, '2026-01-01', '2027-01-01')).toHaveLength(1)

    deleteLearnItem(db, it0.id)
    expect(listRange(db, '2026-01-01', '2027-01-01')).toHaveLength(0)
  })

  it('不影响其它来源的长期任务', () => {
    const it0 = createLearnItem(db, { title: '雅思' })
    db.prepare(`
      INSERT INTO long_tasks (title, start_date, end_date, color, source_module, source_id)
      VALUES (?, ?, ?, '#3498db', 'dev', 7)
    `).run('项目A', '2026-10-01', '2026-12-01')
    deleteLearnItem(db, it0.id)
    expect(listRange(db, '2026-01-01', '2027-01-01')).toHaveLength(1)
  })
})
