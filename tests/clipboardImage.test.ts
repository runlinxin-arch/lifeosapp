import { describe, it, expect } from 'vitest'
import { readClipboardImage, type ClipboardItemLike, type ClipboardLike } from '../src/main/clipboardImage'

const item = (types: string[], payload: Record<string, Uint8Array<ArrayBuffer>> = {}): ClipboardItemLike => ({
  types,
  getType: async (t: string) => {
    const bytes = payload[t]
    if (!bytes) throw new Error(`no type ${t}`)
    return new Blob([bytes], { type: t })
  }
})

const clipOf = (...items: ClipboardItemLike[]): ClipboardLike => ({ read: async () => items })

describe('readClipboardImage', () => {
  it('剪贴板有 PNG 时返回 PNG 字节与 MIME', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71])
    const r = await readClipboardImage(clipOf(item(['image/png'], { 'image/png': bytes })))
    expect(r).not.toBeNull()
    expect(r!.mime).toBe('image/png')
    expect([...r!.bytes]).toEqual([...bytes])
  })

  it('同时有多种类型时优先 PNG', async () => {
    const png = new Uint8Array([1, 1, 1])
    const jpeg = new Uint8Array([2, 2, 2])
    const r = await readClipboardImage(
      clipOf(item(['image/jpeg', 'image/png'], { 'image/png': png, 'image/jpeg': jpeg }))
    )
    expect(r!.mime).toBe('image/png')
    expect([...r!.bytes]).toEqual([...png])
  })

  it('没有 PNG 时退到其它受支持格式', async () => {
    const jpeg = new Uint8Array([9, 9])
    const r = await readClipboardImage(clipOf(item(['image/jpeg'], { 'image/jpeg': jpeg })))
    expect(r!.mime).toBe('image/jpeg')
  })

  it('剪贴板没有条目时返回 null', async () => {
    expect(await readClipboardImage(clipOf())).toBeNull()
  })

  it('只有文本等非图片类型时返回 null', async () => {
    expect(await readClipboardImage(clipOf(item(['text/plain', 'text/html'])))).toBeNull()
  })

  it('跳过没有图片的条目取后面的图片', async () => {
    const png = new Uint8Array([7])
    const r = await readClipboardImage(
      clipOf(item(['text/plain']), item(['image/png'], { 'image/png': png }))
    )
    expect([...r!.bytes]).toEqual([7])
  })

  it('图片内容为空时跳过（不把 0 字节塞进保存流程）', async () => {
    const r = await readClipboardImage(
      clipOf(item(['image/png'], { 'image/png': new Uint8Array(0) }), item(['image/png'], { 'image/png': new Uint8Array([5]) }))
    )
    expect([...r!.bytes]).toEqual([5])
  })

  it('平台提供未知图片类型（如 image/bmp）时原样返回，交由保存流程给出明确报错', async () => {
    const bmp = new Uint8Array([66, 77])
    const r = await readClipboardImage(clipOf(item(['image/bmp'], { 'image/bmp': bmp })))
    expect(r!.mime).toBe('image/bmp')
  })

  it('每次调用都重新读剪贴板（不缓存）', async () => {
    let calls = 0
    const clip: ClipboardLike = {
      read: async () => {
        calls++
        return [item(['image/png'], { 'image/png': new Uint8Array([calls]) })]
      }
    }
    expect([...(await readClipboardImage(clip))!.bytes]).toEqual([1])
    expect([...(await readClipboardImage(clip))!.bytes]).toEqual([2])
    expect(calls).toBe(2)
  })
})
