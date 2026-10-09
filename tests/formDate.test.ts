import { describe, it, expect } from 'vitest'
import { shouldFollowToday } from '../src/shared/formDate'

describe('shouldFollowToday', () => {
  it('未手动修改且日期落后于今天时跟随', () => {
    expect(shouldFollowToday({ touched: false, current: '2026-10-09', today: '2026-10-10' })).toBe(true)
  })

  it('已经是今天则不动作', () => {
    expect(shouldFollowToday({ touched: false, current: '2026-10-10', today: '2026-10-10' })).toBe(false)
  })

  it('用户手动改过日期就不再覆盖他的输入', () => {
    expect(shouldFollowToday({ touched: true, current: '2020-01-01', today: '2026-10-10' })).toBe(false)
    expect(shouldFollowToday({ touched: true, current: '', today: '2026-10-10' })).toBe(false)
  })
})
