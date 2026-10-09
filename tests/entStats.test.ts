import { describe, it, expect } from 'vitest'
import {
  gameSummaries, totalMinutes, recentPlays, sortWishlist, mediaGroups, mediaByType,
  playRangeBounds, filterPlays, mediaInScope
} from '../src/shared/entStats'
import type { Play, WishItem, Media, MediaType, MediaStatus, Priority } from '../src/shared/types'

const play = (id: number, game: string, date: string, minutes: number): Play =>
  ({ id, game, date, minutes, created_at: '', updated_at: '' })
const wish = (id: number, name: string, priority: Priority): WishItem =>
  ({ id, name, platform: '', priority, created_at: '', updated_at: '' })
const media = (id: number, title: string, type: MediaType, status: MediaStatus, rating = 0, comment = ''): Media =>
  ({ id, title, type, status, rating, comment, date: '2026-10-09', created_at: '', updated_at: '' })

describe('gameSummaries', () => {
  it('按游戏聚合计总时长、次数与最近游玩', () => {
    const rows = [
      play(1, '老头环', '2026-10-01', 90),
      play(2, '老头环', '2026-10-09', 30),
      play(3, '丝之歌', '2026-10-05', 300)
    ]
    const s = gameSummaries(rows)
    expect(s.map((x) => x.game)).toEqual(['丝之歌', '老头环'])
    expect(s.find((x) => x.game === '老头环')).toEqual({
      game: '老头环', totalMinutes: 120, sessions: 2, lastDate: '2026-10-09'
    })
  })
  it('空输入返回空数组', () => {
    expect(gameSummaries([])).toEqual([])
  })
  it('游戏名去空白后分组；大小写敏感不隐式合并', () => {
    const rows = [
      play(1, ' 老头环 ', '2026-10-01', 60),
      play(2, 'elden ring', '2026-10-01', 60),
      play(3, 'Elden Ring', '2026-10-01', 60)
    ]
    const s = gameSummaries(rows)
    expect(s).toHaveLength(3)
    expect(s.map((x) => x.game).sort()).toEqual(['Elden Ring', 'elden ring', '老头环'])
  })
  it('总时长相同按游戏名升序', () => {
    const rows = [play(1, 'B', '2026-10-01', 60), play(2, 'A', '2026-10-01', 60)]
    expect(gameSummaries(rows).map((x) => x.game)).toEqual(['A', 'B'])
  })
})

describe('totalMinutes', () => {
  const rows = [play(1, 'a', '2026-10-01', 30), play(2, 'a', '2026-10-05', 60), play(3, 'a', '2026-10-11', 90)]
  it('区间含端点', () => {
    expect(totalMinutes(rows, '2026-10-05', '2026-10-11')).toBe(150)
  })
  it('不传区间统计全部', () => {
    expect(totalMinutes(rows)).toBe(180)
  })
  it('空区间为 0', () => {
    expect(totalMinutes([], '2026-10-01', '2026-10-31')).toBe(0)
    expect(totalMinutes(rows, '2026-11-01', '2026-11-30')).toBe(0)
  })
})

describe('recentPlays', () => {
  const rows = [play(1, 'a', '2026-10-01', 10), play(2, 'b', '2026-10-09', 20), play(3, 'c', '2026-10-05', 30)]
  it('按日期倒序取前 n', () => {
    expect(recentPlays(rows, 2).map((p) => p.id)).toEqual([2, 3])
  })
  it('同日期按 id 倒序', () => {
    const same = [play(1, 'a', '2026-10-09', 10), play(2, 'b', '2026-10-09', 20)]
    expect(recentPlays(same, 2).map((p) => p.id)).toEqual([2, 1])
  })
  it('n ≤ 0 返回空数组', () => {
    expect(recentPlays(rows, 0)).toEqual([])
    expect(recentPlays(rows, -1)).toEqual([])
  })
})

describe('sortWishlist', () => {
  it('高优先级在前，同级按 id 升序', () => {
    const rows = [wish(1, 'A', 'low'), wish(2, 'B', 'high'), wish(3, 'C', 'mid'), wish(4, 'D', 'high')]
    expect(sortWishlist(rows).map((w) => w.name)).toEqual(['B', 'D', 'C', 'A'])
  })
  it('不修改入参', () => {
    const rows = [wish(1, 'A', 'low'), wish(2, 'B', 'high')]
    sortWishlist(rows)
    expect(rows.map((w) => w.name)).toEqual(['A', 'B'])
  })
})

