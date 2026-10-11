import type { Settings } from '@shared/settings'
import { resolveTheme } from '@shared/theme'

export { DARK_PALETTE, LIGHT_PALETTE, resolveTheme } from '@shared/theme'

/** 把当前设置即时写到 CSS 变量上（主题应用；首屏前的初始化见 themeInit.ts） */
export function applyTheme(s: Pick<Settings, 'theme.mode' | 'theme.accent' | 'theme.custom'>): void {
  const root = document.documentElement
  const p = resolveTheme(s['theme.mode'], s['theme.accent'], s['theme.custom'])
  for (const [k, v] of Object.entries(p)) root.style.setProperty(`--${k}`, v)
  root.dataset.theme = s['theme.mode']
}
