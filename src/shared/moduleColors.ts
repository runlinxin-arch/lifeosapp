import type { ModuleKey } from './types'
import { MODULE_COLORS } from './types'
import { hexToRgb } from './themeExtract'

export { MODULE_COLORS }

/**
 * 浅色模式下的模块色：比深色版的「亮色」更深，保证作为文字/状态色时
 * 在浅色底（#f5f6f8）上有 ≥4.5:1 的对比度（WCAG AA）。
 * 深色版（MODULE_COLORS）是为深色底设计的亮色，直接用于浅色底会偏淡。
 */
export const LIGHT_MODULE_COLORS: Record<ModuleKey, string> = {
  schedule: '#4f46e5',
  learning: '#15803d',
  dev: '#1d4ed8',
  inspiration: '#be185d',
  fitness: '#b91c1c',
  diet: '#b45309'
}

/** 独立长期任务的灰色（深色 / 浅色） */
export const STANDALONE_DARK = '#8b8d98'
export const STANDALONE_LIGHT = '#4b5563'

export type ThemeMode = 'dark' | 'light'

export function moduleColor(module: ModuleKey, mode: ThemeMode): string {
  return (mode === 'light' ? LIGHT_MODULE_COLORS : MODULE_COLORS)[module]
}

// ---------- 对比度工具（供单测校验浅色模块色可读性） ----------

function channel(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/** WCAG 相对亮度（0–1） */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG 对比度（1–21），越大越清晰 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}
