import type { MealItem, MealType } from './types'

/**
 * 饮食模块的 JSON 列处理：解析（容错）、规范化（修正）、序列化。
 * 坏数据一律回退到空值，不让界面炸掉——与 fitnessContent / parseTags 的处理一致。
 */

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐'
}

const VALID_TYPES = new Set<string>(MEAL_TYPES)

export function isMealType(v: unknown): v is MealType {
  return typeof v === 'string' && VALID_TYPES.has(v)
}

/** 解析食物数组；坏 JSON / 非数组回退空数组，逐项校验、不合法的那一项丢弃 */
export function parseMealItems(raw: string): MealItem[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  const out: MealItem[] = []
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue
    const { name, calories, protein, carbs, fat } = entry as Record<string, unknown>
    if (typeof name !== 'string' || !name.trim()) continue
    const nums = [calories, protein, carbs, fat]
    if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)) continue
    out.push({
      name: name.trim(),
      calories: calories as number,
      protein: protein as number,
      carbs: carbs as number,
      fat: fat as number
    })
  }
  return out
}

const round1 = (v: number): number => Math.round(v * 10) / 10
const nonNegative = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? round1(n) : 0
}

/**
 * 规范化食物数组：与 parse 的区别是**修正而非丢弃**营养值——
 * 负数/非数一律归 0，四舍五入到 1 位小数；空名称项仍然丢弃。
 */
export function normalizeMealItems(input: MealItem[] | undefined): MealItem[] {
  if (!input) return []
  const out: MealItem[] = []
  for (const entry of input) {
    const name = String(entry?.name ?? '').trim()
    if (!name) continue
    out.push({
      name,
      calories: nonNegative(entry?.calories),
      protein: nonNegative(entry?.protein),
      carbs: nonNegative(entry?.carbs),
      fat: nonNegative(entry?.fat)
    })
  }
  return out
}

export function mealItemsToJson(items: MealItem[]): string {
  return JSON.stringify(normalizeMealItems(items))
}
