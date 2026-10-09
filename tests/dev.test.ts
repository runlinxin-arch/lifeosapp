import { describe, it, expect, beforeEach } from 'vitest'
import { openDb } from '../src/main/db'
import {
  listProjects, getProject, createProject, updateProject, deleteProject, projectStats, listProjectStats,
  listDevTasks, createDevTask, updateDevTask, deleteDevTask, moveDevTask,
  listBugs, createBug, updateBug, deleteBug,
  listSnippets, createSnippet, updateSnippet, deleteSnippet, searchSnippets,
  listTechNotes, createTechNote, updateTechNote, deleteTechNote,
  listDevSessions, createDevSession, deleteDevSession, minutesByProject, minutesByTask
} from '../src/main/db/dev'
import { listRange } from '../src/main/db/longTasks'

let db: ReturnType<typeof openDb>
beforeEach(() => { db = openDb(':memory:') })

/** 统计类用例直接建夹具，避免依赖后续任务才实现的任务/Bug/计时函数 */
function seedBoard(projectId: number): void {
  db.prepare("INSERT INTO dev_tasks (project_id, title, column_name, position) VALUES (?, 'T1', 'done', 0)").run(projectId)
  db.prepare("INSERT INTO dev_tasks (project_id, title, column_name, position) VALUES (?, 'T2', 'todo', 0)").run(projectId)
  db.prepare("INSERT INTO dev_tasks (project_id, title, column_name, position) VALUES (?, 'T3', 'doing', 0)").run(projectId)
  const t1 = (db.prepare("SELECT id FROM dev_tasks WHERE project_id = ? AND title = 'T1'").get(projectId) as { id: number }).id
  db.prepare("INSERT INTO bugs (project_id, title, status) VALUES (?, 'B1', 'open')").run(projectId)
  db.prepare("INSERT INTO bugs (project_id, title, status) VALUES (?, 'B2', 'fixing')").run(projectId)
  db.prepare("INSERT INTO bugs (project_id, title, status) VALUES (?, 'B3', 'fixed')").run(projectId)
  db.prepare("INSERT INTO dev_sessions (task_id, started_at, ended_at, minutes) VALUES (?, '2026-10-09 09:00', '2026-10-09 10:00', 60)").run(t1)
  db.prepare("INSERT INTO dev_sessions (task_id, started_at, ended_at, minutes) VALUES (?, '2026-10-09 10:00', '2026-10-09 10:30', 30)").run(t1)
}

