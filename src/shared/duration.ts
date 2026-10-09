/** 时长与计时相关的纯函数：UI 与测试共用，不依赖 React */

/** 分钟数 → 人类可读（45 → 45m，90 → 1h 30m，120 → 2h） */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0m'
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

/** 秒数 → 计时器展示（mm:ss，超过 1 小时为 h:mm:ss） */
export function formatElapsed(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/** 已计秒数 → 入库分钟数：不足一分钟也至少记 1 分钟（避免计时白费） */
export function elapsedToMinutes(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 1
  return Math.max(1, Math.round(seconds / 60))
}
