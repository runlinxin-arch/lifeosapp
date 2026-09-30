export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function todayStr(): string {
  return toDateStr(new Date())
}

export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

export function diffDays(a: string, b: string): number {
  const ms = new Date(a + 'T00:00:00').getTime() - new Date(b + 'T00:00:00').getTime()
  return Math.round(ms / 86400000)
}

export function formatCn(dateStr: string): string {
  const [, m, d] = dateStr.split('-')
  return `${Number(m)}/${Number(d)}`
}

/** 'YYYY-MM-DD HH:MM' → Date（本地时区） */
export function parseLocal(s: string): Date {
  return new Date(`${s.slice(0, 10)}T${s.slice(11, 16)}:00`)
}

/** Date → 'YYYY-MM-DD HH:MM'（本地时区） */
export function formatLocal(d: Date): string {
  return `${toDateStr(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** 'YYYY-MM-DD HH:MM' → 'YYYY-MM-DD' */
export function datePart(s: string): string {
  return s.slice(0, 10)
}

/** 'YYYY-MM-DD HH:MM' → 'HH:MM' */
export function timePart(s: string): string {
  return s.slice(11, 16)
}

/** 'HH:MM' → 自 0 点起的分钟数 */
export function timeToMinutes(t: string): number {
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
}

/** 月份序号：2026-01 → 24312（跨年可比） */
export function monthIndex(dateStr: string): number {
  return Number(dateStr.slice(0, 4)) * 12 + (Number(dateStr.slice(5, 7)) - 1)
}

/** 加 n 个月；日超出目标月天数时夹到月末（始终以原日为准，不累积漂移） */
export function addMonthsClamped(dateStr: string, n: number): string {
  const mi = monthIndex(dateStr) + n
  const y = Math.floor(mi / 12)
  const m = (mi % 12) + 1
  const day = Number(dateStr.slice(8, 10))
  const last = new Date(y, m, 0).getDate()
  return `${y}-${pad2(m)}-${pad2(Math.min(day, last))}`
}
