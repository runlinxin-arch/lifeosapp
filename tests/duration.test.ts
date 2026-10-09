import { describe, it, expect } from 'vitest'
import { elapsedToMinutes, formatDuration, formatElapsed } from '../src/shared/duration'

describe('formatDuration', () => {
  it('不足一小时按分钟展示', () => {
    expect(formatDuration(0)).toBe('0m')
    expect(formatDuration(1)).toBe('1m')
    expect(formatDuration(45)).toBe('45m')
    expect(formatDuration(59)).toBe('59m')
  })

  it('整小时只显示小时', () => {
    expect(formatDuration(60)).toBe('1h')
    expect(formatDuration(120)).toBe('2h')
  })

  it('小时+分钟', () => {
    expect(formatDuration(61)).toBe('1h 1m')
    expect(formatDuration(90)).toBe('1h 30m')
    expect(formatDuration(155)).toBe('2h 35m')
  })

  it('非法输入回退 0m', () => {
    expect(formatDuration(-5)).toBe('0m')
    expect(formatDuration(NaN)).toBe('0m')
  })
})

describe('formatElapsed', () => {
  it('不足一小时用 mm:ss', () => {
    expect(formatElapsed(0)).toBe('00:00')
    expect(formatElapsed(5)).toBe('00:05')
    expect(formatElapsed(65)).toBe('01:05')
    expect(formatElapsed(599)).toBe('09:59')
  })

  it('超过一小时用 h:mm:ss', () => {
    expect(formatElapsed(3600)).toBe('1:00:00')
    expect(formatElapsed(3661)).toBe('1:01:01')
  })

  it('小数秒向下取整', () => {
    expect(formatElapsed(59.9)).toBe('00:59')
  })

  it('非法输入回退 00:00', () => {
    expect(formatElapsed(-1)).toBe('00:00')
    expect(formatElapsed(NaN)).toBe('00:00')
  })
})

describe('elapsedToMinutes', () => {
  it('不足一分钟也至少记 1 分钟', () => {
    expect(elapsedToMinutes(0)).toBe(1)
    expect(elapsedToMinutes(20)).toBe(1)
    expect(elapsedToMinutes(-10)).toBe(1)
  })

  it('四舍五入到最近分钟', () => {
    expect(elapsedToMinutes(89)).toBe(1)
    expect(elapsedToMinutes(90)).toBe(2)
    expect(elapsedToMinutes(150)).toBe(3)
  })

  it('整分钟精确', () => {
    expect(elapsedToMinutes(600)).toBe(10)
    expect(elapsedToMinutes(3600)).toBe(60)
  })
})
