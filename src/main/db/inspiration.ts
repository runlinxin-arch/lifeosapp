import type { DatabaseSync } from 'node:sqlite'
import type {
  BoardInput, BoardPatch, Inspiration, InspirationBoard, InspirationInput, InspirationPatch
} from '@shared/types'
import { parseTags } from '@shared/snippetFilter'
import { filterInspirations, type InspirationFilter } from '@shared/inspirationFilter'
import { assertNonEmpty } from './validate'
import { removeBySource } from './longTasks'

export type {
  BoardInput, BoardPatch, InspirationInput, InspirationPatch
} from '@shared/types'
export type { InspirationFilter } from '@shared/inspirationFilter'

export interface BoardStat {
  count: number
  coverImage: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asBoard = (r: any): InspirationBoard => r as InspirationBoard

const rowToInspiration = (r: {
  id: number; board_id: number | null; text: string; image_path: string | null
  source_url: string | null; starred: number; tags: string; created_at: string; updated_at: string
}): Inspiration => ({
  id: r.id,
  board_id: r.board_id,
  text: r.text,
  image_path: r.image_path,
  source_url: r.source_url,
  starred: r.starred === 1,
  tags: parseTags(r.tags),
  created_at: r.created_at,
  updated_at: r.updated_at
})

/** 三项内容至少一项非空 */
function assertHasContent(text: string, imagePath: string | null, sourceUrl: string | null): void {
  if (!text.trim() && !imagePath && !sourceUrl) throw new Error('灵感内容不能为空')
}

function assertSourceUrl(url: string | null): void {
  if (!url) return
  if (!/^https?:\/\//i.test(url)) throw new Error('来源链接必须以 http:// 或 https:// 开头')
}

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

export function listInspirations(db: DatabaseSync, filter?: InspirationFilter): Inspiration[] {
  const rows = (db.prepare('SELECT * FROM inspirations ORDER BY id DESC').all() as unknown as
    Parameters<typeof rowToInspiration>[0][]).map(rowToInspiration)
  return filter ? filterInspirations(rows, filter) : rows
}

export function getInspiration(db: DatabaseSync, id: number): Inspiration | null {
  const row = db.prepare('SELECT * FROM inspirations WHERE id = ?').get(id)
  return row ? rowToInspiration(row as Parameters<typeof rowToInspiration>[0]) : null
}

export function createInspiration(db: DatabaseSync, input: InspirationInput): Inspiration {
  const text = input.text ?? ''
  const imagePath = input.imagePath ?? null
  const sourceUrl = input.sourceUrl ?? null
  assertHasContent(text, imagePath, sourceUrl)
  assertSourceUrl(sourceUrl)

  const boardId = input.boardId ?? null
  if (boardId !== null && !getBoard(db, boardId)) throw new Error(`board ${boardId} not found`)

  const info = db.prepare(`
    INSERT INTO inspirations (board_id, text, image_path, source_url, starred, tags)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(boardId, text, imagePath, sourceUrl, input.starred ? 1 : 0, JSON.stringify(normalizeTags(input.tags)))

  return getInspiration(db, Number(info.lastInsertRowid))!
}

export function updateInspiration(db: DatabaseSync, id: number, patch: InspirationPatch): Inspiration {
  const cur = getInspiration(db, id)
  if (!cur) throw new Error(`inspiration ${id} not found`)

  const text = patch.text !== undefined ? patch.text : cur.text
  const imagePath = patch.imagePath !== undefined ? patch.imagePath : cur.image_path
  const sourceUrl = patch.sourceUrl !== undefined ? patch.sourceUrl : cur.source_url
  // 合并后重新校验：不允许"改完变成三项全空"
  assertHasContent(text, imagePath, sourceUrl)
  assertSourceUrl(sourceUrl)

  const boardId = patch.boardId !== undefined ? patch.boardId : cur.board_id
  if (boardId !== null && !getBoard(db, boardId)) throw new Error(`board ${boardId} not found`)

  const starred = patch.starred !== undefined ? patch.starred : cur.starred
  const tags = patch.tags !== undefined ? normalizeTags(patch.tags) : cur.tags

  db.prepare(`
    UPDATE inspirations SET board_id=?, text=?, image_path=?, source_url=?, starred=?, tags=?,
      updated_at=datetime('now','localtime') WHERE id=?
  `).run(boardId, text, imagePath, sourceUrl, starred ? 1 : 0, JSON.stringify(tags), id)

  return getInspiration(db, id)!
}

export function setStarred(db: DatabaseSync, id: number, starred: boolean): Inspiration {
  const cur = getInspiration(db, id)
  if (!cur) throw new Error(`inspiration ${id} not found`)
  db.prepare("UPDATE inspirations SET starred=?, updated_at=datetime('now','localtime') WHERE id=?")
    .run(starred ? 1 : 0, id)
  return getInspiration(db, id)!
}

/**
 * 只删数据库记录，**返回被删记录的图片文件名**交给调用方删文件。
 * 这样数据层完全不碰文件系统，可以独立单测。
 */
export function deleteInspiration(db: DatabaseSync, id: number): string | null {
  const cur = getInspiration(db, id)
  if (!cur) return null

  db.exec('BEGIN')
  try {
    db.prepare('DELETE FROM inspirations WHERE id = ?').run(id)
    removeBySource(db, 'inspiration', id)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  return cur.image_path
}

export function listTags(db: DatabaseSync): string[] {
  const set = new Set<string>()
  for (const i of listInspirations(db)) for (const t of i.tags) set.add(t)
  return [...set].sort()
}

// ---------- 画板 ----------

export function listBoards(db: DatabaseSync): InspirationBoard[] {
  return db.prepare('SELECT * FROM inspiration_boards ORDER BY id ASC').all().map(asBoard)
}

export function getBoard(db: DatabaseSync, id: number): InspirationBoard | null {
  const row = db.prepare('SELECT * FROM inspiration_boards WHERE id = ?').get(id)
  return row ? asBoard(row) : null
}

export function createBoard(db: DatabaseSync, input: BoardInput): InspirationBoard {
  const name = assertNonEmpty(input.name, '画板名称')
  const info = db.prepare('INSERT INTO inspiration_boards (name) VALUES (?)').run(name)
  return getBoard(db, Number(info.lastInsertRowid))!
}

export function updateBoard(db: DatabaseSync, id: number, patch: BoardPatch): InspirationBoard {
  const cur = getBoard(db, id)
  if (!cur) throw new Error(`board ${id} not found`)
  const name = patch.name !== undefined ? assertNonEmpty(patch.name, '画板名称') : cur.name
  db.prepare("UPDATE inspiration_boards SET name=?, updated_at=datetime('now','localtime') WHERE id=?")
    .run(name, id)
  return getBoard(db, id)!
}

/** 删除画板：灵感条目因外键 SET NULL 会保留，只解除归属 */
export function deleteBoard(db: DatabaseSync, id: number): void {
  db.exec('BEGIN')
  try {
    db.prepare('DELETE FROM inspiration_boards WHERE id = ?').run(id)
    removeBySource(db, 'inspiration', id)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

/** 每个画板的条数与封面（封面 = 该画板内最新一条有图片的灵感） */
export function boardStats(db: DatabaseSync): Map<number, BoardStat> {
  const out = new Map<number, BoardStat>()
  for (const b of listBoards(db)) out.set(b.id, { count: 0, coverImage: null })

  for (const r of db.prepare(`
    SELECT board_id, COUNT(*) AS c FROM inspirations WHERE board_id IS NOT NULL GROUP BY board_id
  `).all() as unknown as { board_id: number; c: number }[]) {
    const s = out.get(r.board_id)
    if (s) s.count = r.c
  }

  for (const r of db.prepare(`
    SELECT board_id, image_path FROM inspirations
    WHERE board_id IS NOT NULL AND image_path IS NOT NULL
      AND id IN (
        SELECT MAX(id) FROM inspirations WHERE board_id IS NOT NULL AND image_path IS NOT NULL GROUP BY board_id
      )
  `).all() as unknown as { board_id: number; image_path: string }[]) {
    const s = out.get(r.board_id)
    if (s) s.coverImage = r.image_path
  }

  return out
}
