import { describe, it, expect } from 'vitest'
import { extractThemeColors, hexToRgb } from '../src/shared/themeExtract'

describe('extractThemeColors', () => {
  it('无颜色时返回 null', () => {
    expect(extractThemeColors('')).toBeNull()
    expect(extractThemeColors('<html><body>没有颜色的页面</body></html>')).toBeNull()
  })

  it('频率最高的颜色作为背景，最高对比度颜色作为正文', () => {
    const html = '<style>body{background:#111111;color:#eeeeee}</style><div style="background:#111111">x</div>'
    const p = extractThemeColors(html)!
    expect(p.bg).toBe('#111111')
    expect(p.text).toBe('#eeeeee')
  })

  it('theme-color 元信息优先作为强调色', () => {
    const html = '<meta name="theme-color" content="#e040fb"><style>body{background:#101010;color:#101010}</style><div>#101010</div>'
    const p = extractThemeColors(html)!
    expect(p.bg).toBe('#101010')
    expect(p.accent).toBe('#e040fb')
  })

  it('3 位十六进制展开为 6 位', () => {
    const p = extractThemeColors('<body style="background:#123">x</body>')!
    expect(p.bg).toBe('#112233')
  })

  it('单一颜色时正文回退默认（避免正文与背景同色）', () => {
    const p = extractThemeColors('<body style="background:#101010">x</body>')!
    expect(p.bg).toBe('#101010')
    expect(p.text).not.toBe('#101010')
  })
})

describe('hexToRgb', () => {
  it('解析十六进制为 RGB 三元组', () => {
    expect(hexToRgb('#ffffff')).toEqual([255, 255, 255])
    expect(hexToRgb('#000000')).toEqual([0, 0, 0])
    expect(hexToRgb('#e040fb')).toEqual([224, 64, 251])
  })
})
