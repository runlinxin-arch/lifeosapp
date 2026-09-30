import { describe, it, expect } from 'vitest'
import { FALLBACK_MESSAGE, formatIpcError } from '../src/renderer/src/lib/errors'

describe('formatIpcError', () => {
  it('剥掉 Electron 的 remote method 包装层', () => {
    expect(formatIpcError(new Error("Error invoking remote method 'tasks:create': Error: 待办标题不能为空")))
      .toBe('待办标题不能为空')
  })

  it('没有包装层时原样返回消息', () => {
    expect(formatIpcError(new Error('数据库损坏'))).toBe('数据库损坏')
  })

  it('字符串错误可用', () => {
    expect(formatIpcError('boom')).toBe('boom')
  })

  it('类 Error 的普通对象（带 message）也能取出原因', () => {
    expect(formatIpcError({ message: "Error invoking remote method 'longTasks:create': Error: 长期任务标题不能为空" }))
      .toBe('长期任务标题不能为空')
  })

  it('空消息 / undefined / null / 无 message 的对象都给兜底文案', () => {
    expect(formatIpcError(new Error(''))).toBe(FALLBACK_MESSAGE)
    expect(formatIpcError(new Error('   '))).toBe(FALLBACK_MESSAGE)
    expect(formatIpcError(undefined)).toBe(FALLBACK_MESSAGE)
    expect(formatIpcError(null)).toBe(FALLBACK_MESSAGE)
    expect(formatIpcError({ code: 5 })).toBe(FALLBACK_MESSAGE)
    expect(formatIpcError({ message: 42 })).toBe(FALLBACK_MESSAGE)
  })

  it('只剥离第一层 Error: 前缀，保留业务消息原貌', () => {
    expect(formatIpcError(new Error('Error: 结束时间不能早于开始时间'))).toBe('结束时间不能早于开始时间')
    expect(formatIpcError(new Error("Error invoking remote method 'x': Error: 优先级只能是 low / mid / high，收到：urgent")))
      .toBe('优先级只能是 low / mid / high，收到：urgent')
  })
})
