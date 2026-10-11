import { describe, it, expect } from 'vitest'
import { DARK_PALETTE, LIGHT_PALETTE, resolveTheme } from '../src/shared/theme'

describe('resolveTheme', () => {
  it('深色返回深色板，accent 用传入值覆盖', () => {
    const p = resolveTheme('dark', '#4ade80', null)
    expect(p.bg).toBe(DARK_PALETTE.bg)
    expect(p.accent).toBe('#4ade80')
    expect(p.text).toBe(DARK_PALETTE.text)
  })

  it('浅色返回浅色板', () => {
    const p = resolveTheme('light', '#7c8cff', null)
    expect(p.bg).toBe(LIGHT_PALETTE.bg)
    expect(p.card).toBe(LIGHT_PALETTE.card)
    expect(p.accent).toBe('#7c8cff')
  })

  it('自定义主题整组覆盖', () => {
    const custom = { bg: '#111111', card: '#222222', border: '#333333', accent: '#4ade80', text: '#eeeeee', muted: '#999999' }
    expect(resolveTheme('dark', '#7c8cff', custom)).toEqual(custom)
    expect(resolveTheme('light', '#7c8cff', custom)).toEqual(custom)
  })
})
