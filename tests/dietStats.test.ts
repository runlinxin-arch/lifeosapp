import { describe, it, expect } from 'vitest'
import {
  sumNutrition, dayNutrition, nutritionByMeal, mealByType, planText,
  recordedCount, plannedCount, upcomingDays
} from '../src/shared/dietStats'
import type { MealItem, Meal, MealPlan, MealType } from '../src/shared/types'

const food = (name: string, calories: number, protein = 0, carbs = 0, fat = 0): MealItem =>
  ({ name, calories, protein, carbs, fat })
const meal = (date: string, type: MealType, items: MealItem[] = []): Meal =>
  ({ id: 1, date, type, items, created_at: '', updated_at: '' })
const plan = (date: string, type: MealType, content: string): MealPlan =>
  ({ id: 1, date, type, content, created_at: '', updated_at: '' })

describe('sumNutrition', () => {
  it('四项分别求和', () => {
    expect(sumNutrition([food('a', 100, 10, 20, 5), food('b', 200, 20, 30, 10)]))
      .toEqual({ calories: 300, protein: 30, carbs: 50, fat: 15 })
  })
  it('空数组全零', () => {
    expect(sumNutrition([])).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 })
  })
  it('浮点噪声被抹平（0.1 + 0.2 = 0.3）', () => {
    expect(sumNutrition([food('a', 0, 0.1), food('b', 0, 0.2)]).protein).toBe(0.3)
  })
})

describe('dayNutrition', () => {
  it('只累计当天', () => {
    const meals = [
      meal('2026-10-09', 'breakfast', [food('燕麦', 300, 10, 40, 8)]),
      meal('2026-10-08', 'breakfast', [food('别的', 999, 9, 9, 9)])
    ]
    expect(dayNutrition(meals, '2026-10-09')).toEqual({ calories: 300, protein: 10, carbs: 40, fat: 8 })
  })
  it('无记录全零', () => {
    expect(dayNutrition([], '2026-10-09')).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 })
  })
  it('多餐累加', () => {
    const meals = [
      meal('2026-10-09', 'breakfast', [food('a', 300)]),
      meal('2026-10-09', 'lunch', [food('b', 700)])
    ]
    expect(dayNutrition(meals, '2026-10-09').calories).toBe(1000)
  })
})

describe('nutritionByMeal', () => {
  it('总是返回四个键，未记录为零', () => {
    const byMeal = nutritionByMeal([meal('2026-10-09', 'lunch', [food('a', 500, 30, 50, 20)])], '2026-10-09')
    expect(Object.keys(byMeal).sort()).toEqual(['breakfast', 'dinner', 'lunch', 'snack'])
    expect(byMeal.lunch.calories).toBe(500)
    expect(byMeal.breakfast).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 })
  })
})

describe('mealByType', () => {
  it('命中当天该餐', () => {
    const m = meal('2026-10-09', 'dinner', [food('鱼', 1, 1, 1, 1)])
    expect(mealByType([m], '2026-10-09', 'dinner')?.items[0].name).toBe('鱼')
  })
  it('日期或餐次不匹配返回 null', () => {
    const m = meal('2026-10-09', 'dinner')
    expect(mealByType([m], '2026-10-08', 'dinner')).toBeNull()
    expect(mealByType([m], '2026-10-09', 'lunch')).toBeNull()
    expect(mealByType([], '2026-10-09', 'dinner')).toBeNull()
  })
})

describe('planText', () => {
  it('命中返回计划文本', () => {
    expect(planText([plan('2026-10-10', 'lunch', '鸡胸沙拉')], '2026-10-10', 'lunch')).toBe('鸡胸沙拉')
  })
  it('没有计划返回空串', () => {
    expect(planText([], '2026-10-10', 'lunch')).toBe('')
    expect(planText([plan('2026-10-10', 'lunch', 'x')], '2026-10-11', 'lunch')).toBe('')
  })
})

describe('recordedCount / plannedCount', () => {
  it('按当天统计已记录餐数', () => {
    const meals = [meal('2026-10-09', 'breakfast'), meal('2026-10-09', 'lunch'), meal('2026-10-08', 'dinner')]
    expect(recordedCount(meals, '2026-10-09')).toBe(2)
    expect(recordedCount(meals, '2026-10-07')).toBe(0)
  })
  it('按当天统计已编排计划数', () => {
    const plans = [plan('2026-10-10', 'lunch', 'a'), plan('2026-10-10', 'dinner', 'b'), plan('2026-10-11', 'lunch', 'c')]
    expect(plannedCount(plans, '2026-10-10')).toBe(2)
  })
})

describe('upcomingDays', () => {
  it('从今天起连续 n 天（含今天）', () => {
    expect(upcomingDays('2026-10-09', 3)).toEqual(['2026-10-09', '2026-10-10', '2026-10-11'])
    expect(upcomingDays('2026-10-09', 1)).toEqual(['2026-10-09'])
  })
  it('跨月正确', () => {
    expect(upcomingDays('2026-10-30', 3)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01'])
  })
  it('n ≤ 0 返回空数组', () => {
    expect(upcomingDays('2026-10-09', 0)).toEqual([])
    expect(upcomingDays('2026-10-09', -1)).toEqual([])
  })
})
