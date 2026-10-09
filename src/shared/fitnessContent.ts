import type { WorkoutItem } from './types'

/**
 * 健身模块的 JSON 列处理：解析（容错）、规范化（修正）、序列化。
 * 坏数据一律回退到空值，不让界面炸掉——与 snippets.tags / inspirations.tags 的处理一致。
 */

export const WEEKDAY_LABELS: Record<string, string> = {
  '1': '周一',
  '2': '周二',
  '3': '周三',
  '4': '周四',
  '5': '周五',
  '6': '周六',
  '7': '周日'
}

const VALID_KEYS = new Set(Object.keys(WEEKDAY_LABELS))

/** 解析一周安排；坏 JSON / 非对象 / 非法键值一律丢弃 */
export function parseSchedule(raw: string): Record<string, string> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (!VALID_KEYS.has(k)) continue
    if (typeof v !== 'string') continue
    const trimmed = v.trim()
    if (trimmed) out[k] = trimmed
  }
  return out
}

/** 规范化一周安排：只保留 1–7，值去空白，空值即视为不练 */
export function normalizeSchedule(input: Record<string, string> | undefined): Record<string, string> {
  if (!input) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input)) {
    if (!VALID_KEYS.has(k)) continue
    const trimmed = String(v ?? '').trim()
    if (trimmed) out[k] = trimmed
  }
  return out
}

export function scheduleToJson(schedule: Record<string, string>): string {
  return JSON.stringify(normalizeSchedule(schedule))
}

/** 解析打卡动作；逐项校验，不合法的那一项丢弃（不整体失败） */
export function parseWorkoutContent(raw: string): WorkoutItem[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  const out: WorkoutItem[] = []
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue
    const { name, weight, sets, reps } = entry as Record<string, unknown>
    if (typeof name !== 'string' || !name.trim()) continue
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0) continue
    if (typeof sets !== 'number' || !Number.isInteger(sets) || sets < 1) continue
    if (typeof reps !== 'number' || !Number.isInteger(reps) || reps < 1) continue
    out.push({ name: name.trim(), weight, sets, reps })
  }
  return out
}

/**
 * 规范化打卡动作：与 parse 的区别是**修正而非丢弃**数值——
 * 重量负数归 0、组数与次数取整并夹到最小 1；空名称项仍然丢弃。
 */
export function normalizeWorkoutContent(input: WorkoutItem[] | undefined): WorkoutItem[] {
  if (!input) return []
  const out: WorkoutItem[] = []
  for (const entry of input) {
    const name = String(entry?.name ?? '').trim()
    if (!name) continue

    const rawWeight = Number(entry?.weight)
    const weight = Number.isFinite(rawWeight) && rawWeight > 0 ? rawWeight : 0

    const rawSets = Number(entry?.sets)
    const sets = Number.isFinite(rawSets) ? Math.max(1, Math.round(rawSets)) : 1

    const rawReps = Number(entry?.reps)
    const reps = Number.isFinite(rawReps) ? Math.max(1, Math.round(rawReps)) : 1

    out.push({ name, weight, sets, reps })
  }
  return out
}

export function workoutContentToJson(items: WorkoutItem[]): string {
  return JSON.stringify(normalizeWorkoutContent(items))
}
