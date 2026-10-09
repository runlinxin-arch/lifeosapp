import { describe, it, expect, beforeEach } from 'vitest'
import { openDb } from '../src/main/db'
import {
  listPlays, createPlay, updatePlay, deletePlay,
  listWishlist, createWish, updateWish, deleteWish,
  listMedia, createMedia, updateMedia, deleteMedia
} from '../src/main/db/entertainment'

let db: ReturnType<typeof openDb>
beforeEach(() => { db = openDb(':memory:') })

describe('游玩记录', () => {
  it('创建后可读回', () => {
    const p = createPlay(db, { game: '老头环', date: '2026-10-09', minutes: 90 })
    expect(p).toMatchObject({ game: '老头环', date: '2026-10-09', minutes: 90 })
    expect(listPlays(db)).toHaveLength(1)
  })

  it('游戏名去首尾空白', () => {
    expect(createPlay(db, { game: '  老头环  ', date: '2026-10-09', minutes: 30 }).game).toBe('老头环')
  })

  it('游戏名为空被拒绝', () => {
    expect(() => createPlay(db, { game: '   ', date: '2026-10-09', minutes: 30 })).toThrow('游戏名称不能为空')
  })

  it('时长必须是 1–1440 的整数', () => {
    const base = { game: 'a', date: '2026-10-09' }
    expect(() => createPlay(db, { ...base, minutes: 0 })).toThrow('时长')
    expect(() => createPlay(db, { ...base, minutes: -10 })).toThrow('时长')
    expect(() => createPlay(db, { ...base, minutes: 1441 })).toThrow('时长')
    expect(() => createPlay(db, { ...base, minutes: 30.5 })).toThrow('时长')
    expect(() => createPlay(db, { ...base, minutes: NaN })).toThrow('时长')
    expect(createPlay(db, { ...base, minutes: 1440 }).minutes).toBe(1440)
  })

  it('日期非法被拒绝', () => {
    expect(() => createPlay(db, { game: 'a', date: '2026-9-1', minutes: 30 })).toThrow('日期')
    expect(() => createPlay(db, { game: 'a', date: '2026-02-31', minutes: 30 })).toThrow('日期')
  })

  it('同一天同一游戏可有多条记录', () => {
    createPlay(db, { game: 'a', date: '2026-10-09', minutes: 90 })
    createPlay(db, { game: 'a', date: '2026-10-09', minutes: 30 })
    expect(listPlays(db)).toHaveLength(2)
  })

  it('按日期区间查询含端点，按日期倒序', () => {
    createPlay(db, { game: 'a', date: '2026-10-01', minutes: 10 })
    createPlay(db, { game: 'a', date: '2026-10-05', minutes: 10 })
    createPlay(db, { game: 'a', date: '2026-10-11', minutes: 10 })
    expect(listPlays(db, '2026-10-05', '2026-10-11').map((p) => p.date)).toEqual(['2026-10-11', '2026-10-05'])
    expect(listPlays(db)).toHaveLength(3)
  })

  it('更新是合并语义', () => {
    const p = createPlay(db, { game: 'a', date: '2026-10-09', minutes: 30 })
    expect(updatePlay(db, p.id, { minutes: 60 })).toMatchObject({ game: 'a', date: '2026-10-09', minutes: 60 })
  })

  it('更新时同样校验时长', () => {
    const p = createPlay(db, { game: 'a', date: '2026-10-09', minutes: 30 })
    expect(() => updatePlay(db, p.id, { minutes: 0 })).toThrow('时长')
  })

  it('更新不存在的记录报错', () => {
    expect(() => updatePlay(db, 999, { minutes: 60 })).toThrow('not found')
  })

  it('删除记录', () => {
    const p = createPlay(db, { game: 'a', date: '2026-10-09', minutes: 30 })
    deletePlay(db, p.id)
    expect(listPlays(db)).toHaveLength(0)
  })
})

