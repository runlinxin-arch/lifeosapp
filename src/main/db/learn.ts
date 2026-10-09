import type { DatabaseSync } from 'node:sqlite'
import type {
  LearnItem, LearnItemInput, LearnItemPatch, LearnNote, LearnSession, LearnStatus, LearnType
} from '@shared/types'
import { assertDateStr, assertNonEmpty } from './validate'
import { removeBySource } from './longTasks'
import { progressPercent } from '@shared/learnStats'

export type { LearnItemInput, LearnItemPatch } from '@shared/types'
// progressPercent 是纯函数且界面也要用，实现在 @shared/learnStats，这里转出以保持数据层入口完整
export { progressPercent }

const TYPES: readonly LearnType[] = ['book', 'course', 'skill']
const STATUSES: readonly LearnStatus[] = ['not_started', 'learning', 'done']
/** 列表展示顺序：学习中 → 未开始 → 已完成 */
const STATUS_ORDER: Record<LearnStatus, number> = { learning: 0, not_started: 1, done: 2 }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToItem = (r: any): LearnItem => r as LearnItem

function assertUnits(totalUnits: number | undefined, doneUnits: number | undefined): void {
  if (totalUnits !== undefined) {
    if (!Number.isInteger(totalUnits) || totalUnits < 0) throw new Error('总量必须是不小于 0 的整数')
  }
  if (doneUnits !== undefined) {
    if (!Number.isInteger(doneUnits) || doneUnits < 0) throw new Error('进度必须是不小于 0 的整数')
    const total = totalUnits ?? 0
    if (total === 0 && doneUnits > 0) throw new Error('未设置总量时进度必须为 0')
    if (doneUnits > total) throw new Error(`进度不能超过总量（总量 ${total}）`)
  }
}

function assertType(t: string): void {
  if (!TYPES.includes(t as LearnType)) throw new Error(`学习项类型只能是 book / course / skill，收到：${t}`)
}

function assertStatus(s: string): void {
  if (!STATUSES.includes(s as LearnStatus)) {
    throw new Error(`学习项状态只能是 not_started / learning / done，收到：${s}`)
  }
}

/** 两端都给出时才校验区间；单端可为空 */
function assertDates(start: string | null | undefined, end: string | null | undefined): void {
  if (start) assertDateStr(start, '开始日期')
  if (end) assertDateStr(end, '结束日期')
  if (start && end && end < start) throw new Error('结束日期不能早于开始日期')
}

export function listLearnItems(db: DatabaseSync): LearnItem[] {
  const rows = db.prepare('SELECT * FROM learn_items').all().map(rowToItem)
  return rows.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.id - b.id)
}

export function getLearnItem(db: DatabaseSync, id: number): LearnItem | null {
  const row = db.prepare('SELECT * FROM learn_items WHERE id = ?').get(id)
  return row ? rowToItem(row) : null
}

