import { describe, it, expect, beforeEach } from 'vitest'
import { openDb } from '../src/main/db'
import {
  listInspirations, getInspiration, createInspiration, updateInspiration, setStarred, deleteInspiration,
  listBoards, createBoard, updateBoard, deleteBoard, boardStats, listTags
} from '../src/main/db/inspiration'

let db: ReturnType<typeof openDb>
beforeEach(() => { db = openDb(':memory:') })

const IMG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png'
const IMG_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png'
const IMG_C = '3f2504e0-4f89-41d3-9a0c-0305e82c3301.png'

describe('灵感 CRUD', () => {
  it('纯文字灵感', () => {
    const i = createInspiration(db, { text: '深色配一点品红' })
    expect(i).toMatchObject({
      text: '深色配一点品红', image_path: null, source_url: null,
      starred: false, tags: [], board_id: null
    })
  })

  it('图片灵感（imagePath 由主进程提供）', () => {
    const i = createInspiration(db, { imagePath: IMG_C, tags: ['配色'] })
    expect(i.image_path).toBe(IMG_C)
    expect(i.tags).toEqual(['配色'])
  })

  it('链接灵感', () => {
    const i = createInspiration(db, { sourceUrl: 'https://dribbble.com/shots/1', text: '参考' })
    expect(i.source_url).toBe('https://dribbble.com/shots/1')
    expect(i.text).toBe('参考')
  })

  it('三项全空被拒绝', () => {
    expect(() => createInspiration(db, {})).toThrow('灵感内容不能为空')
    expect(() => createInspiration(db, { text: '   ' })).toThrow('灵感内容不能为空')
    expect(listInspirations(db)).toHaveLength(0)
  })

  it('来源链接必须是 http(s)', () => {
    expect(() => createInspiration(db, { sourceUrl: 'ftp://x.com/a' })).toThrow('http')
    expect(() => createInspiration(db, { sourceUrl: 'javascript:alert(1)' })).toThrow('http')
    expect(() => createInspiration(db, { sourceUrl: 'dribbble.com' })).toThrow('http')
  })

  it('http 与 https 都接受', () => {
    expect(createInspiration(db, { sourceUrl: 'http://a.com' }).source_url).toBe('http://a.com')
    expect(createInspiration(db, { sourceUrl: 'https://a.com' }).source_url).toBe('https://a.com')
  })

  it('标签规范化：去空、去重、去空白', () => {
    expect(createInspiration(db, { text: 'x', tags: [' a ', 'a', '', '  ', 'b'] }).tags).toEqual(['a', 'b'])
  })

  it('可归属画板', () => {
    const b = createBoard(db, { name: '配色' })
    expect(createInspiration(db, { text: 'x', boardId: b.id }).board_id).toBe(b.id)
  })

  it('归属不存在的画板被拒绝', () => {
    expect(() => createInspiration(db, { text: 'x', boardId: 999 })).toThrow('board 999 not found')
  })

  it('更新是合并语义', () => {
    const i = createInspiration(db, { text: '原标题', tags: ['a'] })
    const u = updateInspiration(db, i.id, { text: '新标题' })
    expect(u.text).toBe('新标题')
    expect(u.tags).toEqual(['a'])
  })

  it('更新后三项全空被拒绝，且原记录不变', () => {
    const i = createInspiration(db, { imagePath: IMG_C })
    expect(() => updateInspiration(db, i.id, { imagePath: null })).toThrow('灵感内容不能为空')
    expect(getInspiration(db, i.id)!.image_path).toBe(IMG_C)
  })

  it('可以用文字顶掉图片后清空图片', () => {
    const i = createInspiration(db, { imagePath: IMG_C })
    const u = updateInspiration(db, i.id, { imagePath: null, text: '改成文字' })
    expect(u.image_path).toBeNull()
    expect(u.text).toBe('改成文字')
  })

  it('更新不存在的灵感报错', () => {
    expect(() => updateInspiration(db, 999, { text: 'x' })).toThrow('not found')
  })

  it('非法链接在更新时也被拒绝', () => {
    const i = createInspiration(db, { text: 'x' })
    expect(() => updateInspiration(db, i.id, { sourceUrl: 'ftp://x' })).toThrow('http')
  })

  it('收藏切换', () => {
    const i = createInspiration(db, { text: 'x' })
    expect(i.starred).toBe(false)
    expect(setStarred(db, i.id, true).starred).toBe(true)
    expect(setStarred(db, i.id, false).starred).toBe(false)
  })

  it('setStarred 对不存在的灵感报错', () => {
    expect(() => setStarred(db, 999, true)).toThrow('not found')
  })

  it('删除返回图片文件名供调用方删文件', () => {
    const i = createInspiration(db, { imagePath: IMG_C })
    expect(deleteInspiration(db, i.id)).toBe(IMG_C)
    expect(getInspiration(db, i.id)).toBeNull()
  })

  it('删除纯文字灵感返回 null', () => {
    const i = createInspiration(db, { text: 'x' })
    expect(deleteInspiration(db, i.id)).toBeNull()
  })

  it('删除灵感会清掉它的长期任务色块', () => {
    const i = createInspiration(db, { text: 'x' })
    db.prepare(`
      INSERT INTO long_tasks (title, start_date, end_date, color, source_module, source_id)
      VALUES ('灵感', '2026-10-01', '2026-12-01', '#e879c9', 'inspiration', ?)
    `).run(i.id)
    deleteInspiration(db, i.id)
    expect(db.prepare('SELECT COUNT(*) c FROM long_tasks').get()).toEqual({ c: 0 })
  })

  it('列表按最新在前', () => {
    createInspiration(db, { text: '先' })
    createInspiration(db, { text: '后' })
    expect(listInspirations(db).map((i) => i.text)).toEqual(['后', '先'])
  })
})

