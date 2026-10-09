import { app, net, protocol } from 'electron'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { assessImage, buildImageName, isAllowedImageName } from '@shared/imageName'

export const IMAGE_SCHEME = 'lifeos-image'

export function imagesDir(): string {
  return path.join(app.getPath('userData'), 'images')
}

/** 必须在 app ready 之前调用，否则 <img src="lifeos-image://..."> 会被拦截 */
export function registerImageScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: IMAGE_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
  ])
}

/**
 * 双重校验后才允许读取：
 * 1. 文件名必须命中 UUID + 图片扩展名白名单（不含路径分隔符）
 * 2. 解析后的绝对路径的父目录必须正好是 images/
 */
export function resolveImagePath(name: string): string | null {
  if (!isAllowedImageName(name)) return null
  const dir = path.resolve(imagesDir())
  const full = path.resolve(dir, name)
  if (path.dirname(full) !== dir) return null
  return full
}

/** app ready 之后调用 */
export function registerImageProtocol(): void {
  fs.mkdirSync(imagesDir(), { recursive: true })

  protocol.handle(IMAGE_SCHEME, async (request) => {
    let name: string
    try {
      name = decodeURIComponent(new URL(request.url).pathname.replace(/^\/+/, ''))
    } catch {
      return new Response('bad request', { status: 400 })
    }

    const full = resolveImagePath(name)
    if (!full) return new Response('forbidden', { status: 403 })
    if (!fs.existsSync(full)) return new Response('not found', { status: 404 })
    return net.fetch(pathToFileURL(full).toString())
  })
}

/** 写入图片，返回**文件名**（不含目录）。渲染进程永远拿不到也提供不了路径。 */
export function saveImageFile(bytes: Uint8Array, mime: string): string {
  const assessed = assessImage(bytes, mime)
  if (!assessed.ok) throw new Error(assessed.reason)

  fs.mkdirSync(imagesDir(), { recursive: true })
  const name = buildImageName(randomUUID(), assessed.ext)
  const full = resolveImagePath(name)!
  fs.writeFileSync(full, bytes)
  return name
}

/** 删除图片文件；null 与「文件已不存在」都不算错（记录已删就该成功） */
export function deleteImageFile(name: string | null): void {
  if (!name) return
  const full = resolveImagePath(name)
  if (!full) return
  try {
    fs.unlinkSync(full)
  } catch {
    // 文件已被删除或不可访问：不该因此让整个删除操作失败
  }
}
