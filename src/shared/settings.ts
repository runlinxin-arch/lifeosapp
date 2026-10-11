/**
 * 用户设置的默认值与类型（主进程与渲染进程共用）。
 * 注意：Settings 的取值必须显式声明宽度——若从 DEFAULT_SETTINGS 用 as const 反推，
 * 每个键会被推成字面量类型（如 rangeDays 只能是 30），除默认值外任何合法值都写不进去。
 */
export interface Settings {
  'timeline.rangeDays': 7 | 30 | 90
  'timeline.showDone': boolean
  'remind.enabled': boolean
  'remind.leadMinutes': number
  'autoGameLog.enabled': boolean
}

export const DEFAULT_SETTINGS: Settings = {
  'timeline.rangeDays': 30,
  'timeline.showDone': false,
  'remind.enabled': true,
  'remind.leadMinutes': 15,
  'autoGameLog.enabled': true
}

export type SettingsKey = keyof Settings

export const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS) as SettingsKey[]
