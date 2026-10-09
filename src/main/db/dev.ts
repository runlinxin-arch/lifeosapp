import type { DatabaseSync } from 'node:sqlite'
import type {
  Bug, BugInput, BugPatch, BugStatus,
  DevColumn, DevSession, DevTask, DevTaskInput, DevTaskPatch, Priority,
  Project, ProjectInput, ProjectPatch, ProjectStatus,
  Snippet, SnippetInput, SnippetPatch,
  TechNote, TechNoteInput, TechNotePatch
} from '@shared/types'
import { planMove } from '@shared/kanban'
import { filterSnippets, parseTags, type SnippetFilter } from '@shared/snippetFilter'
import { assertDateStr, assertNonEmpty } from './validate'
import { removeBySource } from './longTasks'

export type { SnippetFilter } from '@shared/snippetFilter'

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
const BUG_STATUSES: readonly BugStatus[] = ['open', 'fixing', 'fixed']
/** Bug 列表顺序：未修 → 修复中 → 已修复 */
const BUG_ORDER: Record<BugStatus, number> = { open: 0, fixing: 1, fixed: 2 }

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

function assertBugStatus(s: string): void {
  if (!BUG_STATUSES.includes(s as BugStatus)) {
    throw new Error(`Bug 状态只能是 open / fixing / fixed，收到：${s}`)
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

// ---------- Bug ----------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asBug = (r: any): Bug => r as Bug
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asSnippet = (r: any): Snippet => ({ ...r, tags: parseTags(String(r.tags ?? '[]')) })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asTechNote = (r: any): TechNote => r as TechNote

export function listBugs(db: DatabaseSync, projectId: number): Bug[] {
  return db.prepare('SELECT * FROM bugs WHERE project_id = ?').all(projectId).map(asBug)
    .sort((a, b) => BUG_ORDER[a.status] - BUG_ORDER[b.status]
      || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.id - b.id)
}

export function getBug(db: DatabaseSync, id: number): Bug | null {
  const row = db.prepare('SELECT * FROM bugs WHERE id = ?').get(id)
  return row ? asBug(row) : null
}

export function createBug(db: DatabaseSync, input: BugInput): Bug {
  const title = assertNonEmpty(input.title, 'Bug 标题')
  if (!getProject(db, input.projectId)) throw new Error(`project ${input.projectId} not found`)
  const priority = input.priority ?? 'mid'
  const status = input.status ?? 'open'
  assertPriority(priority)
  assertBugStatus(status)

  const info = db.prepare(`
    INSERT INTO bugs (project_id, title, description, priority, status) VALUES (?, ?, ?, ?, ?)
  `).run(input.projectId, title, input.description ?? '', priority, status)
  return getBug(db, Number(info.lastInsertRowid))!
}

export function updateBug(db: DatabaseSync, id: number, patch: BugPatch): Bug {
  const cur = getBug(db, id)
  if (!cur) throw new Error(`bug ${id} not found`)
  const title = patch.title !== undefined ? assertNonEmpty(patch.title, 'Bug 标题') : cur.title
  const priority = patch.priority ?? cur.priority
  const status = patch.status ?? cur.status
  assertPriority(priority)
  assertBugStatus(status)

  db.prepare(`
    UPDATE bugs SET title=?, description=?, priority=?, status=?,
      updated_at=datetime('now','localtime') WHERE id=?
  `).run(title, patch.description ?? cur.description, priority, status, id)
  return getBug(db, id)!
}

export function deleteBug(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM bugs WHERE id = ?').run(id)
}

// ---------- 代码片段 ----------

/** 标签规范化：去空白、去空项、去重（保持首次出现顺序） */
function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags) return []
  const out: string[] = []
  for (const t of tags) {
    const v = String(t).trim()
    if (v && !out.includes(v)) out.push(v)
  }
  return out
}

export function listSnippets(db: DatabaseSync): Snippet[] {
  return db.prepare('SELECT * FROM snippets ORDER BY id DESC').all().map(asSnippet)
}

export function getSnippet(db: DatabaseSync, id: number): Snippet | null {
  const row = db.prepare('SELECT * FROM snippets WHERE id = ?').get(id)
  return row ? asSnippet(row) : null
}

export function createSnippet(db: DatabaseSync, input: SnippetInput): Snippet {
  const title = assertNonEmpty(input.title, '片段标题')
  const info = db.prepare(`
    INSERT INTO snippets (title, code, language, tags) VALUES (?, ?, ?, ?)
  `).run(title, input.code ?? '', input.language ?? '', JSON.stringify(normalizeTags(input.tags)))
  return getSnippet(db, Number(info.lastInsertRowid))!
}

export function updateSnippet(db: DatabaseSync, id: number, patch: SnippetPatch): Snippet {
  const cur = getSnippet(db, id)
  if (!cur) throw new Error(`snippet ${id} not found`)
  const title = patch.title !== undefined ? assertNonEmpty(patch.title, '片段标题') : cur.title
  db.prepare(`
    UPDATE snippets SET title=?, code=?, language=?, tags=?,
      updated_at=datetime('now','localtime') WHERE id=?
  `).run(
    title,
    patch.code ?? cur.code,
    patch.language ?? cur.language,
    JSON.stringify(patch.tags !== undefined ? normalizeTags(patch.tags) : cur.tags),
    id
  )
  return getSnippet(db, id)!
}

