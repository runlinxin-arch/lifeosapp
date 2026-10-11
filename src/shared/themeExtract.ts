import { DEFAULT_ACCENT, isHexColor, type ThemePalette } from './settings'

type Rgb = [number, number, number]

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16)
  ]
}

/** 感知亮度（0–1），用于区分深浅底与对比度 */
function luminance([r, g, b]: Rgb): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/** 饱和度（0–1），用于识别「鲜艳的主题色」 */
function saturation([r, g, b]: Rgb): number {
  const mx = Math.max(r, g, b) / 255
  const mn = Math.min(r, g, b) / 255
  return mx === 0 ? 0 : (mx - mn) / mx
}

/** '#abc' → '#aabbcc' */
function expand3(h3: string): string {
  return '#' + [...h3].map((c) => c + c).join('')
}

const HEX_TOKEN = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g

/**
 * 从网页 HTML 里提取一组主题色板。纯启发式、确定性：
 * - bg：出现频率最高的颜色
 * - text：与 bg 亮度差最大的颜色
 * - accent：最鲜艳（饱和度高且不极端暗/亮）的颜色；没有则取 <meta theme-color> 或默认强调色
 * - card：第二频繁且不同于 bg 的颜色
 * - border / muted：按 bg 深浅取中性灰
 * 一个颜色都解析不出来时返回 null（让调用方走手动选色兜底）。
 */
export function extractThemeColors(html: string): ThemePalette | null {
  const counts = new Map<string, number>()
  const bump = (hex: string): void => {
    if (!isHexColor(hex)) return
    counts.set(hex, (counts.get(hex) ?? 0) + 1)
  }

  // <meta name="theme-color"> 单独作为 accent 候选，不参与频率统计（避免喧宾夺主成为背景色）
  const tc =
    /<meta[^>]+name=["']theme-color["'][^>]*content=["']#([0-9a-fA-F]{3,6})["']/i.exec(html)?.[1]
    ?? /<meta[^>]+content=["']#([0-9a-fA-F]{3,6})["'][^>]*name=["']theme-color["']/i.exec(html)?.[1]
  const themeColor = tc ? (tc.length === 3 ? expand3(tc) : '#' + tc) : null

  for (const m of html.matchAll(HEX_TOKEN)) {
    const raw = m[1]
    bump(raw.length === 3 ? expand3(raw) : '#' + raw)
  }

  const entries = [...counts.entries()].map(([hex, n]) => ({ hex, n, rgb: hexToRgb(hex) }))
  if (entries.length === 0) return null
  entries.sort((a, b) => b.n - a.n)

  const bg = entries[0].hex
  const bgLum = luminance(hexToRgb(bg))
  const dark = bgLum < 0.5

  const byContrast = [...entries].sort(
    (a, b) => Math.abs(luminance(b.rgb) - bgLum) - Math.abs(luminance(a.rgb) - bgLum)
  )
  let text = byContrast[0].hex
  if (text === bg) text = dark ? '#e4e4e7' : '#1f2430'

  const vivid = entries.filter((e) => saturation(e.rgb) > 0.3 && luminance(e.rgb) > 0.12 && luminance(e.rgb) < 0.9)
  const metaVivid = themeColor && isHexColor(themeColor) && saturation(hexToRgb(themeColor)) > 0.3
  const accent = metaVivid ? themeColor : (vivid[0]?.hex ?? DEFAULT_ACCENT)

  const second = entries.find((e) => e.hex !== bg)
  const card = second?.hex ?? (dark ? '#26272e' : '#ffffff')

  return {
    bg,
    card,
    accent,
    text,
    border: dark ? '#3a3b45' : '#e2e4ea',
    muted: dark ? '#8b8d98' : '#6b7280'
  }
}
