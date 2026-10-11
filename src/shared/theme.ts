import type { ThemeMode, ThemePalette } from './settings'

/** 深色基调（PRD 3.1 深色沉浸，M1 定的色板） */
export const DARK_PALETTE: ThemePalette = {
  bg: '#1e1f24',
  card: '#26272e',
  border: '#3a3b45',
  accent: '#7c8cff',
  text: '#e4e4e7',
  muted: '#8b8d98'
}

/** 浅色基调（M5 新增） */
export const LIGHT_PALETTE: ThemePalette = {
  bg: '#f5f6f8',
  card: '#ffffff',
  border: '#e2e4ea',
  accent: '#7c8cff',
  text: '#1f2430',
  muted: '#6b7280'
}

/**
 * 由设置解析出完整主题色板（主进程与渲染进程共用）：
 * - 深浅模式决定基础色板
 * - theme.accent 覆盖 accent（无自定义主题时）
 * - theme.custom 整组覆盖（网站风格模仿生成的主题）
 */
export function resolveTheme(mode: ThemeMode, accent: string, custom: ThemePalette | null): ThemePalette {
  const base = mode === 'light' ? LIGHT_PALETTE : DARK_PALETTE
  return {
    bg: custom?.bg ?? base.bg,
    card: custom?.card ?? base.card,
    border: custom?.border ?? base.border,
    accent: custom?.accent ?? accent,
    text: custom?.text ?? base.text,
    muted: custom?.muted ?? base.muted
  }
}
