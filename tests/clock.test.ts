import { describe, it, expect } from 'vitest'
import { computeTimelineRange, msUntilNextMidnight } from '../src/renderer/src/lib/clock'

describe('computeTimelineRange', () => {
  it('默认向前 3 天、向后 30 天', () => {
    expect(computeTimelineRange('2026-09-30', 30)).toEqual({ from: '2026-09-27', to: '2026-10-30' })
  })

  it('支持 7 / 90 天范围设置', () => {
    expect(computeTimelineRange('2026-09-30', 7)).toEqual({ from: '2026-09-27', to: '2026-10-07' })
    expect(computeTimelineRange('2026-09-30', 90).to).toBe('2026-12-29')
  })

  it('月初与跨年都正确', () => {
    expect(computeTimelineRange('2026-09-01', 7)).toEqual({ from: '2026-08-29', to: '2026-09-08' })
    expect(computeTimelineRange('2026-12-30', 7)).toEqual({ from: '2026-12-27', to: '2027-01-06' })
  })

  it('过去天数可配置', () => {
    expect(computeTimelineRange('2026-09-30', 7, 0).from).toBe('2026-09-30')
    expect(computeTimelineRange('2026-09-30', 7, 10).from).toBe('2026-09-20')
  })

  it('非法范围天数回退到 30 天', () => {
    expect(computeTimelineRange('2026-09-30', 0).to).toBe('2026-10-30')
    expect(computeTimelineRange('2026-09-30', -5).to).toBe('2026-10-30')
    expect(computeTimelineRange('2026-09-30', NaN).to).toBe('2026-10-30')
  })

  it('每次调用都基于传入的今天重新计算（跨零点后范围随之滚动）', () => {
    const before = computeTimelineRange('2026-09-30', 7)
    const after = computeTimelineRange('2026-10-01', 7)
    expect(after.from).toBe('2026-09-28')
    expect(after.to).toBe('2026-10-08')
    expect(after.from).not.toBe(before.from)
  })
})

describe('msUntilNextMidnight', () => {
  it('零点整时是完整一天', () => {
    expect(msUntilNextMidnight(new Date('2026-09-30T00:00:00'))).toBe(86400000)
  })

  it('中午时是 12 小时', () => {
    expect(msUntilNextMidnight(new Date('2026-09-30T12:00:00'))).toBe(12 * 3600 * 1000)
  })

  it('当天最后一刻只剩不到 1 秒', () => {
    expect(msUntilNextMidnight(new Date('2026-09-30T23:59:59.500'))).toBe(500)
  })

  it('结果恒为正且不超过 24 小时', () => {
    for (const h of [0, 6, 12, 18, 23]) {
      const ms = msUntilNextMidnight(new Date(2026, 8, 30, h, 30))
      expect(ms).toBeGreaterThan(0)
      expect(ms).toBeLessThanOrEqual(86400000)
    }
  })

  it('跨月边界也正确（9 月只有 30 天）', () => {
    expect(msUntilNextMidnight(new Date('2026-09-30T22:00:00'))).toBe(2 * 3600 * 1000)
  })
})
