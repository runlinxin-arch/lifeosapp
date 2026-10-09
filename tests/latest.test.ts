import { describe, it, expect } from 'vitest'
import { LatestGuard } from '../src/renderer/src/lib/latest'

describe('LatestGuard', () => {
  it('单次请求：结果被接受', () => {
    const g = new LatestGuard()
    const isLatest = g.begin()
    expect(isLatest()).toBe(true)
  })

  it('后发起的请求会让先前的判定失效（慢响应被丢弃）', () => {
    const g = new LatestGuard()
    const first = g.begin()
    const second = g.begin()
    expect(first()).toBe(false)
    expect(second()).toBe(true)
  })

  it('连续三次：只有最后一次有效', () => {
    const g = new LatestGuard()
    const a = g.begin()
    const b = g.begin()
    const c = g.begin()
    expect([a(), b(), c()]).toEqual([false, false, true])
  })

  it('判定函数可重复调用且结果稳定', () => {
    const g = new LatestGuard()
    const first = g.begin()
    g.begin()
    expect(first()).toBe(false)
    expect(first()).toBe(false)
  })

  it('互不干扰的多个守卫各自独立', () => {
    const items = new LatestGuard()
    const boards = new LatestGuard()
    const i1 = items.begin()
    const b1 = boards.begin()
    const i2 = items.begin()
    expect(i1()).toBe(false)
    expect(b1()).toBe(true)
    expect(i2()).toBe(true)
  })

  it('真实时序：先发的慢响应后到，不会覆盖结果', async () => {
    const g = new LatestGuard()
    const applied: string[] = []

    const slow = async (): Promise<void> => {
      const isLatest = g.begin()
      await new Promise((r) => setTimeout(r, 50))
      if (isLatest()) applied.push('slow')
    }
    const fast = async (): Promise<void> => {
      const isLatest = g.begin()
      await new Promise((r) => setTimeout(r, 10))
      if (isLatest()) applied.push('fast')
    }

    await Promise.all([slow(), fast()])
    // slow 虽然最后返回，但已被 fast 取代，必须被丢弃
    expect(applied).toEqual(['fast'])
  })
})
