import type { DatabaseSync } from 'node:sqlite'
import type {
  Media, MediaInput, MediaPatch, Play, PlayInput, PlayPatch, WishInput, WishItem, WishPatch
} from '@shared/types'
import { clampRating, isMediaStatus, isMediaType, isPriority, normalizeComment } from '@shared/entContent'
import { assertDateStr, assertNonEmpty } from './validate'

export type { MediaInput, MediaPatch, PlayInput, PlayPatch, WishInput, WishPatch } from '@shared/types'

/** 单次游玩时长上限：一天 24 小时 */
const MAX_MINUTES = 1440

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asPlay = (r: any): Play => r as Play
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asWish = (r: any): WishItem => r as WishItem
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asMedia = (r: any): Media => r as Media

function assertMinutes(m: number): void {
  if (!Number.isInteger(m) || m < 1 || m > MAX_MINUTES) {
    throw new Error(`时长必须是 1–${MAX_MINUTES} 之间的整数分钟`)
  }
}

// ---------- 游玩记录 ----------

export function listPlays(db: DatabaseSync, from?: string, to?: string): Play[] {
  const sql = from && to
    ? 'SELECT * FROM plays WHERE date >= ? AND date <= ? ORDER BY date DESC, id DESC'
    : 'SELECT * FROM plays ORDER BY date DESC, id DESC'
  const rows = from && to ? db.prepare(sql).all(from, to) : db.prepare(sql).all()
  return (rows as unknown as Play[]).map(asPlay)
}

export function getPlay(db: DatabaseSync, id: number): Play | null {
  const row = db.prepare('SELECT * FROM plays WHERE id = ?').get(id)
  return row ? asPlay(row) : null
}

export function createPlay(db: DatabaseSync, input: PlayInput): Play {
  const game = assertNonEmpty(input.game, '游戏名称')
  assertDateStr(input.date, '游玩日期')
  assertMinutes(input.minutes)

  const info = db.prepare('INSERT INTO plays (game, date, minutes) VALUES (?, ?, ?)')
    .run(game, input.date, input.minutes)
  return getPlay(db, Number(info.lastInsertRowid))!
}

export function updatePlay(db: DatabaseSync, id: number, patch: PlayPatch): Play {
  const cur = getPlay(db, id)
  if (!cur) throw new Error(`play ${id} not found`)

  const game = patch.game !== undefined ? assertNonEmpty(patch.game, '游戏名称') : cur.game
  const date = patch.date !== undefined ? (assertDateStr(patch.date, '游玩日期'), patch.date) : cur.date
  const minutes = patch.minutes !== undefined ? patch.minutes : cur.minutes
  assertMinutes(minutes)

  db.prepare(`
    UPDATE plays SET game=?, date=?, minutes=?, updated_at=datetime('now','localtime') WHERE id=?
  `).run(game, date, minutes, id)
  return getPlay(db, id)!
}

export function deletePlay(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM plays WHERE id = ?').run(id)
}

// ---------- 愿望单 ----------

export function listWishlist(db: DatabaseSync): WishItem[] {
  return (db.prepare('SELECT * FROM wishlist ORDER BY id ASC').all() as unknown as WishItem[]).map(asWish)
}

export function getWish(db: DatabaseSync, id: number): WishItem | null {
  const row = db.prepare('SELECT * FROM wishlist WHERE id = ?').get(id)
  return row ? asWish(row) : null
}

export function createWish(db: DatabaseSync, input: WishInput): WishItem {
  const name = assertNonEmpty(input.name, '游戏名称')
  const platform = String(input.platform ?? '').trim()
  const priority = input.priority ?? 'mid'
  if (!isPriority(priority)) throw new Error(`优先级不合法：${String(priority)}`)

  const info = db.prepare('INSERT INTO wishlist (name, platform, priority) VALUES (?, ?, ?)')
    .run(name, platform, priority)
  return getWish(db, Number(info.lastInsertRowid))!
}

export function updateWish(db: DatabaseSync, id: number, patch: WishPatch): WishItem {
  const cur = getWish(db, id)
  if (!cur) throw new Error(`wishlist ${id} not found`)

  const name = patch.name !== undefined ? assertNonEmpty(patch.name, '游戏名称') : cur.name
  const platform = patch.platform !== undefined ? String(patch.platform).trim() : cur.platform
  const priority = patch.priority !== undefined ? patch.priority : cur.priority
  if (!isPriority(priority)) throw new Error(`优先级不合法：${String(priority)}`)

  db.prepare(`
    UPDATE wishlist SET name=?, platform=?, priority=?, updated_at=datetime('now','localtime') WHERE id=?
  `).run(name, platform, priority, id)
  return getWish(db, id)!
}

export function deleteWish(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM wishlist WHERE id = ?').run(id)
}

// ---------- 影视书 ----------

export function listMedia(db: DatabaseSync, from?: string, to?: string): Media[] {
  const sql = from && to
    ? 'SELECT * FROM media WHERE date >= ? AND date <= ? ORDER BY date DESC, id DESC'
    : 'SELECT * FROM media ORDER BY date DESC, id DESC'
  const rows = from && to ? db.prepare(sql).all(from, to) : db.prepare(sql).all()
  return (rows as unknown as Media[]).map(asMedia)
}

export function getMedia(db: DatabaseSync, id: number): Media | null {
  const row = db.prepare('SELECT * FROM media WHERE id = ?').get(id)
  return row ? asMedia(row) : null
}

export function createMedia(db: DatabaseSync, input: MediaInput): Media {
  const title = assertNonEmpty(input.title, '标题')
  if (!isMediaType(input.type)) throw new Error(`类型不合法：${String(input.type)}`)
  const status = input.status ?? 'planned'
  if (!isMediaStatus(status)) throw new Error(`状态不合法：${String(status)}`)
  assertDateStr(input.date, '日期')

  const info = db.prepare(`
    INSERT INTO media (title, type, status, rating, comment, date) VALUES (?, ?, ?, ?, ?, ?)
  `).run(title, input.type, status, clampRating(input.rating ?? 0), normalizeComment(input.comment), input.date)
  return getMedia(db, Number(info.lastInsertRowid))!
}

export function updateMedia(db: DatabaseSync, id: number, patch: MediaPatch): Media {
  const cur = getMedia(db, id)
  if (!cur) throw new Error(`media ${id} not found`)

  const title = patch.title !== undefined ? assertNonEmpty(patch.title, '标题') : cur.title
  const type = patch.type !== undefined ? patch.type : cur.type
  if (!isMediaType(type)) throw new Error(`类型不合法：${String(type)}`)
  const status = patch.status !== undefined ? patch.status : cur.status
  if (!isMediaStatus(status)) throw new Error(`状态不合法：${String(status)}`)
  const date = patch.date !== undefined ? (assertDateStr(patch.date, '日期'), patch.date) : cur.date
  const rating = patch.rating !== undefined ? clampRating(patch.rating) : cur.rating
  const comment = patch.comment !== undefined ? normalizeComment(patch.comment) : cur.comment

  db.prepare(`
    UPDATE media SET title=?, type=?, status=?, rating=?, comment=?, date=?,
      updated_at=datetime('now','localtime') WHERE id=?
  `).run(title, type, status, rating, comment, date, id)
  return getMedia(db, id)!
}

export function deleteMedia(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM media WHERE id = ?').run(id)
}