export function createLearnItem(db: DatabaseSync, input: LearnItemInput): LearnItem {
  const title = assertNonEmpty(input.title, '学习项标题')
  const type = input.type ?? 'book'
  const status = input.status ?? 'not_started'
  assertType(type)
  assertStatus(status)
  assertUnits(input.totalUnits, input.doneUnits)
  assertDates(input.startDate, input.endDate)

  const total = input.totalUnits ?? 0
  // 直接建为"已完成"且设了总量时，进度补满
  const done = status === 'done' && total > 0 ? total : (input.doneUnits ?? 0)

  const info = db.prepare(`
    INSERT INTO learn_items (title, type, status, total_units, done_units, start_date, end_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(title, type, status, total, done, input.startDate ?? null, input.endDate ?? null)
  return getLearnItem(db, Number(info.lastInsertRowid))!
}

export function updateLearnItem(db: DatabaseSync, id: number, patch: LearnItemPatch): LearnItem {
  const cur = getLearnItem(db, id)
  if (!cur) throw new Error(`learn_item ${id} not found`)

  const title = patch.title !== undefined ? assertNonEmpty(patch.title, '学习项标题') : cur.title
  const type = patch.type ?? cur.type
  const status = patch.status ?? cur.status
  assertType(type)
  assertStatus(status)

  const start = patch.startDate !== undefined ? patch.startDate : cur.start_date
  const end = patch.endDate !== undefined ? patch.endDate : cur.end_date
  assertDates(start, end)

  const total = patch.totalUnits ?? cur.total_units
  let done = patch.doneUnits ?? cur.done_units
  assertUnits(total, done)
  // 状态改为已完成且设了总量时，进度补满
  if (status === 'done' && total > 0) done = total
  if (done > total) throw new Error(`进度不能超过总量（总量 ${total}）`)

  db.prepare(`
    UPDATE learn_items SET title=?, type=?, status=?, total_units=?, done_units=?,
      start_date=?, end_date=?, updated_at=datetime('now','localtime')
    WHERE id=?
  `).run(title, type, status, total, done, start, end, id)
  return getLearnItem(db, id)!
}

export function setLearnProgress(db: DatabaseSync, id: number, doneUnits: number): LearnItem {
  return updateLearnItem(db, id, { doneUnits })
}

/** 删除学习项：笔记与学习记录由外键级联删除，同一事务里清掉长期任务色块 */
export function deleteLearnItem(db: DatabaseSync, id: number): void {
  db.exec('BEGIN')
  try {
    db.prepare('DELETE FROM learn_items WHERE id = ?').run(id)
    removeBySource(db, 'learning', id)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

// ---------- 笔记 ----------

export function listNotes(db: DatabaseSync, itemId: number): LearnNote[] {
  return db.prepare('SELECT * FROM learn_notes WHERE item_id = ? ORDER BY id ASC')
    .all(itemId) as unknown as LearnNote[]
}

export function countNotes(db: DatabaseSync, itemId: number): number {
  return (db.prepare('SELECT COUNT(*) c FROM learn_notes WHERE item_id = ?').get(itemId) as { c: number }).c
}

export function createNote(db: DatabaseSync, itemId: number, content: string): LearnNote {
  const text = assertNonEmpty(content, '笔记内容')
  if (!getLearnItem(db, itemId)) throw new Error(`learn_item ${itemId} not found`)
  const info = db.prepare('INSERT INTO learn_notes (item_id, content) VALUES (?, ?)').run(itemId, text)
  return db.prepare('SELECT * FROM learn_notes WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as unknown as LearnNote
}

export function updateNote(db: DatabaseSync, id: number, content: string): LearnNote {
  const text = assertNonEmpty(content, '笔记内容')
  const info = db.prepare(`
    UPDATE learn_notes SET content=?, updated_at=datetime('now','localtime') WHERE id=?
  `).run(text, id)
  if (info.changes === 0) throw new Error(`learn_note ${id} not found`)
  return db.prepare('SELECT * FROM learn_notes WHERE id = ?').get(id) as unknown as LearnNote
}

export function deleteNote(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM learn_notes WHERE id = ?').run(id)
}

// ---------- 学习记录 ----------

export function listSessions(db: DatabaseSync, from?: string, to?: string): LearnSession[] {
  if (from && to) {
    return db.prepare('SELECT * FROM learn_sessions WHERE date >= ? AND date <= ? ORDER BY date ASC, id ASC')
      .all(from, to) as unknown as LearnSession[]
  }
  return db.prepare('SELECT * FROM learn_sessions ORDER BY date ASC, id ASC').all() as unknown as LearnSession[]
}

export function createSession(db: DatabaseSync, itemId: number, date: string, minutes: number): LearnSession {
  if (!Number.isInteger(minutes) || minutes < 1) throw new Error('学习时长必须是 ≥1 的整数分钟')
  assertDateStr(date, '学习日期')
  if (!getLearnItem(db, itemId)) throw new Error(`learn_item ${itemId} not found`)
  const info = db.prepare('INSERT INTO learn_sessions (item_id, date, minutes) VALUES (?, ?, ?)')
    .run(itemId, date, minutes)
  return db.prepare('SELECT * FROM learn_sessions WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as unknown as LearnSession
}

export function deleteSession(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM learn_sessions WHERE id = ?').run(id)
}
