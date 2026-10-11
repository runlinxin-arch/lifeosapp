import type { ThemePalette } from '@shared/settings'
import { extractThemeColors } from '@shared/themeExtract'

const FETCH_TIMEOUT_MS = 8000

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
    const html = await res.text()
    const palette = extractThemeColors(html)
    if (!palette) throw new Error('未能从页面解析出颜色，请手动选色')
    return palette
  } catch (err) {
    if (err instanceof Error) {
      if (err.name === 'AbortError') throw new Error('抓取超时，请重试或手动选色')
      if (err.message.startsWith('抓取失败') || err.message.startsWith('未能从')) throw err
      throw new Error(`抓取失败：${err.message}`)
    }
    throw new Error('抓取失败')
  } finally {
    clearTimeout(timer)
  }
}
