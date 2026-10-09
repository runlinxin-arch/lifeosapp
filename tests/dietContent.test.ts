import { describe, it, expect } from 'vitest'
import {
  MEAL_TYPES, MEAL_LABELS, isMealType, parseMealItems, normalizeMealItems, mealItemsToJson
} from '../src/shared/dietContent'

describe('MEAL_TYPES / MEAL_LABELS', () => {
  it('固定四餐且顺序为早午晚加餐', () => {
    expect(MEAL_TYPES).toEqual(['breakfast', 'lunch', 'dinner', 'snack'])
    expect(MEAL_LABELS.breakfast).toBe('早餐')
    expect(MEAL_LABELS.lunch).toBe('午餐')
    expect(MEAL_LABELS.dinner).toBe('晚餐')
    expect(MEAL_LABELS.snack).toBe('加餐')
  })
  it('isMealType 只认四个值', () => {
    expect(isMealType('breakfast')).toBe(true)
    expect(isMealType('snack')).toBe(true)
    expect(isMealType('brunch')).toBe(false)
    expect(isMealType('')).toBe(false)
    expect(isMealType(null)).toBe(false)
  })
})

describe('parseMealItems', () => {
  it('解析合法数组', () => {
    const items = [{ name: '燕麦', calories: 150, protein: 5, carbs: 27, fat: 3 }]
    expect(parseMealItems(JSON.stringify(items))).toEqual(items)
  })
  it('坏数据回退空数组', () => {
    expect(parseMealItems('nope')).toEqual([])
    expect(parseMealItems('{"a":1}')).toEqual([])
    expect(parseMealItems('')).toEqual([])
    expect(parseMealItems('null')).toEqual([])
  })
  it('逐项校验：名称空的丢弃、营养值非法的丢弃', () => {
    const raw = JSON.stringify([
      { name: '燕麦', calories: 150, protein: 5, carbs: 27, fat: 3 },
      { name: '  ', calories: 100, protein: 1, carbs: 1, fat: 1 },
      { name: '鸡胸', calories: -1, protein: 30, carbs: 0, fat: 3 },
      { name: '米饭', calories: 200, protein: 'x', carbs: 45, fat: 0 },
      { name: '牛奶', calories: 100, protein: 3, carbs: 5 }
    ])
    expect(parseMealItems(raw).map((i) => i.name)).toEqual(['燕麦'])
  })
  it('全 0 也是合法条目（白水）', () => {
    const raw = JSON.stringify([{ name: '白水', calories: 0, protein: 0, carbs: 0, fat: 0 }])
    expect(parseMealItems(raw)).toHaveLength(1)
  })
})

describe('normalizeMealItems', () => {
  it('名称去空白、负数归零、保留一位小数', () => {
    expect(normalizeMealItems([{ name: ' 燕麦 ', calories: 150.26, protein: -1, carbs: 27.04, fat: 3 }]))
      .toEqual([{ name: '燕麦', calories: 150.3, protein: 0, carbs: 27, fat: 3 }])
  })
  it('丢弃空名称项', () => {
    expect(normalizeMealItems([{ name: ' ', calories: 1, protein: 1, carbs: 1, fat: 1 }])).toEqual([])
  })
  it('undefined 返回空数组', () => {
    expect(normalizeMealItems(undefined)).toEqual([])
  })
  it('与 parseMealItems 互为往返', () => {
    const items = [{ name: '鸡胸', calories: 165, protein: 31, carbs: 0, fat: 3.6 }]
    expect(parseMealItems(mealItemsToJson(items))).toEqual(items)
  })
})
