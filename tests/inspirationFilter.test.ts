import { describe, it, expect } from 'vitest'
import { filterInspirations } from '../src/shared/inspirationFilter'
import type { Inspiration } from '../src/shared/types'

const ins = (id: number, o: Partial<Inspiration> = {}): Inspiration => ({
  id, board_id: null, text: '', image_path: null, source_url: null,
  starred: false, tags: [], created_at: '', updated_at: '', ...o
})

const IMG = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png'

const list = [
  ins(1, { text: '深色配色', tags: ['配色'], starred: true, board_id: 10 }),
  ins(2, { image_path: IMG, tags: ['配色', '排版'], board_id: 10 }),
  ins(3, { source_url: 'https://dribbble.com/shots/9', text: '参考站', tags: ['排版'], board_id: 20 })
]

describe('filterInspirations', () => {
  it('无条件是全部', () => {
    expect(filterInspirations(list, {})).toHaveLength(3)
  })

  it('精选三态', () => {
    expect(filterInspirations(list, { starred: true }).map((i) => i.id)).toEqual([1])
    expect(filterInspirations(list, { starred: false }).map((i) => i.id)).toEqual([2, 3])
    expect(filterInspirations(list, { starred: undefined })).toHaveLength(3)
  })

  it('画板筛选', () => {
    expect(filterInspirations(list, { boardId: 10 }).map((i) => i.id)).toEqual([1, 2])
    expect(filterInspirations(list, { boardId: 'all' })).toHaveLength(3)
  })

  it('未归属画板的灵感在按画板筛选时不出现', () => {
    const loose = [...list, ins(4, { text: '散装' })]
    expect(filterInspirations(loose, { boardId: 10 }).map((i) => i.id)).toEqual([1, 2])
  })

  it('标签为全部命中（AND）', () => {
    expect(filterInspirations(list, { tags: ['配色'] }).map((i) => i.id)).toEqual([1, 2])
    expect(filterInspirations(list, { tags: ['配色', '排版'] }).map((i) => i.id)).toEqual([2])
    expect(filterInspirations(list, { tags: ['配色', '不存在'] })).toEqual([])
  })

  it('关键词命中文字 / 链接 / 标签', () => {
    expect(filterInspirations(list, { keyword: '深色' }).map((i) => i.id)).toEqual([1])
    expect(filterInspirations(list, { keyword: 'dribbble' }).map((i) => i.id)).toEqual([3])
    expect(filterInspirations(list, { keyword: '排版' }).map((i) => i.id)).toEqual([2, 3])
  })

  it('关键词不区分大小写', () => {
    expect(filterInspirations(list, { keyword: 'DRIBBBLE' }).map((i) => i.id)).toEqual([3])
  })

  it('空白关键词不过滤', () => {
    expect(filterInspirations(list, { keyword: '   ' })).toHaveLength(3)
  })

  it('空标签数组不过滤', () => {
    expect(filterInspirations(list, { tags: [] })).toHaveLength(3)
  })

  it('条件组合取交集', () => {
    expect(filterInspirations(list, { boardId: 10, tags: ['排版'], starred: false }).map((i) => i.id)).toEqual([2])
  })

  it('无命中返回空数组', () => {
    expect(filterInspirations(list, { keyword: '不存在' })).toEqual([])
  })

  it('不修改入参', () => {
    const copy = JSON.parse(JSON.stringify(list))
    filterInspirations(list, { starred: true })
    expect(list).toEqual(copy)
  })
})
