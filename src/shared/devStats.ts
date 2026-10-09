import type { DevSession, DevTask } from './types'
import { datePart } from './dates'

/**
 * 区间内（含端点）按项目汇总开发时长。
 * - 只按日期比较，忽略具体时刻
 * - 任务不存在时该条记录被忽略（不抛错）
 */
export function minutesByProjectInRange(
  sessions: DevSession[],
  tasks: DevTask[],
  from: string,
  to: string
): Map<number, number> {
  const taskToProject = new Map(tasks.map((t) => [t.id, t.project_id]))
  const out = new Map<number, number>()

  for (const s of sessions) {
    const d = datePart(s.started_at)
    if (d < from || d > to) continue
    const pid = taskToProject.get(s.task_id)
    if (pid === undefined) continue
    out.set(pid, (out.get(pid) ?? 0) + s.minutes)
  }
  return out
}

/** 单个项目在给定区间内的开发时长 */
export function projectWeekMinutes(
  sessions: DevSession[],
  tasks: DevTask[],
  projectId: number,
  from: string,
  to: string
): number {
  return minutesByProjectInRange(sessions, tasks, from, to).get(projectId) ?? 0
}

/** 按任务汇总全部时长（看板卡片显示已计时长用） */
export function minutesByTask(sessions: DevSession[]): Map<number, number> {
  const out = new Map<number, number>()
  for (const s of sessions) out.set(s.task_id, (out.get(s.task_id) ?? 0) + s.minutes)
  return out
}
