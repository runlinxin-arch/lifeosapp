import { describe, it, expect } from 'vitest'
import { MAX_RESPONSE_BYTES, readTextWithLimit } from '../src/main/themeStyle'

describe('readTextWithLimit', () => {
  it('小体积响应正常返回文本', async () => {
    const text = await readTextWithLimit(new Response('<html><body style="background:#ffffff">x</body></html>'), 1024)
    expect(text).toContain('#ffffff')
  })

  it('超过体积上限抛错并中止', async () => {
    await expect(readTextWithLimit(new Response('x'.repeat(100)), 10)).rejects.toThrow('页面过大')
  })

  it('Content-Length 超过上限时快速拒绝', async () => {
    const res = new Response('x'.repeat(100), { headers: { 'content-length': '999999' } })
    await expect(readTextWithLimit(res, 10)).rejects.toThrow('页面过大')
  })

  it('默认体积上限为 2MB', () => {
    expect(MAX_RESPONSE_BYTES).toBe(2 * 1024 * 1024)
  })
})
