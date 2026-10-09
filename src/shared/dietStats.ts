import type { Meal, MealItem, MealPlan, MealType, Nutrition } from './types'
import { MEAL_TYPES } from './dietContent'
import { addDays } from './dates'

/**
 * 饮食统计纯函数：合计口径只在这里实现一次，界面只做展示。
 * 所有数值统一四舍五入到 1 位小数，避免 0.1 + 0.2 这类浮点噪声进入界面。
 */

const ZERO: Nutrition = { calories: 0, protein: 0, carbs: 0, fat: 0 }

const round1 = (v: number): number => Math.round(v * 10) / 10

export function sumNutrition(items: MealItem[]): Nutrition {
  const total = items.reduce(
    (acc, i) => ({
      calories: acc.calories + i.calories,
      protein: acc.protein + i.protein,
      carbs: acc.carbs + i.carbs,
      fat: acc.fat + i.fat
    }),
    { ...ZERO }
  )
  return {
    calories: round1(total.calories),
    protein: round1(total.protein),
    carbs: round1(total.carbs),
    fat: round1(total.fat)
  }
}

/** 某一天全部餐次的合计 */
export function dayNutrition(meals: Meal[], date: string): Nutrition {
  return sumNutrition(meals.filter((m) => m.date === date).flatMap((m) => m.items))
}

/** 某一天按餐次分组的合计；总是返回四个键，未记录为零 */
export function nutritionByMeal(meals: Meal[], date: string): Record<MealType, Nutrition> {
  const out = {} as Record<MealType, Nutrition>
  for (const type of MEAL_TYPES) {
    out[type] = sumNutrition(meals.filter((m) => m.date === date && m.type === type).flatMap((m) => m.items))
  }
  return out
}

export function mealByType(meals: Meal[], date: string, type: MealType): Meal | null {
  return meals.find((m) => m.date === date && m.type === type) ?? null
}

export function planText(plans: MealPlan[], date: string, type: MealType): string {
  return plans.find((p) => p.date === date && p.type === type)?.content ?? ''
}

/** 某天已记录的餐次数 */
export function recordedCount(meals: Meal[], date: string): number {
  return meals.filter((m) => m.date === date).length
}

/** 某天已编排的饮食计划数 */
export function plannedCount(plans: MealPlan[], date: string): number {
  return plans.filter((p) => p.date === date).length
}

/** 从 from 起连续 n 天（含 from）；n ≤ 0 返回空数组 */
export function upcomingDays(from: string, n: number): string[] {
  if (!Number.isFinite(n) || n <= 0) return []
  return Array.from({ length: Math.floor(n) }, (_, i) => addDays(from, i))
}
