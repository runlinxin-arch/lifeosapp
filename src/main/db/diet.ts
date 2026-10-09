import type { DatabaseSync } from 'node:sqlite'
import type { Meal, MealInput, MealItem, MealPlan, MealPlanInput, MealType } from '@shared/types'
import {
  isMealType, MAX_ITEM_CALORIES, MAX_ITEM_MACRO, mealItemsToJson, normalizeMealItems, parseMealItems
} from '@shared/dietContent'
import { assertDateStr, assertNonEmpty } from './validate'

export type { MealInput, MealPlanInput, MealType } from '@shared/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asMeal = (r: any): Meal => ({ ...r, items: parseMealItems(String(r.items ?? '[]')) })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asPlan = (r: any): MealPlan => r as MealPlan

function assertMealType(t: MealType): void {
  if (!isMealType(t)) throw new Error(`餐次不合法：${String(t)}`)
}

function rangeSql(table: string, from?: string, to?: string): { sql: string; args: string[] } {
  if (from && to) {
    return { sql: `SELECT * FROM ${table} WHERE date >= ? AND date <= ? ORDER BY date DESC, id ASC`, args: [from, to] }
  }
  return { sql: `SELECT * FROM ${table} ORDER BY date DESC, id ASC`, args: [] }
}

// ---------- 餐次记录 ----------

export function listMeals(db: DatabaseSync, from?: string, to?: string): Meal[] {
  const { sql, args } = rangeSql('meals', from, to)
  const rows = db.prepare(sql).all(...args)
  return (rows as unknown as Meal[]).map(asMeal)
}

export function getMeal(db: DatabaseSync, date: string, type: MealType): Meal | null {
  const row = db.prepare('SELECT * FROM meals WHERE date = ? AND type = ?').get(date, type)
  return row ? asMeal(row) : null
}

/** 每天每餐一条：同日同餐再次写入是覆盖（配合 (date, type) 唯一索引用 upsert） */
/** 单项营养上界校验：拦住多打几个 0 之类的误输入（与健身的 1–1440 分钟同理） */
function assertItemBounds(items: MealItem[]): void {
  for (const it of items) {
    if (it.calories > MAX_ITEM_CALORIES) {
      throw new Error(`单项热量必须是 0–${MAX_ITEM_CALORIES} 之间的数字（${it.name}）`)
    }
    if (it.protein > MAX_ITEM_MACRO || it.carbs > MAX_ITEM_MACRO || it.fat > MAX_ITEM_MACRO) {
      throw new Error(`单项营养素必须是 0–${MAX_ITEM_MACRO} 克之间的数字（${it.name}）`)
    }
  }
}

export function upsertMeal(db: DatabaseSync, input: MealInput): Meal {
  assertDateStr(input.date, '记录日期')
  assertMealType(input.type)
  const items = normalizeMealItems(input.items ?? [])
  assertItemBounds(items)

  db.prepare(`
    INSERT INTO meals (date, type, items) VALUES (?, ?, ?)
    ON CONFLICT(date, type) DO UPDATE SET
      items = excluded.items,
      updated_at = datetime('now','localtime')
  `).run(input.date, input.type, mealItemsToJson(items))

  return getMeal(db, input.date, input.type)!
}

export function deleteMeal(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM meals WHERE id = ?').run(id)
}

// ---------- 饮食计划 ----------

export function listPlans(db: DatabaseSync, from?: string, to?: string): MealPlan[] {
  const { sql, args } = rangeSql('meal_plans', from, to)
  const rows = db.prepare(sql).all(...args)
  return (rows as unknown as MealPlan[]).map(asPlan)
}

export function getPlan(db: DatabaseSync, date: string, type: MealType): MealPlan | null {
  const row = db.prepare('SELECT * FROM meal_plans WHERE date = ? AND type = ?').get(date, type)
  return row ? asPlan(row) : null
}

/** 提前编排：允许未来日期；内容不能为空（清空计划由界面调用 deletePlan） */
export function upsertMealPlan(db: DatabaseSync, input: MealPlanInput): MealPlan {
  assertDateStr(input.date, '计划日期')
  assertMealType(input.type)
  const content = assertNonEmpty(input.content, '计划内容')

  db.prepare(`
    INSERT INTO meal_plans (date, type, content) VALUES (?, ?, ?)
    ON CONFLICT(date, type) DO UPDATE SET
      content = excluded.content,
      updated_at = datetime('now','localtime')
  `).run(input.date, input.type, content)

  return getPlan(db, input.date, input.type)!
}

export function deletePlan(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM meal_plans WHERE id = ?').run(id)
}
