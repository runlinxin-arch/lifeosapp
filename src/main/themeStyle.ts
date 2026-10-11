import type { ThemePalette } from '@shared/settings'
import { extractThemeColors } from '@shared/themeExtract'

const FETCH_TIMEOUT_MS = 8000

/** 抓取响应体积上限：只用于取色，2MB 的 HTML 已经远超所需 */
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024

/**
 * 读取响应文本并限制体积：先看 Content-Length 快速拒绝，再流式读取、超限即中止。
 * 避免超大页面把内存吃满（8 秒超时只限时间，不限体积）。
 */
export async function readTextWithLimit(res: Response, maxBytes: number = MAX_RESPONSE_BYTES): Promise<string> {
  const cl = res.headers.get('content-length')
  if (cl) {
    const n = Number(cl)
    if (Number.isFinite(n) && n > maxBytes) throw new Error('页面过大，超出体积上限')
  }

  const body = res.body
  if (!body) {
    const text = await res.text()
    if (text.length > maxBytes) throw new Error('页面过大，超出体积上限')
    return text
  }

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      throw new Error('页面过大，超出体积上限')
    }
    chunks.push(value)
  }

  const buf = new Uint8Array(total)
  let off = 0
  for (const c of chunks) { buf.set(c, off); off += c.byteLength }
  return new TextDecoder().decode(buf)
}

/**
 * 网站风格模仿：主进程抓取页面并提取配色。
 * 这是全应用唯一的联网功能；渲染进程不直接联网，只经 IPC 调用本函数。
 */
export async function fetchStyle(url: string): Promise<ThemePalette> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('网址格式不正确，请输入完整地址（如 https://example.com）')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('只支持 http / https 网址')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LifeOS/1.0' }
    })
    if (!res.ok) throw new Error(`抓取失败（HTTP ${res.status}）`)
    const html = await readTextWithLimit(res)
    const palette = extractThemeColors(html)
    if (!palette) throw new Error('未能从页面解析出颜色，请手动选色')
    return palette
  } catch (err) {
    if (err instanceof Error) {
      if (err.name === 'AbortError') throw new Error('抓取超时，请重试或手动选色')
      if (err.message.startsWith('抓取失败') || err.message.startsWith('未能从') || err.message.startsWith('页面过大')) throw err
      throw new Error(`抓取失败：${err.message}`)
    }
    throw new Error('抓取失败')
  } finally {
    clearTimeout(timer)
  }
}
