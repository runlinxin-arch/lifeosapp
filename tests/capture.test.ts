import { describe, it, expect, beforeEach } from 'vitest'
import { openDb } from '../src/main/db'
import { capture, type ImageStore } from '../src/main/capture'
import { listInspirations, createBoard } from '../src/main/db/inspiration'

let db: ReturnType<typeof openDb>
let saved: { bytes: Uint8Array; mime: string }[]
let removed: (string | null)[]
let store: ImageStore

const NAME = '3f2504e0-4f89-41d3-9a0c-0305e82c3301.png'

beforeEach(() => {
  db = openDb(':memory:')
  saved = []
  removed = []
  store = {
    save: (bytes, mime) => {
      saved.push({ bytes, mime })
      return NAME
    },
    remove: (name) => { removed.push(name) }
  }
})

describe('capture', () => {
  it('文字捕获不碰文件存储', () => {
    const i = capture(db, { kind: 'text', text: '一条灵感' }, store)
    expect(i.text).toBe('一条灵感')
    expect(saved).toHaveLength(0)
    expect(removed).toHaveLength(0)
  })

  it('链接捕获', () => {
    const i = capture(db, { kind: 'link', sourceUrl: 'https://example.com', text: '看这个' }, store)
    expect(i.source_url).toBe('https://example.com')
    expect(i.text).toBe('看这个')
    expect(saved).toHaveLength(0)
  })

  it('图片捕获：先存文件再落库，记录里是存储层返回的文件名', () => {
    const bytes = new Uint8Array([1, 2, 3])
    const i = capture(db, { kind: 'image', imageBytes: bytes, imageMime: 'image/png', text: '配色参考' }, store)
    expect(saved).toEqual([{ bytes, mime: 'image/png' }])
    expect(i.image_path).toBe(NAME)
    expect(i.text).toBe('配色参考')
  })

  it('图片捕获可以带标签与画板', () => {
    const b = createBoard(db, { name: '配色' })
    const i = capture(db, {
      kind: 'image', imageBytes: new Uint8Array([1]), imageMime: 'image/jpeg',
      tags: ['配色', '配色', '排版'], boardId: b.id
    }, store)
    expect(i.tags).toEqual(['配色', '排版'])
    expect(i.board_id).toBe(b.id)
  })

  it('图片捕获缺字节被拒绝，且不写文件', () => {
    expect(() => capture(db, { kind: 'image', imageMime: 'image/png' }, store)).toThrow('图片内容为空')
    expect(saved).toHaveLength(0)
    expect(listInspirations(db)).toHaveLength(0)
  })

  it('落库失败时删掉刚写的文件（防孤儿文件）', () => {
    // 非法链接会让 createInspiration 抛错
    expect(() => capture(db, {
      kind: 'image', imageBytes: new Uint8Array([1]), imageMime: 'image/png', sourceUrl: 'ftp://x'
    }, store)).toThrow('http')

    expect(saved).toHaveLength(1)
    expect(removed).toEqual([NAME])
    expect(listInspirations(db)).toHaveLength(0)
  })

  it('归属不存在的画板导致落库失败时也回收文件', () => {
    expect(() => capture(db, {
      kind: 'image', imageBytes: new Uint8Array([1]), imageMime: 'image/png', boardId: 999
    }, store)).toThrow('board 999 not found')
    expect(removed).toEqual([NAME])
  })

  it('存储层自身报错时向上传递，且不尝试删文件（文件根本没写成）', () => {
    const bad: ImageStore = {
      save: () => { throw new Error('不支持的图片格式：image/svg+xml') },
      remove: (n) => { removed.push(n) }
    }
    expect(() => capture(db, { kind: 'image', imageBytes: new Uint8Array([1]), imageMime: 'image/svg+xml' }, bad))
      .toThrow('不支持的图片格式')
    expect(removed).toHaveLength(0)
  })

  it('文字捕获落库失败不会误删文件', () => {
    expect(() => capture(db, { kind: 'text', text: '   ' }, store)).toThrow('灵感内容不能为空')
    expect(removed).toHaveLength(0)
    expect(saved).toHaveLength(0)
  })

  it('链接捕获落库失败不会误删文件', () => {
    expect(() => capture(db, { kind: 'link', sourceUrl: 'not-a-url' }, store)).toThrow('http')
    expect(removed).toHaveLength(0)
  })

  it('成功捕获后列表能查到', () => {
    capture(db, { kind: 'text', text: 'a' }, store)
    capture(db, { kind: 'image', imageBytes: new Uint8Array([1]), imageMime: 'image/png' }, store)
    expect(listInspirations(db)).toHaveLength(2)
  })
})