describe('愿望单', () => {
  it('创建后可读回，默认优先级 mid、平台空串', () => {
    expect(createWish(db, { name: '丝之歌' })).toMatchObject({ name: '丝之歌', platform: '', priority: 'mid' })
  })

  it('平台去空白，优先级可指定', () => {
    expect(createWish(db, { name: 'a', platform: '  PC  ', priority: 'high' }))
      .toMatchObject({ platform: 'PC', priority: 'high' })
  })

  it('名称为空被拒绝', () => {
    expect(() => createWish(db, { name: '  ' })).toThrow('游戏名称不能为空')
  })

  it('优先级不合法被拒绝', () => {
    expect(() => createWish(db, { name: 'a', priority: 'urgent' as never })).toThrow('优先级不合法')
  })

  it('更新是合并语义（只改优先级时平台保持）', () => {
    const w = createWish(db, { name: 'a', platform: 'PC', priority: 'low' })
    expect(updateWish(db, w.id, { priority: 'high' })).toMatchObject({ name: 'a', platform: 'PC', priority: 'high' })
  })

  it('列表按 id 升序', () => {
    createWish(db, { name: 'A' })
    createWish(db, { name: 'B' })
    expect(listWishlist(db).map((w) => w.name)).toEqual(['A', 'B'])
  })

  it('更新不存在的记录报错', () => {
    expect(() => updateWish(db, 999, { priority: 'high' })).toThrow('not found')
  })

  it('删除', () => {
    const w = createWish(db, { name: 'a' })
    deleteWish(db, w.id)
    expect(listWishlist(db)).toHaveLength(0)
  })
})

describe('影视书', () => {
  it('创建后可读回，默认 status=planned / rating=0 / comment 空', () => {
    expect(createMedia(db, { title: '沙丘', type: 'movie', date: '2026-10-09' }))
      .toMatchObject({ title: '沙丘', type: 'movie', status: 'planned', rating: 0, comment: '' })
  })

  it('评分与短评入库（短评去空白）', () => {
    const m = createMedia(db, { title: '三体', type: 'book', date: '2026-10-09', status: 'done', rating: 5, comment: '  神作  ' })
    expect(m).toMatchObject({ status: 'done', rating: 5, comment: '神作' })
  })

  it('评分越界被夹到 0–5 并取整', () => {
    expect(createMedia(db, { title: 'a', type: 'movie', date: '2026-10-09', rating: 9 }).rating).toBe(5)
    expect(createMedia(db, { title: 'b', type: 'movie', date: '2026-10-09', rating: -2 }).rating).toBe(0)
    expect(createMedia(db, { title: 'c', type: 'movie', date: '2026-10-09', rating: 3.7 }).rating).toBe(4)
  })

  it('标题为空被拒绝', () => {
    expect(() => createMedia(db, { title: ' ', type: 'movie', date: '2026-10-09' })).toThrow('标题不能为空')
  })

  it('类型 / 状态 / 日期非法被拒绝', () => {
    expect(() => createMedia(db, { title: 'a', type: 'anime' as never, date: '2026-10-09' })).toThrow('类型不合法')
    expect(() => createMedia(db, { title: 'a', type: 'movie', date: '2026-10-09', status: 'dropped' as never }))
      .toThrow('状态不合法')
    expect(() => createMedia(db, { title: 'a', type: 'movie', date: 'bad' })).toThrow('日期')
  })

  it('更新是合并语义', () => {
    const m = createMedia(db, { title: '沙丘', type: 'movie', date: '2026-10-09' })
    expect(updateMedia(db, m.id, { status: 'doing', rating: 4 }))
      .toMatchObject({ title: '沙丘', type: 'movie', status: 'doing', rating: 4 })
  })

  it('更新不存在的记录报错', () => {
    expect(() => updateMedia(db, 999, { rating: 1 })).toThrow('not found')
  })

  it('按日期倒序，区间含端点', () => {
    createMedia(db, { title: 'A', type: 'movie', date: '2026-10-01' })
    createMedia(db, { title: 'B', type: 'movie', date: '2026-10-09' })
    expect(listMedia(db).map((m) => m.title)).toEqual(['B', 'A'])
    expect(listMedia(db, '2026-10-01', '2026-10-01').map((m) => m.title)).toEqual(['A'])
  })

  it('删除', () => {
    const m = createMedia(db, { title: 'a', type: 'movie', date: '2026-10-09' })
    deleteMedia(db, m.id)
    expect(listMedia(db)).toHaveLength(0)
  })
})
