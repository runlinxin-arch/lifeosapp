import type { DatabaseSync } from 'node:sqlite'
import type { Project, ProjectInput, ProjectPatch, ProjectStatus } from '@shared/types'
import { assertDateStr, assertNonEmpty } from './validate'
import { removeBySource } from './longTasks'

export type {
  ProjectInput, ProjectPatch, ProjectStatus,
  DevTaskInput, DevTaskPatch, DevColumn,
  BugInput, BugPatch, BugStatus,
  SnippetInput, SnippetPatch,
  TechNoteInput, TechNotePatch
} from '@shared/types'

const PROJECT_STATUSES: readonly ProjectStatus[] = ['planned', 'in_progress', 'paused', 'done']
/** 列表展示顺序：计划中 → 开发中 → 暂停 → 已完成 */
const PROJECT_ORDER: Record<ProjectStatus, number> = { planned: 0, in_progress: 1, paused: 2, done: 3 }

export interface ProjectStats {
  taskTotal: number
  taskDone: number
  openBugs: number
  minutes: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asProject = (r: any): Project => r as Project

function assertProjectStatus(s: string): void {
  if (!PROJECT_STATUSES.includes(s as ProjectStatus)) {
    throw new Error(`项目状态只能是 planned / in_progress / paused / done，收到：${s}`)
  }
}

/** 两端都给出时才校验区间；单端可空 */
function assertOptionalDates(
  start: string | null | undefined,
  end: string | null | undefined,
  startLabel = '开始日期',
  endLabel = '结束日期'
): void {
  if (start) assertDateStr(start, startLabel)
  if (end) assertDateStr(end, endLabel)
  if (start && end && end < start) throw new Error(`${endLabel}不能早于${startLabel}`)
}

export function listProjects(db: DatabaseSync): Project[] {
  return db.prepare('SELECT * FROM projects').all().map(asProject)
    .sort((a, b) => PROJECT_ORDER[a.status] - PROJECT_ORDER[b.status] || a.id - b.id)
}

export function getProject(db: DatabaseSync, id: number): Project | null {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id)
  return row ? asProject(row) : null
}

export function createProject(db: DatabaseSync, input: ProjectInput): Project {
  const name = assertNonEmpty(input.name, '项目名称')
  const status = input.status ?? 'planned'
  assertProjectStatus(status)
  assertOptionalDates(input.startDate, input.endDate)

  const info = db.prepare(`
    INSERT INTO projects (name, status, description, start_date, end_date) VALUES (?, ?, ?, ?, ?)
  `).run(name, status, input.description ?? '', input.startDate ?? null, input.endDate ?? null)
  return getProject(db, Number(info.lastInsertRowid))!
}

export function updateProject(db: DatabaseSync, id: number, patch: ProjectPatch): Project {
  const cur = getProject(db, id)
  if (!cur) throw new Error(`project ${id} not found`)

  const name = patch.name !== undefined ? assertNonEmpty(patch.name, '项目名称') : cur.name
  const status = patch.status ?? cur.status
  assertProjectStatus(status)
  const start = patch.startDate !== undefined ? patch.startDate : cur.start_date
  const end = patch.endDate !== undefined ? patch.endDate : cur.end_date
  assertOptionalDates(start, end)

  db.prepare(`
    UPDATE projects SET name=?, status=?, description=?, start_date=?, end_date=?,
      updated_at=datetime('now','localtime') WHERE id=?
  `).run(name, status, patch.description ?? cur.description, start, end, id)
  return getProject(db, id)!
}

/** 删除项目：任务/Bug/计时由外键级联删除，笔记解绑（SET NULL），并清掉长期任务色块 */
export function deleteProject(db: DatabaseSync, id: number): void {
  db.exec('BEGIN')
  try {
    db.prepare('DELETE FROM projects WHERE id = ?').run(id)
    removeBySource(db, 'dev', id)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export function projectStats(db: DatabaseSync, projectId: number): ProjectStats {
  const taskTotal = (db.prepare('SELECT COUNT(*) c FROM dev_tasks WHERE project_id = ?')
    .get(projectId) as { c: number }).c
  const taskDone = (db.prepare("SELECT COUNT(*) c FROM dev_tasks WHERE project_id = ? AND column_name = 'done'")
    .get(projectId) as { c: number }).c
  const openBugs = (db.prepare("SELECT COUNT(*) c FROM bugs WHERE project_id = ? AND status <> 'fixed'")
    .get(projectId) as { c: number }).c
  const minutes = (db.prepare(`
    SELECT COALESCE(SUM(s.minutes), 0) AS m
    FROM dev_sessions s JOIN dev_tasks t ON s.task_id = t.id
    WHERE t.project_id = ?
  `).get(projectId) as { m: number }).m
  return { taskTotal, taskDone, openBugs, minutes }
}

/** 列表页一次性取回所有项目统计，避免 N+1 查询 */
export function listProjectStats(db: DatabaseSync): Map<number, ProjectStats> {
  const out = new Map<number, ProjectStats>()
  for (const p of listProjects(db)) out.set(p.id, { taskTotal: 0, taskDone: 0, openBugs: 0, minutes: 0 })

  for (const r of db.prepare(`
    SELECT project_id, COUNT(*) AS total,
           SUM(CASE WHEN column_name = 'done' THEN 1 ELSE 0 END) AS done
    FROM dev_tasks GROUP BY project_id
  `).all() as unknown as { project_id: number; total: number; done: number }[]) {
    const s = out.get(r.project_id)
    if (s) { s.taskTotal = r.total; s.taskDone = r.done }
  }

  for (const r of db.prepare(`
    SELECT project_id, COUNT(*) AS c FROM bugs WHERE status <> 'fixed' GROUP BY project_id
  `).all() as unknown as { project_id: number; c: number }[]) {
    const s = out.get(r.project_id)
    if (s) s.openBugs = r.c
  }

  for (const r of db.prepare(`
    SELECT t.project_id AS project_id, COALESCE(SUM(s.minutes), 0) AS m
    FROM dev_sessions s JOIN dev_tasks t ON s.task_id = t.id
    GROUP BY t.project_id
  `).all() as unknown as { project_id: number; m: number }[]) {
    const s = out.get(r.project_id)
    if (s) s.minutes = r.m
  }

  return out
}
