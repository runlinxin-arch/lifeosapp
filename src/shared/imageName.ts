/**
 * 图片文件名与 MIME 的纯函数：主进程与渲染进程共用，不依赖 fs 与 electron。
 * 安全边界都收敛在这里，便于单测覆盖。
 */

export const IMAGE_MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp'
}

export const ALLOWED_MIMES: readonly string[] = Object.keys(IMAGE_MIME_EXT)
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024

/** 只认 4 种图片 MIME */
export function extFromMime(mime: string): string | null {
  return IMAGE_MIME_EXT[mime] ?? null
}

/** 严格白名单：小写 UUID + 允许的扩展名；不含任何路径分隔符 */
const IMAGE_NAME_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|gif|webp)$/

export function isAllowedImageName(name: string): boolean {
  return IMAGE_NAME_RE.test(name)
}

export function buildImageName(uuid: string, ext: string): string {
  return `${uuid.toLowerCase()}.${ext.toLowerCase()}`
}

export function imageUrl(name: string): string {
  return `lifeos-image://local/${encodeURIComponent(name)}`
}

export type ImageAssessment = { ok: true; ext: string } | { ok: false; reason: string }

/** 依次校验 MIME → 非空 → 大小上限 */
export function assessImage(bytes: Uint8Array, mime: string): ImageAssessment {
  const ext = extFromMime(mime)
  if (!ext) return { ok: false, reason: `不支持的图片格式：${mime || '（空）'}` }
  if (bytes.length === 0) return { ok: false, reason: '图片内容为空' }
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, reason: '图片过大（最大 8 MB）' }
  return { ok: true, ext }
}
