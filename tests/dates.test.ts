import { describe, it, expect } from 'vitest'
import {
  toDateStr, addDays, diffDays, formatCn, todayStr,
  parseLocal, formatLocal, datePart, timePart, timeToMinutes, monthIndex, addMonthsClamped
} from '../src/renderer/src/lib/dates'
import * as sharedDates from '../src/shared/dates'

describe('dates', () => {
  it('toDateStr formats local date', () => {
    expect(toDateStr(new Date(2026, 8, 29))).toBe('2026-09-29')
  })
  it('addDays crosses month boundary', () => {
    expect(addDays('2026-09-29', 3)).toBe('2026-10-02')
    expect(addDays('2026-10-02', -3)).toBe('2026-09-29')
  })
  it('diffDays is inclusive-safe', () => {
    expect(diffDays('2026-10-02', '2026-09-29')).toBe(3)
  })
  it('formatCn strips leading zeros', () => {
    expect(formatCn('2026-09-29')).toBe('9/29')
    expect(formatCn('2026-01-05')).toBe('1/5')
  })
  it('渲染端 lib/dates 与 shared/dates 是同一份实现（re-export 不产生分叉）', () => {
    expect(todayStr()).toBe(sharedDates.todayStr())
    expect(addDays).toBe(sharedDates.addDays)
    expect(addMonthsClamped).toBe(sharedDates.addMonthsClamped)
  })
})

describe('日期时间助手', () => {
  it('datePart / timePart 切分 YYYY-MM-DD HH:MM', () => {
    expect(datePart('2026-09-30 09:05')).toBe('2026-09-30')
    expect(timePart('2026-09-30 09:05')).toBe('09:05')
  })

  it('parseLocal 与 formatLocal 互逆（本地时区）', () => {
    const s = '2026-09-30 09:05'
    expect(formatLocal(parseLocal(s))).toBe(s)
    expect(parseLocal(s).getHours()).toBe(9)
  })

  it('timeToMinutes 换算', () => {
    expect(timeToMinutes('00:00')).toBe(0)
    expect(timeToMinutes('09:05')).toBe(545)
    expect(timeToMinutes('23:59')).toBe(1439)
  })

  it('monthIndex 跨年连续', () => {
    expect(monthIndex('2026-12-01') - monthIndex('2026-01-01')).toBe(11)
    expect(monthIndex('2027-01-01') - monthIndex('2026-12-01')).toBe(1)
  })

  it('addMonthsClamped 把 31 号夹到短月月末，且不累积漂移', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31')
    expect(addMonthsClamped('2026-01-31', 3)).toBe('2026-04-30')
  })

  it('addMonthsClamped 处理闰年 2 月', () => {
    expect(addMonthsClamped('2024-01-31', 1)).toBe('2024-02-29')
  })

  it('weekdayCn 返回中文星期（周一为一周第二天）', () => {
    expect(sharedDates.weekdayCn('2026-10-09')).toBe('周五')
    expect(sharedDates.weekdayCn('2026-10-05')).toBe('周一')
    expect(sharedDates.weekdayCn('2026-10-11')).toBe('周日')
  })
})
