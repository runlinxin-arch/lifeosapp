import { describe, it, expect, beforeEach } from 'vitest'
import { openDb } from '../src/main/db'
import {
  listPlans, getPlan, createPlan, updatePlan, deletePlan,
  listLogs, getLog, createLog, updateLog, deleteLog,
  listMetrics, upsertMetric, deleteMetric
} from '../src/main/db/fitness'

let db: ReturnType<typeof openDb>
beforeEach(() => { db = openDb(':memory:') })

const item = (name: string, weight = 60, sets = 4, reps = 8) => ({ name, weight, sets, reps })

describe('训练计划', () => {
  it('创建后可读回，schedule 默认空对象', () => {
    const p = createPlan(db, { name: '推拉腿' })
    expect(p).toMatchObject({ name: '推拉腿', schedule: {} })
    expect(getPlan(db, p.id)!.name).toBe('推拉腿')
  })

  it('一周安排以 ISO 数字键存储', () => {
    const p = createPlan(db, { name: 'P', schedule: { '1': '胸', '5': '腿' } })
    expect(p.schedule).toEqual({ '1': '胸', '5': '腿' })
    const raw = db.prepare('SELECT schedule FROM workout_plans WHERE id = ?').get(p.id) as { schedule: string }
    expect(JSON.parse(raw.schedule)).toEqual({ '1': '胸', '5': '腿' })
  })

  it('入库前规范化（丢弃越界键与空白值）', () => {
    const p = createPlan(db, { name: 'P', schedule: { '1': ' 胸 ', '9': 'x', '2': '  ' } as never })
    expect(p.schedule).toEqual({ '1': '胸' })
  })

  it('名称为空被拒绝，首尾空白被去掉', () => {
    expect(() => createPlan(db, { name: '   ' })).toThrow('计划名称不能为空')
    expect(createPlan(db, { name: '  推拉腿  ' }).name).toBe('推拉腿')
  })

  it('更新是合并语义', () => {
    const p = createPlan(db, { name: 'P', schedule: { '1': '胸' } })
    const u = updatePlan(db, p.id, { name: 'P2' })
    expect(u.name).toBe('P2')
    expect(u.schedule).toEqual({ '1': '胸' })
  })

  it('更新可替换整周安排', () => {
    const p = createPlan(db, { name: 'P', schedule: { '1': '胸' } })
    expect(updatePlan(db, p.id, { schedule: { '2': '背' } }).schedule).toEqual({ '2': '背' })
  })

  it('更新不存在的计划报错', () => {
    expect(() => updatePlan(db, 999, { name: 'x' })).toThrow('not found')
  })

  it('更新时名称不能改成空白', () => {
    const p = createPlan(db, { name: 'P' })
    expect(() => updatePlan(db, p.id, { name: '  ' })).toThrow('计划名称不能为空')
  })

  it('删除计划后打卡保留并解除关联', () => {
    const p = createPlan(db, { name: 'P' })
    const l = createLog(db, { date: '2026-10-09', planId: p.id, content: [item('卧推')] })
    deletePlan(db, p.id)
    expect(listPlans(db)).toHaveLength(0)
    expect(getLog(db, l.id)!.plan_id).toBeNull()
  })

  it('列表按 id 升序', () => {
    createPlan(db, { name: 'A' })
    createPlan(db, { name: 'B' })
    expect(listPlans(db).map((p) => p.name)).toEqual(['A', 'B'])
  })
})