describe('mediaGroups / mediaByType', () => {
  const rows = [
    media(1, '沙丘', 'movie', 'done', 4, '好看'),
    media(2, '三体', 'book', 'doing'),
    media(3, '怪奇物语', 'series', 'planned')
  ]
  it('按状态分组，三个键总在', () => {
    const g = mediaGroups(rows)
    expect(Object.keys(g).sort()).toEqual(['doing', 'done', 'planned'])
    expect(g.done.map((m) => m.title)).toEqual(['沙丘'])
    expect(g.planned.map((m) => m.title)).toEqual(['怪奇物语'])
    expect(g.doing.map((m) => m.title)).toEqual(['三体'])
  })
  it('按类型分组，三个键总在', () => {
    const g = mediaByType(rows)
    expect(Object.keys(g).sort()).toEqual(['book', 'movie', 'series'])
    expect(g.book.map((m) => m.title)).toEqual(['三体'])
  })
  it('空输入也返回完整键', () => {
    expect(Object.keys(mediaGroups([])).sort()).toEqual(['doing', 'done', 'planned'])
    expect(Object.keys(mediaByType([])).sort()).toEqual(['book', 'movie', 'series'])
  })
})

describe('playRangeBounds', () => {
  it('本周 = 周一到周日', () => {
    expect(playRangeBounds('week', '2026-10-09')).toEqual({ from: '2026-10-05', to: '2026-10-11' })
    expect(playRangeBounds('week', '2026-10-05')).toEqual({ from: '2026-10-05', to: '2026-10-11' })
    expect(playRangeBounds('week', '2026-10-11')).toEqual({ from: '2026-10-05', to: '2026-10-11' })
  })
  it('本月 = 1 号到月末（含 2 月与闰年）', () => {
    expect(playRangeBounds('month', '2026-10-09')).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(playRangeBounds('month', '2026-02-15')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(playRangeBounds('month', '2024-02-15')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
    expect(playRangeBounds('month', '2026-04-30')).toEqual({ from: '2026-04-01', to: '2026-04-30' })
  })
  it('全部返回 null', () => {
    expect(playRangeBounds('all', '2026-10-09')).toBeNull()
  })
})

describe('filterPlays', () => {
  const rows = [
    play(1, '老头环', '2026-10-09', 90),  // 本周 / 本月
    play(2, '老头环', '2026-10-02', 30),  // 本月（上周）
    play(3, '丝之歌', '2026-09-20', 300), // 上月
    play(4, '老头环', '2026-09-01', 60)   // 上月
  ]
  const today = '2026-10-09'
  it('按周过滤', () => {
    expect(filterPlays(rows, { range: 'week', today }).map((p) => p.id)).toEqual([1])
  })
  it('按月过滤', () => {
    expect(filterPlays(rows, { range: 'month', today }).map((p) => p.id)).toEqual([1, 2])
  })
  it('全部不过滤', () => {
    expect(filterPlays(rows, { range: 'all', today })).toHaveLength(4)
    expect(filterPlays(rows, { today })).toHaveLength(4)
  })
  it('按游戏名筛选（去空白后精确匹配）', () => {
    expect(filterPlays(rows, { game: '老头环', range: 'all', today }).map((p) => p.id)).toEqual([1, 2, 4])
    expect(filterPlays(rows, { game: ' 丝之歌 ', range: 'all', today }).map((p) => p.id)).toEqual([3])
  })
  it('区间与游戏筛选可叠加', () => {
    expect(filterPlays(rows, { game: '老头环', range: 'month', today }).map((p) => p.id)).toEqual([1, 2])
    expect(filterPlays(rows, { game: '丝之歌', range: 'week', today })).toEqual([])
  })
  it('空游戏名视为不筛', () => {
    expect(filterPlays(rows, { game: '', range: 'all', today })).toHaveLength(4)
    expect(filterPlays(rows, { game: null, range: 'all', today })).toHaveLength(4)
    expect(filterPlays(rows, { game: '  ', range: 'all', today })).toHaveLength(4)
  })
  it('不修改入参', () => {
    const copy = [...rows]
    filterPlays(rows, { game: '老头环', range: 'week', today })
    expect(rows).toEqual(copy)
  })
})

describe('mediaInScope', () => {
  const rows = [
    media(1, '沙丘', 'movie', 'done'),
    media(2, '怪奇物语', 'series', 'doing'),
    media(3, '三体', 'book', 'doing')
  ]
  it('影视 = 电影 + 剧集', () => {
    expect(mediaInScope(rows, 'screen').map((m) => m.title)).toEqual(['沙丘', '怪奇物语'])
  })
  it('书籍 = 书籍', () => {
    expect(mediaInScope(rows, 'book').map((m) => m.title)).toEqual(['三体'])
  })
  it('空输入返回空数组', () => {
    expect(mediaInScope([], 'screen')).toEqual([])
    expect(mediaInScope([], 'book')).toEqual([])
  })
})
