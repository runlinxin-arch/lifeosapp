import type { DatabaseSync } from 'node:sqlite'
import { DEFAULT_SETTINGS, SETTINGS_KEYS, type Settings, type SettingsKey } from '@shared/settings'

export * from '@shared/settings'

function validate(key: SettingsKey, value: unknown): void {
  if (key === 'timeline.rangeDays' && ![7, 30, 90].includes(value as number)) {
    throw new Error('时间轴显示范围只能是 7 / 30 / 90 天')
  }
  if (key === 'timeline.showDone' && typeof value !== 'boolean') {
    throw new Error('timeline.showDone 必须是布尔值')
  }
  if (key === 'remind.enabled' && typeof value !== 'boolean') {
    throw new Error('remind.enabled 必须是布尔值')
  }
  if (key === 'autoGameLog.enabled' && typeof value !== 'boolean') {
    throw new Error('autoGameLog.enabled 必须是布尔值')
  }
  if (key === 'remind.leadMinutes') {
    if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 1440) {
      throw new Error('提前提醒分钟数必须是 0–1440 的整数')
    }
  }
}

function assignSetting<K extends SettingsKey>(target: Settings, key: K, value: unknown): void {
  target[key] = value as Settings[K]
}

/** 读取全部设置：未设置的键取默认值；坏数据回退默认值而不阻塞启动 */
export function getAllSettings(db: DatabaseSync): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as unknown as { key: string; value: string }[]
  const out: Settings = { ...DEFAULT_SETTINGS }
  for (const r of rows) {
    const key = r.key as SettingsKey
    if (!SETTINGS_KEYS.includes(key)) continue
    try {
      const parsed: unknown = JSON.parse(r.value)
      validate(key, parsed)
      assignSetting(out, key, parsed)
    } catch {
      // 坏数据一律回退默认值
    }
  }
  return out
}

export function setSetting<K extends SettingsKey>(db: DatabaseSync, key: K, value: Settings[K]): Settings {
  validate(key, value)
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, JSON.stringify(value))
  return getAllSettings(db)
}
