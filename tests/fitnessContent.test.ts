import { describe, it, expect } from 'vitest'
import {
  parseSchedule, normalizeSchedule, scheduleToJson,
  parseWorkoutContent, normalizeWorkoutContent, workoutContentToJson,
  WEEKDAY_LABELS
} from '../src/shared/fitnessContent'

describe('parseSchedule', () => {
  it('解析合法 JSON', () => {
    expect(parseSchedule('{"1":"胸","3":"腿"}')).toEqual({ '1': '胸', '3': '腿' })
  })
  it('坏数据回退空对象', () => {
    expect(parseSchedule('not-json')).toEqual({})
    expect(parseSchedule('[1,2]')).toEqual({})
    expect(parseSchedule('')).toEqual({})
    expect(parseSchedule('null')).toEqual({})
  })
  it('丢弃非法键与非法值', () => {
    expect(parseSchedule('{"1":"胸","8":"越界","0":"越界","2":123,"3":"  "}')).toEqual({ '1': '胸' })
  })
})

describe('normalizeSchedule', () => {
  it('只保留 1-7，值去空白', () => {
    expect(normalizeSchedule({ '1': '  胸  ', '8': 'x', '2': '' })).toEqual({ '1': '胸' })
  })
  it('undefined 返回空对象', () => {
    expect(normalizeSchedule(undefined)).toEqual({})
  })
  it('与 parseSchedule 互为往返', () => {
    const s = { '1': '胸', '5': '背' }
    expect(parseSchedule(scheduleToJson(s))).toEqual(s)
  })
})

describe('parseWorkoutContent', () => {
  const good = { name: '卧推', weight: 60, sets: 4, reps: 8 }
  it('解析合法数组', () => {
    expect(parseWorkoutContent(JSON.stringify([good]))).toEqual([good])
  })
  it('坏数据回退空数组', () => {
    expect(parseWorkoutContent('nope')).toEqual([])
    expect(parseWorkoutContent('{"a":1}')).toEqual([])
    expect(parseWorkoutContent('')).toEqual([])
  })
  it('逐项校验，坏的丢弃、好的保留', () => {
    const raw = JSON.stringify([
      good,
      { name: '', weight: 60, sets: 4, reps: 8 },
      { name: '深蹲', weight: 'x', sets: 4, reps: 8 },
      { name: '硬拉', weight: 100, sets: 0, reps: 8 },
      { name: '划船', weight: 50, sets: 3, reps: 2.5 }
    ])
    expect(parseWorkoutContent(raw).map((i) => i.name)).toEqual(['卧推'])
  })
  it('自重动作（weight 0）是合法的', () => {
    const self = { name: '引体向上', weight: 0, sets: 4, reps: 10 }
    expect(parseWorkoutContent(JSON.stringify([self]))).toEqual([self])
  })
})

describe('normalizeWorkoutContent', () => {
  it('名称去空白、数值修正到合法范围', () => {
    expect(normalizeWorkoutContent([{ name: '  卧推 ', weight: -5, sets: 0, reps: 1.7 }]))
      .toEqual([{ name: '卧推', weight: 0, sets: 1, reps: 2 }])
  })
  it('丢弃空名称项', () => {
    expect(normalizeWorkoutContent([{ name: '  ', weight: 1, sets: 1, reps: 1 }])).toEqual([])
  })
  it('undefined 返回空数组', () => {
    expect(normalizeWorkoutContent(undefined)).toEqual([])
  })
  it('与 parseWorkoutContent 互为往返', () => {
    const items = [{ name: '卧推', weight: 60, sets: 4, reps: 8 }]
    expect(parseWorkoutContent(workoutContentToJson(items))).toEqual(items)
  })
})

describe('WEEKDAY_LABELS', () => {
  it('覆盖 1-7 且从周一开始', () => {
    expect(Object.keys(WEEKDAY_LABELS).sort()).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(WEEKDAY_LABELS['1']).toBe('周一')
    expect(WEEKDAY_LABELS['7']).toBe('周日')
  })
})
