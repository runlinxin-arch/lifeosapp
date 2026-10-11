/**
 * 用户设置的默认值与类型（主进程与渲染进程共用）。
 * 注意：Settings 的取值必须显式声明宽度——若从 DEFAULT_SETTINGS 用 as const 反推，
 * 每个键会被推成字面量类型（如 rangeDays 只能是 30），除默认值外任何合法值都写不进去。
 */

export type ThemeMode = 'dark' | 'light'

/** 一组完整主题色板：网站风格模仿生成的覆盖色用它（可整体覆盖基调） */
export interface ThemePalette {
  bg: string
  card: string
  border: string
  accent: string
  text: string
  muted: string
}

export interface Settings {
  'timeline.rangeDays': 7 | 30 | 90
  'timeline.showDone': boolean
  'remind.enabled': boolean
  'remind.leadMinutes': number
  'theme.mode': ThemeMode
  'theme.accent': string
  'theme.custom': ThemePalette | null
}

export const DEFAULT_ACCENT = '#7c8cff'

export const DEFAULT_SETTINGS: Settings = {
  'timeline.rangeDays': 30,
  'timeline.showDone': false,
  'remind.enabled': true,
  'remind.leadMinutes': 15,
  'theme.mode': 'dark',
  'theme.accent': DEFAULT_ACCENT,
  'theme.custom': null
}

export type SettingsKey = keyof Settings

export const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS) as SettingsKey[]

const HEX_RE = /^#[0-9a-fA-F]{6}$/

/** 是否为 #rrggbb 形式的颜色（主题色 / 自定义主题 / 网站取色都按此口径） */
export function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && HEX_RE.test(v)
}

const PALETTE_KEYS: (keyof ThemePalette)[] = ['bg', 'card', 'border', 'accent', 'text', 'muted']

/** 是否为合法主题色板（6 个键都必须是 #rrggbb） */
export function isThemePalette(v: unknown): v is ThemePalette {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return PALETTE_KEYS.every((k) => isHexColor(o[k]))
}
