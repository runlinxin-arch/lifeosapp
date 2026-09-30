import { describe, it, expect } from 'vitest'
import { assertDateRange, assertDateStr, assertNonEmpty } from '../src/main/db/validate'

describe('assertNonEmpty', () => {
  it('返回去掉首尾空白后的值', () => {
    expect(assertNonEmpty('  写日报  ', '标题')).toBe('写日报')
  })

  it('空串、纯空白、非字符串都报错', () => {
    expect(() => assertNonEmpty('', '标题')).toThrow('标题不能为空')
    expect(() => assertNonEmpty('   ', '标题')).toThrow('标题不能为空')
    expect(() => assertNonEmpty(undefined as unknown as string, '标题')).toThrow('标题不能为空')
    expect(() => assertNonEmpty(null as unknown as string, '标题')).toThrow('标题不能为空')
  })
})

describe('assertDateStr', () => {
  it('接受合法日期（含闰年 2 月 29 日）', () => {
    expect(() => assertDateStr('2026-09-30', '日期')).not.toThrow()
    expect(() => assertDateStr('2024-02-29', '日期')).not.toThrow()
    expect(() => assertDateStr('2026-01-01', '日期')).not.toThrow()
  })

  it('拒绝格式错误的输入', () => {
    for (const bad of ['2026-9-30', '20260930', 'abc', '2026/09/30', '', '2026-09-30T00:00']) {
      expect(() => assertDateStr(bad, '日期')).toThrow('日期')
    }
  })

  it('拒绝格式正确但日历上不存在的日期', () => {
    expect(() => assertDateStr('2026-02-31', '日期')).toThrow('不是有效日期')
    expect(() => assertDateStr('2025-02-29', '日期')).toThrow('不是有效日期')
    expect(() => assertDateStr('2026-13-01', '日期')).toThrow('不是有效日期')
    expect(() => assertDateStr('2026-04-31', '日期')).toThrow('不是有效日期')
  })
})

describe('assertDateRange', () => {
  it('顺序正确时不报错', () => {
    expect(() => assertDateRange('2026-09-01', '2026-09-30')).not.toThrow()
  })

  it('同一天允许（是否满足"≥2 天"由上层业务规则决定）', () => {
    expect(() => assertDateRange('2026-09-30', '2026-09-30')).not.toThrow()
  })

  it('结束早于开始时报错', () => {
    expect(() => assertDateRange('2026-09-30', '2026-09-01')).toThrow('结束日期不能早于开始日期')
  })

  it('任一端非法时报错', () => {
    expect(() => assertDateRange('bad', '2026-09-30')).toThrow('开始日期')
    expect(() => assertDateRange('2026-09-01', '2026-02-31')).toThrow('结束日期')
  })
})