describe('画板', () => {
  it('创建/更新/删除', () => {
    const b = createBoard(db, { name: '配色' })
    expect(updateBoard(db, b.id, { name: '配色方案' }).name).toBe('配色方案')
    deleteBoard(db, b.id)
    expect(listBoards(db)).toHaveLength(0)
  })

  it('名称为空被拒绝，首尾空白被去掉', () => {
    expect(() => createBoard(db, { name: '  ' })).toThrow('画板名称不能为空')
    expect(createBoard(db, { name: '  配色  ' }).name).toBe('配色')
  })

  it('更新时间不存在的画板报错', () => {
    expect(() => updateBoard(db, 999, { name: 'x' })).toThrow('not found')
  })

  it('删除画板后灵感保留并解除归属', () => {
    const b = createBoard(db, { name: '配色' })
    const i = createInspiration(db, { text: 'x', boardId: b.id })
    deleteBoard(db, b.id)
    expect(getInspiration(db, i.id)!.board_id).toBeNull()
  })

  it('boardStats 统计条数并取最新图片作封面', () => {
    const b = createBoard(db, { name: '配色' })
    createInspiration(db, { imagePath: IMG_A, boardId: b.id })
    createInspiration(db, { text: '无图', boardId: b.id })
    createInspiration(db, { imagePath: IMG_B, boardId: b.id })
    const s = boardStats(db).get(b.id)!
    expect(s.count).toBe(3)
    expect(s.coverImage).toBe(IMG_B)
  })

  it('没有图片的画板封面为 null', () => {
    const b = createBoard(db, { name: '纯文字' })
    createInspiration(db, { text: 'a', boardId: b.id })
    expect(boardStats(db).get(b.id)).toEqual({ count: 1, coverImage: null })
  })

  it('空画板统计为 0', () => {
    const b = createBoard(db, { name: '空' })
    expect(boardStats(db).get(b.id)).toEqual({ count: 0, coverImage: null })
  })

  it('未归属画板的灵感不计入任何画板', () => {
    const b = createBoard(db, { name: '配色' })
    createInspiration(db, { text: '散装' })
    expect(boardStats(db).get(b.id)!.count).toBe(0)
  })
})

describe('listTags', () => {
  it('返回去重排序的全部标签', () => {
    createInspiration(db, { text: 'a', tags: ['配色', '排版'] })
    createInspiration(db, { text: 'b', tags: ['排版'] })
    expect(listTags(db)).toEqual(['排版', '配色'])
  })

  it('无灵感时返回空数组', () => {
    expect(listTags(db)).toEqual([])
  })
})
