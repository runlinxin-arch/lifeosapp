import { describe, it, expect } from 'vitest'
import {
  LIGHT_MODULE_COLORS, MODULE_COLORS, moduleColor, contrastRatio,
  STANDALONE_DARK, STANDALONE_LIGHT
} from '../src/shared/moduleColors'

// 浅色底色：与 src/renderer/src/lib/theme.ts 的 LIGHT_PALETTE.bg 一致
const LIGHT_BG = '#f5f6f8'

describe('浅色模块色对比度', () => {
  it('每个浅色模块色在浅色底上对比度 ≥ 4.5（WCAG AA）', () => {
    for (const [m, c] of Object.entries(LIGHT_MODULE_COLORS)) {
      expect(contrastRatio(c, LIGHT_BG), `${m} (${c}) 对比度不足`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('深色模块色（原值）保持不变', () => {
    expect(MODULE_COLORS.learning).toBe('#4ade80')
    expect(MODULE_COLORS.diet).toBe('#f39c12')
    expect(MODULE_COLORS.inspiration).toBe('#e879c9')
  })

  it('moduleColor 按模式返回对应变体', () => {
    expect(moduleColor('learning', 'dark')).toBe('#4ade80')
    expect(moduleColor('learning', 'light')).toBe('#15803d')
    expect(moduleColor('diet', 'light')).toBe('#b45309')
    expect(moduleColor('inspiration', 'light')).toBe('#be185d')
  })

  it('独立灰色在浅色底上也有足够对比度，深色值不变', () => {
    expect(STANDALONE_DARK).toBe('#8b8d98')
    expect(contrastRatio(STANDALONE_LIGHT, LIGHT_BG)).toBeGreaterThanOrEqual(4.5)
  })
})