describe('项目 CRUD', () => {
  it('创建后可读回，默认值正确', () => {
    const p = createProject(db, { name: 'LifeOS' })
    expect(p).toMatchObject({ name: 'LifeOS', status: 'planned', description: '', start_date: null, end_date: null })
    expect(getProject(db, p.id)?.name).toBe('LifeOS')
  })

  it('名称、状态、简介、起止日期可写入', () => {
    const p = createProject(db, {
      name: 'InfoRadar', status: 'in_progress', description: '信息聚合',
      startDate: '2026-10-01', endDate: '2026-12-31'
    })
    expect(p).toMatchObject({
      status: 'in_progress', description: '信息聚合',
      start_date: '2026-10-01', end_date: '2026-12-31'
    })
  })

  it('名称为空被拒绝，首尾空白被去掉', () => {
    expect(() => createProject(db, { name: '   ' })).toThrow('项目名称不能为空')
    expect(createProject(db, { name: '  LifeOS  ' }).name).toBe('LifeOS')
    expect(listProjects(db)).toHaveLength(1)
  })

  it('非法状态被拒绝', () => {
    expect(() => createProject(db, { name: 'x', status: 'archived' as never })).toThrow('状态')
  })

  it('两端日期都给出时校验顺序；单端可空', () => {
    expect(() => createProject(db, { name: 'x', startDate: '2026-10-01' })).not.toThrow()
    expect(() => createProject(db, { name: 'y', endDate: '2026-12-01' })).not.toThrow()
    expect(() => createProject(db, { name: 'z', startDate: '2026-12-01', endDate: '2026-10-01' })).toThrow('结束日期')
  })

  it('非法日期格式被拒绝', () => {
    expect(() => createProject(db, { name: 'x', startDate: '2026-9-1' })).toThrow('开始日期')
    expect(() => createProject(db, { name: 'x', endDate: '2026-02-31' })).toThrow('结束日期')
  })

  it('更新是合并语义', () => {
    const p = createProject(db, { name: 'A', description: '说明' })
    const u = updateProject(db, p.id, { name: 'B' })
    expect(u.name).toBe('B')
    expect(u.description).toBe('说明')
  })

  it('可清空起止日期与简介', () => {
    const p = createProject(db, { name: 'A', description: 'd', startDate: '2026-10-01', endDate: '2026-12-01' })
    const u = updateProject(db, p.id, { description: '', startDate: null, endDate: null })
    expect(u).toMatchObject({ description: '', start_date: null, end_date: null })
  })

  it('更新为空白名称被拒绝，原值不变', () => {
    const p = createProject(db, { name: 'A' })
    expect(() => updateProject(db, p.id, { name: '  ' })).toThrow('项目名称不能为空')
    expect(getProject(db, p.id)!.name).toBe('A')
  })

  it('更新不存在的项目报错', () => {
    expect(() => updateProject(db, 999, { name: 'x' })).toThrow('not found')
  })

  it('列表按 计划中 → 开发中 → 暂停 → 已完成 排序', () => {
    createProject(db, { name: 'D', status: 'done' })
    createProject(db, { name: 'B', status: 'in_progress' })
    createProject(db, { name: 'A', status: 'planned' })
    createProject(db, { name: 'C', status: 'paused' })
    expect(listProjects(db).map((p) => p.name)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('删除项目', () => {
    const p = createProject(db, { name: 'A' })
    deleteProject(db, p.id)
    expect(getProject(db, p.id)).toBeNull()
    expect(listProjects(db)).toHaveLength(0)
  })

  it('删除项目会清掉它的长期任务色块', () => {
    const p = createProject(db, { name: 'A', startDate: '2026-10-01', endDate: '2026-12-01' })
    db.prepare(`
      INSERT INTO long_tasks (title, start_date, end_date, color, source_module, source_id)
      VALUES ('A 开发', '2026-10-01', '2026-12-01', '#3498db', 'dev', ?)
    `).run(p.id)
    expect(listRange(db, '2026-01-01', '2027-01-01')).toHaveLength(1)
    deleteProject(db, p.id)
    expect(listRange(db, '2026-01-01', '2027-01-01')).toHaveLength(0)
  })

  it('删除项目不影响其它来源的长期任务', () => {
    const p = createProject(db, { name: 'A' })
    db.prepare(`
      INSERT INTO long_tasks (title, start_date, end_date, color, source_module, source_id)
      VALUES ('学习项', '2026-10-01', '2026-12-01', '#4ade80', 'learning', 7)
    `).run()
    deleteProject(db, p.id)
    expect(listRange(db, '2026-01-01', '2027-01-01')).toHaveLength(1)
  })
})

describe('项目统计', () => {
  it('任务总数/已完成数/未修 Bug 数/累计时长', () => {
    const p = createProject(db, { name: 'A' })
    seedBoard(p.id)
    expect(projectStats(db, p.id)).toEqual({ taskTotal: 3, taskDone: 1, openBugs: 2, minutes: 90 })
  })

  it('空项目的统计全为 0', () => {
    const p = createProject(db, { name: 'A' })
    expect(projectStats(db, p.id)).toEqual({ taskTotal: 0, taskDone: 0, openBugs: 0, minutes: 0 })
  })

  it('listProjectStats 一次返回所有项目的统计', () => {
    const a = createProject(db, { name: 'A' })
    const b = createProject(db, { name: 'B' })
    seedBoard(a.id)
    const stats = listProjectStats(db)
    expect(stats.get(a.id)).toEqual({ taskTotal: 3, taskDone: 1, openBugs: 2, minutes: 90 })
    expect(stats.get(b.id)).toEqual({ taskTotal: 0, taskDone: 0, openBugs: 0, minutes: 0 })
  })

  it('统计不串项目', () => {
    const a = createProject(db, { name: 'A' })
    const b = createProject(db, { name: 'B' })
    db.prepare("INSERT INTO dev_tasks (project_id, title, column_name, position) VALUES (?, 'A1', 'done', 0)").run(a.id)
    db.prepare("INSERT INTO bugs (project_id, title, status) VALUES (?, 'B1', 'open')").run(b.id)
    expect(projectStats(db, a.id)).toMatchObject({ taskTotal: 1, taskDone: 1, openBugs: 0 })
    expect(projectStats(db, b.id)).toMatchObject({ taskTotal: 0, taskDone: 0, openBugs: 1 })
  })

  it('listProjectStats 覆盖无任务的项目', () => {
    const p = createProject(db, { name: 'A' })
    expect(listProjectStats(db).get(p.id)).toEqual({ taskTotal: 0, taskDone: 0, openBugs: 0, minutes: 0 })
  })
})

describe('看板数据层', () => {
  it('新任务追加到目标列末尾', () => {
    const p = createProject(db, { name: 'A' })
    createDevTask(db, { projectId: p.id, title: 'T1' })
    createDevTask(db, { projectId: p.id, title: 'T2' })
    expect(listDevTasks(db, p.id).map((t) => [t.title, t.column_name, t.position]))
      .toEqual([['T1', 'todo', 0], ['T2', 'todo', 1]])
  })

  it('可指定列、优先级与起止日期', () => {
    const p = createProject(db, { name: 'A' })
    const t = createDevTask(db, {
      projectId: p.id, title: 'T', column: 'doing', priority: 'high',
      startDate: '2026-10-01', dueDate: '2026-10-20'
    })
    expect(t).toMatchObject({
      column_name: 'doing', priority: 'high', start_date: '2026-10-01', due_date: '2026-10-20'
    })
  })

  it('列表按 待办 → 进行中 → 已完成，列内按 position', () => {
    const p = createProject(db, { name: 'A' })
    createDevTask(db, { projectId: p.id, title: 'A', column: 'done' })
    createDevTask(db, { projectId: p.id, title: 'B', column: 'todo' })
    createDevTask(db, { projectId: p.id, title: 'C', column: 'doing' })
    expect(listDevTasks(db, p.id).map((t) => t.title)).toEqual(['B', 'C', 'A'])
  })

  it('跨列移动后位置持久（重新查询仍正确）', () => {
    const p = createProject(db, { name: 'A' })
    const t1 = createDevTask(db, { projectId: p.id, title: 'T1' })
    createDevTask(db, { projectId: p.id, title: 'T2' })
    createDevTask(db, { projectId: p.id, title: 'T3' })
    moveDevTask(db, t1.id, 'doing', 0)

    expect(listDevTasks(db, p.id).map((t) => [t.title, t.column_name, t.position])).toEqual([
      ['T2', 'todo', 0], ['T3', 'todo', 1], ['T1', 'doing', 0]
    ])
  })

  it('列内重排持久', () => {
    const p = createProject(db, { name: 'A' })
    const t1 = createDevTask(db, { projectId: p.id, title: 'T1' })
    createDevTask(db, { projectId: p.id, title: 'T2' })
    createDevTask(db, { projectId: p.id, title: 'T3' })
    moveDevTask(db, t1.id, 'todo', 2)
    expect(listDevTasks(db, p.id).filter((t) => t.column_name === 'todo').map((t) => t.title))
      .toEqual(['T2', 'T3', 'T1'])
  })

  it('移动后两列的 position 都是连续 0..n-1', () => {
    const p = createProject(db, { name: 'A' })
    const t1 = createDevTask(db, { projectId: p.id, title: 'T1' })
    createDevTask(db, { projectId: p.id, title: 'T2' })
    createDevTask(db, { projectId: p.id, title: 'T3' })
    moveDevTask(db, t1.id, 'done', 0)
    const board = listDevTasks(db, p.id)
    const todo = board.filter((t) => t.column_name === 'todo')
    expect(todo.map((t) => t.position)).toEqual([0, 1])
  })

  it('删除任务后原列重新编号不留空洞', () => {
    const p = createProject(db, { name: 'A' })
    createDevTask(db, { projectId: p.id, title: 'T1' })
    const t2 = createDevTask(db, { projectId: p.id, title: 'T2' })
    createDevTask(db, { projectId: p.id, title: 'T3' })
    deleteDevTask(db, t2.id)
    expect(listDevTasks(db, p.id).map((t) => [t.title, t.position])).toEqual([['T1', 0], ['T3', 1]])
  })

  it('移动不存在的任务报错', () => {
    const p = createProject(db, { name: 'A' })
    createDevTask(db, { projectId: p.id, title: 'T' })
    expect(() => moveDevTask(db, 999, 'doing', 0)).toThrow('not found')
  })

  it('非法列被拒绝', () => {
    const p = createProject(db, { name: 'A' })
    expect(() => createDevTask(db, { projectId: p.id, title: 'T', column: 'review' as never })).toThrow('看板列')
  })

  it('任务标题为空被拒绝', () => {
    const p = createProject(db, { name: 'A' })
    expect(() => createDevTask(db, { projectId: p.id, title: '  ' })).toThrow('任务标题不能为空')
  })

  it('给不存在的项目建任务报错', () => {
    expect(() => createDevTask(db, { projectId: 999, title: 'T' })).toThrow('not found')
  })

  it('更新任务为合并语义', () => {
    const p = createProject(db, { name: 'A' })
    const t = createDevTask(db, { projectId: p.id, title: 'T', priority: 'high' })
    const u = updateDevTask(db, t.id, { title: 'T2' })
    expect(u).toMatchObject({ title: 'T2', priority: 'high' })
  })

  it('更新截止日期早于开始日期被拒绝', () => {
    const p = createProject(db, { name: 'A' })
    const t = createDevTask(db, { projectId: p.id, title: 'T', startDate: '2026-10-10' })
    expect(() => updateDevTask(db, t.id, { dueDate: '2026-10-01' })).toThrow('截止日期')
  })

  it('不同项目的看板互不可见', () => {
    const a = createProject(db, { name: 'A' })
    const b = createProject(db, { name: 'B' })
    createDevTask(db, { projectId: a.id, title: 'A 的任务' })
    expect(listDevTasks(db, b.id)).toHaveLength(0)
  })

  it('删除项目会连带删除看板任务', () => {
    const p = createProject(db, { name: 'A' })
    createDevTask(db, { projectId: p.id, title: 'T' })
    deleteProject(db, p.id)
    expect(listDevTasks(db, p.id)).toHaveLength(0)
  })
})

describe('Bug 记录', () => {
  it('创建后可读回，默认 未修 + 中优先级', () => {
    const p = createProject(db, { name: 'A' })
    const b = createBug(db, { projectId: p.id, title: '崩溃' })
    expect(b).toMatchObject({ title: '崩溃', status: 'open', priority: 'mid', description: '' })
  })

  it('现象、优先级、状态可写入', () => {
    const p = createProject(db, { name: 'A' })
    const b = createBug(db, { projectId: p.id, title: 'B', description: '复现步骤', priority: 'high', status: 'fixing' })
    expect(b).toMatchObject({ description: '复现步骤', priority: 'high', status: 'fixing' })
  })

  it('状态流转：未修 → 修复中 → 已修复', () => {
    const p = createProject(db, { name: 'A' })
    const b = createBug(db, { projectId: p.id, title: 'B' })
    expect(updateBug(db, b.id, { status: 'fixing' }).status).toBe('fixing')
    expect(updateBug(db, b.id, { status: 'fixed' }).status).toBe('fixed')
  })

  it('非法状态与优先级被拒绝', () => {
    const p = createProject(db, { name: 'A' })
    expect(() => createBug(db, { projectId: p.id, title: 'B', status: 'wontfix' as never })).toThrow('Bug 状态')
    expect(() => createBug(db, { projectId: p.id, title: 'B', priority: 'urgent' as never })).toThrow('优先级')
  })

  it('标题为空被拒绝', () => {
    const p = createProject(db, { name: 'A' })
    expect(() => createBug(db, { projectId: p.id, title: ' ' })).toThrow('Bug 标题不能为空')
  })

  it('给不存在的项目建 Bug 报错', () => {
    expect(() => createBug(db, { projectId: 999, title: 'B' })).toThrow('not found')
  })

  it('列表按 未修 → 修复中 → 已修复，同状态按优先级 高→低', () => {
    const p = createProject(db, { name: 'A' })
    createBug(db, { projectId: p.id, title: 'F', status: 'fixed' })
    createBug(db, { projectId: p.id, title: 'O-low', priority: 'low' })
    createBug(db, { projectId: p.id, title: 'O-high', priority: 'high' })
    createBug(db, { projectId: p.id, title: 'X', status: 'fixing' })
    expect(listBugs(db, p.id).map((b) => b.title)).toEqual(['O-high', 'O-low', 'X', 'F'])
  })

  it('删除 Bug', () => {
    const p = createProject(db, { name: 'A' })
    const b = createBug(db, { projectId: p.id, title: 'B' })
    deleteBug(db, b.id)
    expect(listBugs(db, p.id)).toHaveLength(0)
  })

  it('不同项目的 Bug 互不可见', () => {
    const a = createProject(db, { name: 'A' })
    const b = createProject(db, { name: 'B' })
    createBug(db, { projectId: a.id, title: 'A-bug' })
    expect(listBugs(db, b.id)).toHaveLength(0)
  })

  it('修复后项目统计的未修 Bug 数减少', () => {
    const p = createProject(db, { name: 'A' })
    const b = createBug(db, { projectId: p.id, title: 'B' })
    expect(projectStats(db, p.id).openBugs).toBe(1)
    updateBug(db, b.id, { status: 'fixed' })
    expect(projectStats(db, p.id).openBugs).toBe(0)
  })
})

describe('代码片段', () => {
  it('创建后可读回，标签以数组形式给出', () => {
    const s = createSnippet(db, { title: '防抖', code: 'const x = 1', language: 'typescript', tags: ['工具', '性能'] })
    expect(s.tags).toEqual(['工具', '性能'])
  })

  it('默认空代码/空语言/空标签', () => {
    expect(createSnippet(db, { title: 'T' })).toMatchObject({ code: '', language: '', tags: [] })
  })

  it('标签落库为 JSON 文本', () => {
    const s = createSnippet(db, { title: 'T', tags: ['a'] })
    const raw = db.prepare('SELECT tags FROM snippets WHERE id = ?').get(s.id) as { tags: string }
    expect(raw.tags).toBe('["a"]')
  })

  it('标签去重、去空白、去空项', () => {
    expect(createSnippet(db, { title: 'T', tags: [' a ', 'a', '', '  ', 'b'] }).tags).toEqual(['a', 'b'])
  })

  it('标题为空被拒绝', () => {
    expect(() => createSnippet(db, { title: '  ' })).toThrow('片段标题不能为空')
  })

  it('更新是合并语义，标签可整体替换', () => {
    const s = createSnippet(db, { title: 'T', code: 'c', tags: ['a'] })
    const u = updateSnippet(db, s.id, { title: 'T2' })
    expect(u).toMatchObject({ title: 'T2', code: 'c', tags: ['a'] })
    expect(updateSnippet(db, s.id, { tags: ['b', 'c'] }).tags).toEqual(['b', 'c'])
  })

  it('搜索：关键词 + 标签', () => {
    createSnippet(db, { title: '防抖函数', code: 'debounce', language: 'typescript', tags: ['工具'] })
    createSnippet(db, { title: 'SQL 分页', code: 'LIMIT', language: 'sql', tags: ['数据库'] })
    expect(searchSnippets(db, { keyword: 'debounce' }).map((s) => s.title)).toEqual(['防抖函数'])
    expect(searchSnippets(db, { tags: ['数据库'] }).map((s) => s.title)).toEqual(['SQL 分页'])
    expect(searchSnippets(db, {})).toHaveLength(2)
  })

  it('坏标签数据回退空数组（不炸界面）', () => {
    db.prepare("INSERT INTO snippets (title, tags) VALUES ('坏数据', 'not-json')").run()
    expect(listSnippets(db).find((s) => s.title === '坏数据')!.tags).toEqual([])
  })

  it('列表按 id 倒序（最新在前）', () => {
    createSnippet(db, { title: '老' })
    createSnippet(db, { title: '新' })
    expect(listSnippets(db).map((s) => s.title)).toEqual(['新', '老'])
  })

  it('删除片段', () => {
    const s = createSnippet(db, { title: 'T' })
    deleteSnippet(db, s.id)
    expect(listSnippets(db)).toHaveLength(0)
  })
})

describe('技术笔记', () => {
  it('创建、更新、删除', () => {
    const n = createTechNote(db, { title: 'SQLite WAL', content: '写前日志' })
    expect(n).toMatchObject({ title: 'SQLite WAL', content: '写前日志', project_id: null })
    expect(updateTechNote(db, n.id, { content: '改' }).content).toBe('改')
    deleteTechNote(db, n.id)
    expect(listTechNotes(db)).toHaveLength(0)
  })

  it('可关联项目', () => {
    const p = createProject(db, { name: 'A' })
    expect(createTechNote(db, { title: 'T', projectId: p.id }).project_id).toBe(p.id)
  })

  it('关联不存在的项目被拒绝', () => {
    expect(() => createTechNote(db, { title: 'T', projectId: 999 })).toThrow('project 999 not found')
  })

  it('可以解除关联', () => {
    const p = createProject(db, { name: 'A' })
    const n = createTechNote(db, { title: 'T', projectId: p.id })
    expect(updateTechNote(db, n.id, { projectId: null }).project_id).toBeNull()
  })

  it('更新时关联到不存在的项目被拒绝', () => {
    const n = createTechNote(db, { title: 'T' })
    expect(() => updateTechNote(db, n.id, { projectId: 999 })).toThrow('not found')
  })

  it('标题为空被拒绝', () => {
    expect(() => createTechNote(db, { title: '' })).toThrow('笔记标题不能为空')
  })

  it('列表按 id 倒序', () => {
    createTechNote(db, { title: '老' })
    createTechNote(db, { title: '新' })
    expect(listTechNotes(db).map((n) => n.title)).toEqual(['新', '老'])
  })
})

describe('开发计时', () => {
  it('写入后可查询，按开始时间升序', () => {
    const p = createProject(db, { name: 'A' })
    const t = createDevTask(db, { projectId: p.id, title: 'T' })
    createDevSession(db, t.id, '2026-10-09 10:00', '2026-10-09 11:00', 60)
    createDevSession(db, t.id, '2026-10-09 09:00', '2026-10-09 09:30', 30)
    expect(listDevSessions(db).map((s) => s.started_at)).toEqual(['2026-10-09 09:00', '2026-10-09 10:00'])
    expect(listDevSessions(db, t.id)).toHaveLength(2)
  })

  it('按任务过滤只返回该任务的记录', () => {
    const p = createProject(db, { name: 'A' })
    const t1 = createDevTask(db, { projectId: p.id, title: 'T1' })
    const t2 = createDevTask(db, { projectId: p.id, title: 'T2' })
    createDevSession(db, t1.id, '2026-10-09 09:00', '2026-10-09 10:00', 60)
    createDevSession(db, t2.id, '2026-10-09 10:00', '2026-10-09 11:00', 60)
    expect(listDevSessions(db, t1.id)).toHaveLength(1)
  })

  it('结束时不能早于开始', () => {
    const p = createProject(db, { name: 'A' })
    const t = createDevTask(db, { projectId: p.id, title: 'T' })
    expect(() => createDevSession(db, t.id, '2026-10-09 11:00', '2026-10-09 10:00', 60)).toThrow('结束时间')
  })

  it('时长必须是 ≥1 的整数', () => {
    const p = createProject(db, { name: 'A' })
    const t = createDevTask(db, { projectId: p.id, title: 'T' })
    expect(() => createDevSession(db, t.id, '2026-10-09 09:00', '2026-10-09 10:00', 0)).toThrow('时长')
    expect(() => createDevSession(db, t.id, '2026-10-09 09:00', '2026-10-09 10:00', 1.5)).toThrow('时长')
  })

  it('时间格式非法被拒绝', () => {
    const p = createProject(db, { name: 'A' })
    const t = createDevTask(db, { projectId: p.id, title: 'T' })
    expect(() => createDevSession(db, t.id, 'bad', '2026-10-09 10:00', 10)).toThrow('开始时间')
    expect(() => createDevSession(db, t.id, '2026-10-09 09:00', '2026-10-09 25:00', 10)).toThrow('结束时间')
  })

  it('给不存在的任务记时被拒绝', () => {
    expect(() => createDevSession(db, 999, '2026-10-09 09:00', '2026-10-09 10:00', 60)).toThrow('not found')
  })

  it('删除记录', () => {
    const p = createProject(db, { name: 'A' })
    const t = createDevTask(db, { projectId: p.id, title: 'T' })
    const s = createDevSession(db, t.id, '2026-10-09 09:00', '2026-10-09 10:00', 60)
    deleteDevSession(db, s.id)
    expect(listDevSessions(db)).toHaveLength(0)
  })

  it('minutesByProject 按项目汇总', () => {
    const a = createProject(db, { name: 'A' })
    const b = createProject(db, { name: 'B' })
    const ta1 = createDevTask(db, { projectId: a.id, title: 'A1' })
    const ta2 = createDevTask(db, { projectId: a.id, title: 'A2' })
    const tb = createDevTask(db, { projectId: b.id, title: 'B1' })
    createDevSession(db, ta1.id, '2026-10-09 09:00', '2026-10-09 10:00', 60)
    createDevSession(db, ta2.id, '2026-10-09 10:00', '2026-10-09 10:30', 30)
    createDevSession(db, tb.id, '2026-10-09 11:00', '2026-10-09 11:15', 15)

    const m = minutesByProject(db)
    expect(m.get(a.id)).toBe(90)
    expect(m.get(b.id)).toBe(15)
  })

  it('无计时的项目不在 minutesByProject 里出现', () => {
    const p = createProject(db, { name: 'A' })
    expect(minutesByProject(db).get(p.id)).toBeUndefined()
  })

  it('minutesByTask 只统计该项目下的任务', () => {
    const a = createProject(db, { name: 'A' })
    const b = createProject(db, { name: 'B' })
    const ta = createDevTask(db, { projectId: a.id, title: 'A1' })
    const tb = createDevTask(db, { projectId: b.id, title: 'B1' })
    createDevSession(db, ta.id, '2026-10-09 09:00', '2026-10-09 10:00', 60)
    createDevSession(db, tb.id, '2026-10-09 09:00', '2026-10-09 09:20', 20)

    expect(minutesByTask(db, a.id).get(ta.id)).toBe(60)
    expect(minutesByTask(db, a.id).get(tb.id)).toBeUndefined()
  })

  it('项目统计的 minutes 与 minutesByProject 口径一致', () => {
    const a = createProject(db, { name: 'A' })
    const t = createDevTask(db, { projectId: a.id, title: 'T' })
    createDevSession(db, t.id, '2026-10-09 09:00', '2026-10-09 10:00', 60)
    expect(projectStats(db, a.id).minutes).toBe(minutesByProject(db).get(a.id))
  })

  it('删除任务会连带删除其计时记录', () => {
    const p = createProject(db, { name: 'A' })
    const t = createDevTask(db, { projectId: p.id, title: 'T' })
    createDevSession(db, t.id, '2026-10-09 09:00', '2026-10-09 10:00', 60)
    deleteDevTask(db, t.id)
    expect(listDevSessions(db)).toHaveLength(0)
  })

  it('删除项目会连带删除其全部计时记录', () => {
    const p = createProject(db, { name: 'A' })
    const t = createDevTask(db, { projectId: p.id, title: 'T' })
    createDevSession(db, t.id, '2026-10-09 09:00', '2026-10-09 10:00', 60)
    deleteProject(db, p.id)
    expect(listDevSessions(db)).toHaveLength(0)
  })
})