export function deleteSnippet(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM snippets WHERE id = ?').run(id)
}

export function searchSnippets(db: DatabaseSync, filter: SnippetFilter): Snippet[] {
  return filterSnippets(listSnippets(db), filter)
}

// ---------- 技术笔记 ----------

export function listTechNotes(db: DatabaseSync): TechNote[] {
  return db.prepare('SELECT * FROM tech_notes ORDER BY id DESC').all().map(asTechNote)
}

export function getTechNote(db: DatabaseSync, id: number): TechNote | null {
  const row = db.prepare('SELECT * FROM tech_notes WHERE id = ?').get(id)
  return row ? asTechNote(row) : null
}

export function createTechNote(db: DatabaseSync, input: TechNoteInput): TechNote {
  const title = assertNonEmpty(input.title, '笔记标题')
  const pid = input.projectId ?? null
  if (pid !== null && !getProject(db, pid)) throw new Error(`project ${pid} not found`)
  const info = db.prepare('INSERT INTO tech_notes (title, content, project_id) VALUES (?, ?, ?)')
    .run(title, input.content ?? '', pid)
  return getTechNote(db, Number(info.lastInsertRowid))!
}

export function updateTechNote(db: DatabaseSync, id: number, patch: TechNotePatch): TechNote {
  const cur = getTechNote(db, id)
  if (!cur) throw new Error(`tech_note ${id} not found`)
  const title = patch.title !== undefined ? assertNonEmpty(patch.title, '笔记标题') : cur.title
  const pid = patch.projectId !== undefined ? patch.projectId : cur.project_id
  if (pid !== null && !getProject(db, pid)) throw new Error(`project ${pid} not found`)

  db.prepare(`
    UPDATE tech_notes SET title=?, content=?, project_id=?,
      updated_at=datetime('now','localtime') WHERE id=?
  `).run(title, patch.content ?? cur.content, pid, id)
  return getTechNote(db, id)!
}

export function deleteTechNote(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM tech_notes WHERE id = ?').run(id)
}

// ---------- 开发计时 ----------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asSession = (r: any): DevSession => r as DevSession

/** 'YYYY-MM-DD HH:MM' 的格式与日历校验（与 events 的时间格式一致） */
function assertDateTime(v: string, label: string): void {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v)) {
    throw new Error(`${label}必须是 YYYY-MM-DD HH:MM 格式，收到：${v}`)
  }
  assertDateStr(v.slice(0, 10), label)
  const hh = Number(v.slice(11, 13))
  const mm = Number(v.slice(14, 16))
  if (hh > 23 || mm > 59) throw new Error(`${label}不是有效时间：${v}`)
}

/**
 * 开发计时记录。
 * 只记录**已结束**的会话——进行中的计时器状态保存在渲染端内存里，
 * 应用崩溃不会在库里留下没有结束时间的悬挂记录。
 */
export function listDevSessions(db: DatabaseSync, taskId?: number): DevSession[] {
  const sql = taskId === undefined
    ? 'SELECT * FROM dev_sessions ORDER BY started_at ASC, id ASC'
    : 'SELECT * FROM dev_sessions WHERE task_id = ? ORDER BY started_at ASC, id ASC'
  const rows = taskId === undefined ? db.prepare(sql).all() : db.prepare(sql).all(taskId)
  return (rows as unknown as DevSession[]).map(asSession)
}

export function createDevSession(
  db: DatabaseSync,
  taskId: number,
  startedAt: string,
  endedAt: string,
  minutes: number
): DevSession {
  assertDateTime(startedAt, '开始时间')
  assertDateTime(endedAt, '结束时间')
  if (endedAt < startedAt) throw new Error('结束时间不能早于开始时间')
  if (!Number.isInteger(minutes) || minutes < 1) throw new Error('开发时长必须是 ≥1 的整数分钟')
  if (!getDevTask(db, taskId)) throw new Error(`dev_task ${taskId} not found`)

  const info = db.prepare(`
    INSERT INTO dev_sessions (task_id, started_at, ended_at, minutes) VALUES (?, ?, ?, ?)
  `).run(taskId, startedAt, endedAt, minutes)
  return db.prepare('SELECT * FROM dev_sessions WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as unknown as DevSession
}

export function deleteDevSession(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM dev_sessions WHERE id = ?').run(id)
}

/** 按项目汇总时长（只包含有记录的项目） */
export function minutesByProject(db: DatabaseSync): Map<number, number> {
  const out = new Map<number, number>()
  for (const r of db.prepare(`
    SELECT t.project_id AS project_id, COALESCE(SUM(s.minutes), 0) AS m
    FROM dev_sessions s JOIN dev_tasks t ON s.task_id = t.id
    GROUP BY t.project_id
  `).all() as unknown as { project_id: number; m: number }[]) {
    out.set(r.project_id, r.m)
  }
  return out
}

/** 按任务汇总时长，仅限指定项目 */
export function minutesByTask(db: DatabaseSync, projectId: number): Map<number, number> {
  const out = new Map<number, number>()
  for (const r of db.prepare(`
    SELECT s.task_id AS task_id, COALESCE(SUM(s.minutes), 0) AS m
    FROM dev_sessions s JOIN dev_tasks t ON s.task_id = t.id
    WHERE t.project_id = ?
    GROUP BY s.task_id
  `).all(projectId) as unknown as { task_id: number; m: number }[]) {
    out.set(r.task_id, r.m)
  }
  return out
}
