import { describe, it, expect, beforeEach } from 'vitest'
import { openDb } from '../src/main/db'
import {
  listRange, createLongTask, deleteLongTask,
  updateLongTask, setLongTaskDone, markFromSource, removeBySource
} from '../src/main/db/longTasks'

let db: ReturnType<typeof openDb>
beforeEach(() => { db = openDb(':memory:') })

describe('longTasks', () => {
  it('creates with default color', () => {
    const t = createLongTask(db, { title: '备考', startDate: '2026-10-01', endDate: '2026-12-01' })
    expect(t.color).toBe('#8b8d98')
  })
  it('listRange returns overlapping tasks only', () => {
    createLongTask(db, { title: 'A', startDate: '2026-09-01', endDate: '2026-10-15' })
    createLongTask(db, { title: 'B', startDate: '2026-11-01', endDate: '2026-11-30' })
    const r = listRange(db, '2026-09-29', '2026-10-29')
    expect(r.map((x) => x.title)).toEqual(['A'])
  })
  it('deletes', () => {
    const t = createLongTask(db, { title: 'A', startDate: '2026-09-01', endDate: '2026-09-30' })
    deleteLongTask(db, t.id)
    expect(listRange(db, '2026-09-01', '2026-09-30')).toHaveLength(0)
  })
})

describe('长期任务数据层输入校验（隐患修复回归）', () => {
  it('空标题不入库', () => {
    expect(() => createLongTask(db, { title: '  ', startDate: '2026-09-01', endDate: '2026-09-30' })).toThrow('长期任务标题不能为空')
    expect(listRange(db, '2026-01-01', '2027-01-01')).toHaveLength(0)
  })

  it('标题首尾空白被去掉', () => {
    expect(createLongTask(db, { title: ' 备考 ', startDate: '2026-10-01', endDate: '2026-12-01' }).title).toBe('备考')
  })

  it('非法日期不入库', () => {
    expect(() => createLongTask(db, { title: 'A', startDate: '2026-9-1', endDate: '2026-09-30' })).toThrow('开始日期')
    expect(() => createLongTask(db, { title: 'A', startDate: '2026-09-01', endDate: '2026-02-31' })).toThrow('结束日期')
  })

  it('结束早于开始不入库', () => {
    expect(() => createLongTask(db, { title: 'A', startDate: '2026-09-30', endDate: '2026-09-01' })).toThrow('结束日期不能早于开始日期')
    expect(listRange(db, '2026-01-01', '2027-01-01')).toHaveLength(0)
  })
})

describe('longTasks M2 增强', () => {
  it('少于 2 天不允许上轴', () => {
    expect(() => createLongTask(db, { title: '当天小事', startDate: '2026-09-30', endDate: '2026-09-30' })).toThrow('2 天')
    expect(listRange(db, '2026-01-01', '2027-01-01')).toHaveLength(0)
  })

  it('刚好 2 天允许上轴', () => {
    expect(createLongTask(db, { title: '两天', startDate: '2026-09-30', endDate: '2026-10-01' }).id).toBeGreaterThan(0)
  })

  it('新建的长期任务 done 默认为 false', () => {
    const t = createLongTask(db, { title: '备考', startDate: '2026-10-01', endDate: '2026-12-01' })
    expect(t.done).toBe(false)
  })

  it('更新是合并语义，未传字段不变', () => {
    const t = createLongTask(db, { title: '备考', startDate: '2026-10-01', endDate: '2026-12-01' })
    const u = updateLongTask(db, t.id, { title: '备考（改）' })
    expect(u.title).toBe('备考（改）')
    expect(u.start_date).toBe('2026-10-01')
    expect(u.end_date).toBe('2026-12-01')
    expect(u.done).toBe(false)
  })

  it('更新同样受 2 天校验约束（补丁字段用表字段名 end_date）', () => {
    const t = createLongTask(db, { title: '备考', startDate: '2026-10-01', endDate: '2026-12-01' })
    expect(() => updateLongTask(db, t.id, { end_date: '2026-10-01' })).toThrow('2 天')
    expect(listRange(db, '2026-10-01', '2026-12-01')[0].end_date).toBe('2026-12-01')
  })

  it('把区间改长是允许的', () => {
    const t = createLongTask(db, { title: '备考', startDate: '2026-10-01', endDate: '2026-11-01' })
    expect(updateLongTask(db, t.id, { end_date: '2026-12-01' }).end_date).toBe('2026-12-01')
  })

  it('更新标题为空白被拒绝', () => {
    const t = createLongTask(db, { title: '备考', startDate: '2026-10-01', endDate: '2026-12-01' })
    expect(() => updateLongTask(db, t.id, { title: '   ' })).toThrow('长期任务标题不能为空')
  })

  it('更新不存在的长期任务报错', () => {
    expect(() => updateLongTask(db, 999, { title: 'x' })).toThrow('not found')
  })

  it('setLongTaskDone 切换完成标记', () => {
    const t = createLongTask(db, { title: '减脂', startDate: '2026-10-01', endDate: '2026-11-01' })
    expect(setLongTaskDone(db, t.id, true).done).toBe(true)
    expect(setLongTaskDone(db, t.id, false).done).toBe(false)
  })

  it('markFromSource 取来源模块色，且同来源二次标记是更新', () => {
    const a = markFromSource(db, {
      title: '雅思备考', startDate: '2026-10-01', endDate: '2026-12-01', sourceModule: 'learning', sourceId: 7
    })
    expect(a.color).toBe('#4ade80')
    expect(a.source_module).toBe('learning')
    expect(a.source_id).toBe(7)

    const b = markFromSource(db, {
      title: '雅思备考（改名）', startDate: '2026-10-05', endDate: '2026-12-10', sourceModule: 'learning', sourceId: 7
    })
    expect(b.id).toBe(a.id)
    expect(b.title).toBe('雅思备考（改名）')
    expect(b.start_date).toBe('2026-10-05')
    expect(listRange(db, '2026-01-01', '2027-01-01')).toHaveLength(1)
  })

  it('不同来源模块各自成条，颜色随模块', () => {
    markFromSource(db, { title: '学习', startDate: '2026-10-01', endDate: '2026-11-01', sourceModule: 'learning', sourceId: 1 })
    markFromSource(db, { title: '开发', startDate: '2026-10-01', endDate: '2026-11-01', sourceModule: 'dev', sourceId: 1 })
    const all = listRange(db, '2026-01-01', '2027-01-01')
    expect(all).toHaveLength(2)
    expect(all.map((t) => t.color).sort()).toEqual(['#3498db', '#4ade80'])
  })

  it('markFromSource 也要求 ≥2 天', () => {
    expect(() => markFromSource(db, {
      title: '一天', startDate: '2026-10-01', endDate: '2026-10-01', sourceModule: 'dev', sourceId: 1
    })).toThrow('2 天')
  })

  it('removeBySource 清掉对应色块，独立任务不受影响', () => {
    markFromSource(db, { title: '项目A', startDate: '2026-10-01', endDate: '2026-11-01', sourceModule: 'dev', sourceId: 3 })
    createLongTask(db, { title: '独立任务', startDate: '2026-10-01', endDate: '2026-11-01' })
    removeBySource(db, 'dev', 3)
    expect(listRange(db, '2026-01-01', '2027-01-01').map((t) => t.title)).toEqual(['独立任务'])
  })
})
