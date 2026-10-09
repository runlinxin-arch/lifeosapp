import { describe, it, expect, beforeEach } from 'vitest'
import { openDb } from '../src/main/db'
import {
  listMeals, getMeal, upsertMeal, deleteMeal,
  listPlans, getPlan, upsertMealPlan, deletePlan
} from '../src/main/db/diet'

let db: ReturnType<typeof openDb>
beforeEach(() => { db = openDb(':memory:') })

const food = (name: string, calories: number, protein = 0, carbs = 0, fat = 0) =>
  ({ name, calories, protein, carbs, fat })

describe('餐次记录', () => {
  it('首次写入即创建，items 为解析后的数组', () => {
    const m = upsertMeal(db, { date: '2026-10-09', type: 'breakfast', items: [food('燕麦', 150, 5, 27, 3)] })
    expect(m).toMatchObject({ date: '2026-10-09', type: 'breakfast' })
    expect(m.items).toEqual([{ name: '燕麦', calories: 150, protein: 5, carbs: 27, fat: 3 }])
    expect(getMeal(db, '2026-10-09', 'breakfast')!.items).toHaveLength(1)
  })

  it('同日同餐再次写入是覆盖而非新增', () => {
    upsertMeal(db, { date: '2026-10-09', type: 'lunch', items: [food('a', 100)] })
    upsertMeal(db, { date: '2026-10-09', type: 'lunch', items: [food('b', 200)] })
    const all = listMeals(db)
    expect(all).toHaveLength(1)
    expect(all[0].items[0].name).toBe('b')
  })

  it('四种餐次互不影响', () => {
    upsertMeal(db, { date: '2026-10-09', type: 'breakfast' })
    upsertMeal(db, { date: '2026-10-09', type: 'lunch' })
    upsertMeal(db, { date: '2026-10-09', type: 'dinner' })
    upsertMeal(db, { date: '2026-10-09', type: 'snack' })
    expect(listMeals(db)).toHaveLength(4)
  })

  it('允许空记录（只打卡这顿吃了）', () => {
    expect(upsertMeal(db, { date: '2026-10-09', type: 'snack' }).items).toEqual([])
  })

  it('餐次不合法被拒绝', () => {
    expect(() => upsertMeal(db, { date: '2026-10-09', type: 'brunch' as never })).toThrow('餐次不合法')
    expect(() => upsertMeal(db, { date: '2026-10-09', type: '' as never })).toThrow('餐次不合法')
  })

  it('日期非法被拒绝', () => {
    expect(() => upsertMeal(db, { date: '2026-9-1', type: 'lunch' })).toThrow('日期')
    expect(() => upsertMeal(db, { date: '2026-02-31', type: 'lunch' })).toThrow('日期')
  })

  it('入库前规范化食物营养值', () => {
    const m = upsertMeal(db, {
      date: '2026-10-09', type: 'lunch',
      items: [{ name: ' 鸡胸 ', calories: 165.26, protein: -3, carbs: 0, fat: 3.64 }]
    })
    expect(m.items).toEqual([{ name: '鸡胸', calories: 165.3, protein: 0, carbs: 0, fat: 3.6 }])
  })

  it('单项营养超上界被拒绝（拦住多打 0 的误输入）', () => {
    const base = { date: '2026-10-09', type: 'lunch' as const }
    expect(() => upsertMeal(db, { ...base, items: [food('误输入', 10001)] })).toThrow('热量')
    expect(() => upsertMeal(db, { ...base, items: [food('误输入', 100, 1001)] })).toThrow('营养素')
    expect(() => upsertMeal(db, { ...base, items: [food('误输入', 100, 0, 1001)] })).toThrow('营养素')
    expect(() => upsertMeal(db, { ...base, items: [food('误输入', 100, 0, 0, 1001)] })).toThrow('营养素')
    // 上界本身仍可接受
    expect(upsertMeal(db, { ...base, items: [food('边界值', 10000, 1000, 1000, 1000)] }).items[0].calories).toBe(10000)
  })

  it('按日期区间查询含端点，按日期倒序', () => {
    upsertMeal(db, { date: '2026-10-01', type: 'lunch' })
    upsertMeal(db, { date: '2026-10-05', type: 'lunch' })
    upsertMeal(db, { date: '2026-10-11', type: 'lunch' })
    expect(listMeals(db, '2026-10-05', '2026-10-11').map((m) => m.date)).toEqual(['2026-10-11', '2026-10-05'])
  })

  it('不传区间返回全部', () => {
    upsertMeal(db, { date: '2026-10-01', type: 'lunch' })
    upsertMeal(db, { date: '2026-10-09', type: 'lunch' })
    expect(listMeals(db)).toHaveLength(2)
  })

  it('getMeal 未命中返回 null', () => {
    expect(getMeal(db, '2026-10-09', 'lunch')).toBeNull()
  })

  it('删除记录', () => {
    const m = upsertMeal(db, { date: '2026-10-09', type: 'lunch' })
    deleteMeal(db, m.id)
    expect(listMeals(db)).toHaveLength(0)
  })
})

describe('饮食计划', () => {
  it('创建后可读回，内容去首尾空白', () => {
    const p = upsertMealPlan(db, { date: '2026-10-10', type: 'lunch', content: '  鸡胸沙拉  ' })
    expect(p.content).toBe('鸡胸沙拉')
    expect(getPlan(db, '2026-10-10', 'lunch')!.content).toBe('鸡胸沙拉')
  })

  it('同日同餐再次写入是覆盖', () => {
    upsertMealPlan(db, { date: '2026-10-10', type: 'lunch', content: 'A' })
    upsertMealPlan(db, { date: '2026-10-10', type: 'lunch', content: 'B' })
    const all = listPlans(db)
    expect(all).toHaveLength(1)
    expect(all[0].content).toBe('B')
  })

  it('计划内容不能为空', () => {
    expect(() => upsertMealPlan(db, { date: '2026-10-10', type: 'lunch', content: '   ' })).toThrow('计划内容不能为空')
    expect(() => upsertMealPlan(db, { date: '2026-10-10', type: 'lunch', content: '' })).toThrow('计划内容不能为空')
  })

  it('餐次与日期同样受校验', () => {
    expect(() => upsertMealPlan(db, { date: '2026-10-10', type: 'brunch' as never, content: 'x' })).toThrow('餐次不合法')
    expect(() => upsertMealPlan(db, { date: 'bad', type: 'lunch', content: 'x' })).toThrow('日期')
  })

  it('允许为未来日期编排', () => {
    expect(upsertMealPlan(db, { date: '2099-01-01', type: 'dinner', content: '年夜饭' }).date).toBe('2099-01-01')
  })

  it('按日期区间查询含端点', () => {
    upsertMealPlan(db, { date: '2026-10-10', type: 'lunch', content: 'A' })
    upsertMealPlan(db, { date: '2026-10-12', type: 'lunch', content: 'B' })
    expect(listPlans(db, '2026-10-10', '2026-10-11').map((p) => p.content)).toEqual(['A'])
    expect(listPlans(db)).toHaveLength(2)
  })

  it('删除计划', () => {
    const p = upsertMealPlan(db, { date: '2026-10-10', type: 'lunch', content: 'A' })
    deletePlan(db, p.id)
    expect(listPlans(db)).toHaveLength(0)
    expect(getPlan(db, '2026-10-10', 'lunch')).toBeNull()
  })
})