describe('训练打卡', () => {
  it('创建后可读回，content 为解析后的数组', () => {
    const l = createLog(db, { date: '2026-10-09', content: [item('卧推', 60, 4, 8)] })
    expect(l.content).toEqual([{ name: '卧推', weight: 60, sets: 4, reps: 8 }])
  })

  it('允许空打卡（只记"练了"）', () => {
    const l = createLog(db, { date: '2026-10-09' })
    expect(l.content).toEqual([])
  })

  it('入库前规范化动作数值', () => {
    const l = createLog(db, { date: '2026-10-09', content: [{ name: ' 卧推 ', weight: -1, sets: 0, reps: 2.6 }] })
    expect(l.content).toEqual([{ name: '卧推', weight: 0, sets: 1, reps: 3 }])
  })

  it('空名称动作被丢弃', () => {
    const l = createLog(db, { date: '2026-10-09', content: [item('卧推'), { name: '  ', weight: 1, sets: 1, reps: 1 }] })
    expect(l.content.map((i) => i.name)).toEqual(['卧推'])
  })

  it('日期非法被拒绝', () => {
    expect(() => createLog(db, { date: '2026-9-1' })).toThrow('日期')
    expect(() => createLog(db, { date: '2026-02-31' })).toThrow('日期')
    expect(() => createLog(db, { date: '' })).toThrow('日期')
  })

  it('关联不存在的计划被拒绝', () => {
    expect(() => createLog(db, { date: '2026-10-09', planId: 999 })).toThrow('not found')
  })

  it('按日期区间查询（含端点，倒序）', () => {
    createLog(db, { date: '2026-10-01' })
    createLog(db, { date: '2026-10-05' })
    createLog(db, { date: '2026-10-11' })
    expect(listLogs(db, '2026-10-05', '2026-10-11').map((l) => l.date)).toEqual(['2026-10-11', '2026-10-05'])
  })

  it('不传区间返回全部，按日期倒序', () => {
    createLog(db, { date: '2026-10-01' })
    createLog(db, { date: '2026-10-09' })
    expect(listLogs(db).map((l) => l.date)).toEqual(['2026-10-09', '2026-10-01'])
  })

  it('更新内容与关联计划', () => {
    const p = createPlan(db, { name: 'P' })
    const l = createLog(db, { date: '2026-10-09' })
    const u = updateLog(db, l.id, { planId: p.id, content: [item('深蹲', 100, 5, 5)] })
    expect(u.plan_id).toBe(p.id)
    expect(u.content).toEqual([{ name: '深蹲', weight: 100, sets: 5, reps: 5 }])
  })

  it('更新可清空关联计划', () => {
    const p = createPlan(db, { name: 'P' })
    const l = createLog(db, { date: '2026-10-09', planId: p.id })
    expect(updateLog(db, l.id, { planId: null }).plan_id).toBeNull()
  })

  it('更新不存在的打卡报错', () => {
    expect(() => updateLog(db, 999, { content: [] })).toThrow('not found')
  })

  it('更新时关联不存在的计划被拒绝', () => {
    const l = createLog(db, { date: '2026-10-09' })
    expect(() => updateLog(db, l.id, { planId: 999 })).toThrow('not found')
  })

  it('删除打卡', () => {
    const l = createLog(db, { date: '2026-10-09' })
    deleteLog(db, l.id)
    expect(listLogs(db)).toHaveLength(0)
  })
})

describe('身体数据', () => {
  it('首次写入即创建', () => {
    const m = upsertMetric(db, { date: '2026-10-09', weight: 70.5, bodyFat: 18.2 })
    expect(m).toMatchObject({ date: '2026-10-09', weight: 70.5, body_fat: 18.2 })
  })

  it('同一天再次写入是覆盖而非报错', () => {
    upsertMetric(db, { date: '2026-10-09', weight: 70.5 })
    upsertMetric(db, { date: '2026-10-09', weight: 70.1, bodyFat: 17.9 })
    const all = listMetrics(db)
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ weight: 70.1, body_fat: 17.9 })
  })

  it('体脂可不填', () => {
    expect(upsertMetric(db, { date: '2026-10-09', weight: 70 }).body_fat).toBeNull()
  })

  it('体重与体脂的范围校验', () => {
    expect(() => upsertMetric(db, { date: '2026-10-09', weight: 0 })).toThrow('体重')
    expect(() => upsertMetric(db, { date: '2026-10-09', weight: -5 })).toThrow('体重')
    expect(() => upsertMetric(db, { date: '2026-10-09', weight: 501 })).toThrow('体重')
    expect(() => upsertMetric(db, { date: '2026-10-09', weight: NaN })).toThrow('体重')
    expect(() => upsertMetric(db, { date: '2026-10-09', weight: 70, bodyFat: 101 })).toThrow('体脂')
    expect(() => upsertMetric(db, { date: '2026-10-09', weight: 70, bodyFat: 0 })).toThrow('体脂')
  })

  it('日期非法被拒绝', () => {
    expect(() => upsertMetric(db, { date: 'bad', weight: 70 })).toThrow('日期')
  })

  it('按日期升序返回（便于直接喂曲线）', () => {
    upsertMetric(db, { date: '2026-10-09', weight: 70 })
    upsertMetric(db, { date: '2026-10-01', weight: 71 })
    expect(listMetrics(db).map((m) => m.date)).toEqual(['2026-10-01', '2026-10-09'])
  })

  it('区间查询含端点', () => {
    upsertMetric(db, { date: '2026-10-01', weight: 71 })
    upsertMetric(db, { date: '2026-10-09', weight: 70 })
    expect(listMetrics(db, '2026-10-05', '2026-10-31').map((m) => m.date)).toEqual(['2026-10-09'])
  })

  it('删除身体数据', () => {
    const m = upsertMetric(db, { date: '2026-10-09', weight: 70 })
    deleteMetric(db, m.id)
    expect(listMetrics(db)).toHaveLength(0)
  })
})
