import { describe, it, expect } from 'vitest'
import {
  ALLOWED_MIMES, MAX_IMAGE_BYTES, assessImage, buildImageName, extFromMime,
  imageUrl, isAllowedImageName
} from '../src/shared/imageName'

const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'

describe('extFromMime', () => {
  it('四种图片 MIME 各自映射到扩展名', () => {
    expect(extFromMime('image/png')).toBe('png')
    expect(extFromMime('image/jpeg')).toBe('jpg')
    expect(extFromMime('image/gif')).toBe('gif')
    expect(extFromMime('image/webp')).toBe('webp')
  })

  it('非图片 MIME 返回 null', () => {
    expect(extFromMime('image/svg+xml')).toBeNull()
    expect(extFromMime('application/pdf')).toBeNull()
    expect(extFromMime('')).toBeNull()
  })

  it('允许清单与映射表一致', () => {
    expect([...ALLOWED_MIMES].sort()).toEqual(['image/gif', 'image/jpeg', 'image/png', 'image/webp'])
  })
})

describe('buildImageName', () => {
  it('拼成 uuid.ext', () => {
    expect(buildImageName(UUID, 'png')).toBe(`${UUID}.png`)
  })

  it('统一转小写', () => {
    expect(buildImageName(UUID.toUpperCase(), 'PNG')).toBe(`${UUID}.png`)
  })
})

describe('isAllowedImageName', () => {
  it('接受合法的 uuid.扩展名', () => {
    for (const ext of ['png', 'jpg', 'jpeg', 'gif', 'webp']) {
      expect(isAllowedImageName(`${UUID}.${ext}`)).toBe(true)
    }
  })

  it('拒绝路径穿越', () => {
    expect(isAllowedImageName('../secret.png')).toBe(false)
    expect(isAllowedImageName(`..\\${UUID}.png`)).toBe(false)
    expect(isAllowedImageName(`sub/${UUID}.png`)).toBe(false)
    expect(isAllowedImageName('C:\\Windows\\x.png')).toBe(false)
    expect(isAllowedImageName(`./${UUID}.png`)).toBe(false)
  })

  it('拒绝非 UUID 名与非法扩展名', () => {
    expect(isAllowedImageName('hello.png')).toBe(false)
    expect(isAllowedImageName(`${UUID}.svg`)).toBe(false)
    expect(isAllowedImageName(`${UUID}.png.exe`)).toBe(false)
    expect(isAllowedImageName('')).toBe(false)
  })

  it('拒绝大写十六进制（生成端一律小写）', () => {
    expect(isAllowedImageName(`${UUID.toUpperCase()}.png`)).toBe(false)
  })
})

describe('assessImage', () => {
  const bytes = new Uint8Array([1, 2, 3])

  it('合法图片返回扩展名', () => {
    expect(assessImage(bytes, 'image/png')).toEqual({ ok: true, ext: 'png' })
  })

  it('不支持的 MIME 被拒绝', () => {
    const r = assessImage(bytes, 'image/svg+xml')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('格式')
  })

  it('空字节被拒绝', () => {
    const r = assessImage(new Uint8Array(0), 'image/png')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('空')
  })

  it('超过 8 MB 被拒绝', () => {
    const r = assessImage(new Uint8Array(MAX_IMAGE_BYTES + 1), 'image/png')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('8 MB')
  })

  it('恰好 8 MB 通过', () => {
    expect(assessImage(new Uint8Array(MAX_IMAGE_BYTES), 'image/png').ok).toBe(true)
  })
})

describe('imageUrl', () => {
  it('拼成自定义协议 URL', () => {
    expect(imageUrl(`${UUID}.png`)).toBe(`lifeos-image://local/${UUID}.png`)
  })

  it('对文件名做 URL 编码', () => {
    expect(imageUrl('a b.png')).toContain('a%20b.png')
  })
})
