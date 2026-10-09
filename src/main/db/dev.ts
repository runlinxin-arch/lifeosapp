import type { DatabaseSync } from 'node:sqlite'
import type {
  DevColumn, DevTask, DevTaskInput, DevTaskPatch, Priority,
  Project, ProjectInput, ProjectPatch, ProjectStatus
} from '@shared/types'
import { planMove } from '@shared/kanban'
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

const COLUMNS: readonly DevColumn[] = ['todo', 'doing', 'done']
/** 看板列顺序：待办 → 进行中 → 已完成 */
const COLUMN_ORDER: Record<DevColumn, number> = { todo: 0, doing: 1, done: 2 }
const PRIORITIES: readonly Priority[] = ['low', 'mid', 'high']
const PRIORITY_ORDER: Record<Priority, number> = { high: 0, mid: 1, low: 2 }

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

function assertPriority(p: string): void {
  if (!PRIORITIES.includes(p as Priority)) throw new Error(`优先级只能是 low / mid / high，收到：${p}`)
}

function assertColumn(c: string): void {
  if (!COLUMNS.includes(c as DevColumn)) throw new Error(`看板列只能是 todo / doing / done，收到：${c}`)
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

// ---------- 看板任务 ----------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asDevTask = (r: any): DevTask => r as DevTask

export function listDevTasks(db: DatabaseSync, projectId: number): DevTask[] {
  return db.prepare('SELECT * FROM dev_tasks WHERE project_id = ?').all(projectId).map(asDevTask)
    .sort((a, b) => COLUMN_ORDER[a.column_name] - COLUMN_ORDER[b.column_name]
      || a.position - b.position || a.id - b.id)
}

export function getDevTask(db: DatabaseSync, id: number): DevTask | null {
  const row = db.prepare('SELECT * FROM dev_tasks WHERE id = ?').get(id)
  return row ? asDevTask(row) : null
}

export function createDevTask(db: DatabaseSync, input: DevTaskInput): DevTask {
  const title = assertNonEmpty(input.title, '任务标题')
  if (!getProject(db, input.projectId)) throw new Error(`project ${input.projectId} not found`)
  const column = input.column ?? 'todo'
  assertColumn(column)
  if (input.priority !== undefined) assertPriority(input.priority)
  assertOptionalDates(input.startDate, input.dueDate, '开始日期', '截止日期')

  // 追加到目标列末尾
  const next = (db.prepare(
    'SELECT COALESCE(MAX(position), -1) + 1 AS p FROM dev_tasks WHERE project_id = ? AND column_name = ?'
  ).get(input.projectId, column) as { p: number }).p

  const info = db.prepare(`
    INSERT INTO dev_tasks (project_id, title, column_name, position, priority, start_date, due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(input.projectId, title, column, next, input.priority ?? 'mid',
    input.startDate ?? null, input.dueDate ?? null)
  return getDevTask(db, Number(info.lastInsertRowid))!
}

export function updateDevTask(db: DatabaseSync, id: number, patch: DevTaskPatch): DevTask {
  const cur = getDevTask(db, id)
  if (!cur) throw new Error(`dev_task ${id} not found`)

  const title = patch.title !== undefined ? assertNonEmpty(patch.title, '任务标题') : cur.title
  const priority = patch.priority ?? cur.priority
  assertPriority(priority)
  const start = patch.startDate !== undefined ? patch.startDate : cur.start_date
  const due = patch.dueDate !== undefined ? patch.dueDate : cur.due_date
  assertOptionalDates(start, due, '开始日期', '截止日期')

  db.prepare(`
    UPDATE dev_tasks SET title=?, priority=?, start_date=?, due_date=?,
      updated_at=datetime('now','localtime') WHERE id=?
  `).run(title, priority, start, due, id)
  return getDevTask(db, id)!
}

/** 把某列按当前顺序重排为 0..n-1 */
function renumberColumn(db: DatabaseSync, projectId: number, column: DevColumn): void {
  const rows = db.prepare(
    'SELECT id FROM dev_tasks WHERE project_id = ? AND column_name = ? ORDER BY position ASC, id ASC'
  ).all(projectId, column) as unknown as { id: number }[]
  const stmt = db.prepare('UPDATE dev_tasks SET position = ? WHERE id = ?')
  rows.forEach((r, i) => stmt.run(i, r.id))
}

export function deleteDevTask(db: DatabaseSync, id: number): void {
  const cur = getDevTask(db, id)
  if (!cur) return
  db.exec('BEGIN')
  try {
    db.prepare('DELETE FROM dev_tasks WHERE id = ?').run(id)
    renumberColumn(db, cur.project_id, cur.column_name)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

/** 移动任务：用 planMove 算出新位置分配，在一个事务里落库，返回该项目最新看板 */
export function moveDevTask(db: DatabaseSync, id: number, toColumn: DevColumn, toIndex: number): DevTask[] {
  const moving = getDevTask(db, id)
  if (!moving) throw new Error(`dev_task ${id} not found`)
  assertColumn(toColumn)

  const board = listDevTasks(db, moving.project_id)
  const planned = planMove(
    board.map((t) => ({ id: t.id, column: t.column_name, position: t.position })),
    id,
    toColumn,
    toIndex
  )

  db.exec('BEGIN')
  try {
    const stmt = db.prepare(
      "UPDATE dev_tasks SET column_name = ?, position = ?, updated_at = datetime('now','localtime') WHERE id = ?"
    )
    for (const item of planned) stmt.run(item.column, item.position, item.id)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  return listDevTasks(db, moving.project_id)
}
