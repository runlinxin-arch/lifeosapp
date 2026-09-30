import { describe, it, expect, beforeEach } from 'vitest'
import { openDb } from '../src/main/db'
import { listRange, createLongTask, deleteLongTask } from '../src/main/db/longTasks'

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
