import { describe, it, expect, beforeEach } from 'vitest'
import { openDb } from '../src/main/db'
import { DEFAULT_SETTINGS, getAllSettings, setSetting } from '../src/main/db/settings'

let db: ReturnType<typeof openDb>
beforeEach(() => { db = openDb(':memory:') })

describe('settings', () => {
  it('空库返回全部默认值', () => {
    expect(getAllSettings(db)).toEqual(DEFAULT_SETTINGS)
  })

  it('写入后可读回，未设置的键仍是默认值', () => {
    setSetting(db, 'timeline.rangeDays', 90)
    const s = getAllSettings(db)
    expect(s['timeline.rangeDays']).toBe(90)
    expect(s['timeline.showDone']).toBe(false)
    expect(s['remind.leadMinutes']).toBe(15)
  })

  it('重复写同一个键是覆盖而不是追加', () => {
    setSetting(db, 'timeline.showDone', true)
    setSetting(db, 'timeline.showDone', false)
    expect(getAllSettings(db)['timeline.showDone']).toBe(false)
    expect((db.prepare('SELECT COUNT(*) c FROM settings').get() as { c: number }).c).toBe(1)
  })

  it('非法取值报错且不落库', () => {
    expect(() => setSetting(db, 'timeline.rangeDays', 45 as never)).toThrow('7 / 30 / 90')
    expect(() => setSetting(db, 'remind.leadMinutes', -1)).toThrow('提前提醒')
    expect(() => setSetting(db, 'remind.leadMinutes', 2000)).toThrow('提前提醒')
    expect(() => setSetting(db, 'remind.leadMinutes', 1.5)).toThrow('提前提醒')
    expect(() => setSetting(db, 'remind.enabled', 'yes' as never)).toThrow('布尔值')
    expect((db.prepare('SELECT COUNT(*) c FROM settings').get() as { c: number }).c).toBe(0)
    expect(getAllSettings(db)['timeline.rangeDays']).toBe(30)
  })

  it('三个合法范围值都可以写入', () => {
    for (const days of [7, 30, 90] as const) {
      setSetting(db, 'timeline.rangeDays', days)
      expect(getAllSettings(db)['timeline.rangeDays']).toBe(days)
    }
  })

  it('落库的是 JSON，能区分布尔与字符串', () => {
    setSetting(db, 'remind.enabled', false)
    const raw = db.prepare("SELECT value FROM settings WHERE key = 'remind.enabled'").get() as { value: string }
    expect(raw.value).toBe('false')
    expect(getAllSettings(db)['remind.enabled']).toBe(false)
  })

  it('坏数据回退到默认值而不抛错', () => {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('timeline.rangeDays', 'not-json')
    expect(getAllSettings(db)['timeline.rangeDays']).toBe(30)
  })

  it('越界的存量数据也回退默认值', () => {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('timeline.rangeDays', '45')
    expect(getAllSettings(db)['timeline.rangeDays']).toBe(30)
  })

  it('未知键被忽略，不影响其它设置', () => {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('unknown.key', '"x"')
    expect(getAllSettings(db)).toEqual(DEFAULT_SETTINGS)
  })

  it('设置持久化在库里，重开连接仍在', () => {
    setSetting(db, 'remind.leadMinutes', 45)
    expect(getAllSettings(db)['remind.leadMinutes']).toBe(45)
  })
})
