/** 数据层输入校验：所有写库入口共用，避免脏数据静默落库 */

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const LOCAL_DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

/** 非空字符串校验，返回去掉首尾空白后的值 */
export function assertNonEmpty(value: string, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}不能为空`)
  return value.trim()
}

/** YYYY-MM-DD 格式 + 真实存在的日历日期（拒绝 2026-02-31、2025-02-29） */
export function assertDateStr(value: string, label: string): void {
  if (typeof value !== 'string' || !DATE_RE.test(value)) {
    throw new Error(`${label}必须是 YYYY-MM-DD 格式，收到：${String(value)}`)
  }
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
    throw new Error(`${label}不是有效日期：${value}`)
  }
}

/** 日期区间校验：两端合法且 end 不早于 start */
export function assertDateRange(
  start: string,
  end: string,
  startLabel = '开始日期',
  endLabel = '结束日期'
): void {
  assertDateStr(start, startLabel)
  assertDateStr(end, endLabel)
  if (end < start) throw new Error(`${endLabel}不能早于${startLabel}`)
}
