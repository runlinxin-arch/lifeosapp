import { Notification, type BrowserWindow } from 'electron'
import type { DatabaseSync } from 'node:sqlite'
import { listOccurrences } from './db/events'
import { getAllSettings } from './db/settings'
import { dueReminders } from '@shared/reminders'
import { addDays, todayStr } from '@shared/dates'

export const REMINDER_INTERVAL_MS = 30000

/**
 * 主进程轮询：每 30 秒查一次未来 24 小时的发生项，到点前按各自提前量发系统通知。
 * 返回停止函数，供 app 退出时清理定时器。
 */
export function startReminders(
  db: DatabaseSync,
  getWindow: () => BrowserWindow | null,
  intervalMs: number = REMINDER_INTERVAL_MS
): () => void {
  const fired = new Set<string>()

  const tick = (): void => {
    const settings = getAllSettings(db)
    if (!settings['remind.enabled']) return

    const today = todayStr()
    const tomorrow = addDays(today, 1)
    // 清掉今天与明天之外的去重键，避免集合无限增长
    for (const k of fired) {
      if (!k.endsWith(`@${today}`) && !k.endsWith(`@${tomorrow}`)) fired.delete(k)
    }

    const occurrences = listOccurrences(db, today, tomorrow)
    for (const hit of dueReminders(new Date(), occurrences, fired)) {
      fired.add(hit.key)
      const notification = new Notification({
        title: 'LifeOS 提醒',
        body: `${hit.title} · ${hit.startAt.slice(11)}`
      })
      notification.on('click', () => {
        const win = getWindow()
        if (!win) return
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
      })
      notification.show()
    }
  }

  tick()
  const timer = setInterval(tick, intervalMs)
  return () => clearInterval(timer)
}
