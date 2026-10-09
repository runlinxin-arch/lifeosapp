import type { DatabaseSync } from 'node:sqlite'
import type { CaptureInput, Inspiration } from '@shared/types'
import { createInspiration } from './db/inspiration'

/**
 * 注入式图片存储：让捕获编排可以**在不接触真实文件系统**的前提下被单测。
 * 生产环境由 ipc.ts 传入 images.ts 的 saveImageFile / deleteImageFile。
 */
export interface ImageStore {
  save(bytes: Uint8Array, mime: string): string
  remove(name: string | null): void
}

/**
 * 三合一捕获编排。
 *
 * 图片路径的关键约束：**先写文件、再落库**；若落库失败必须回收刚写入的文件，
 * 否则会留下无人引用的孤儿图片。
 */
export function capture(db: DatabaseSync, input: CaptureInput, store: ImageStore): Inspiration {
  if (input.kind !== 'image') {
    return createInspiration(db, {
      text: input.text ?? '',
      sourceUrl: input.sourceUrl ?? null,
      boardId: input.boardId ?? null,
      tags: input.tags ?? []
    })
  }

  if (!input.imageBytes || input.imageBytes.length === 0) throw new Error('图片内容为空')

  // 存储层负责 MIME / 大小校验；它抛错时文件根本没写成，不需要回收
  const name = store.save(input.imageBytes, input.imageMime ?? '')

  try {
    return createInspiration(db, {
      text: input.text ?? '',
      sourceUrl: input.sourceUrl ?? null,
      boardId: input.boardId ?? null,
      tags: input.tags ?? [],
      imagePath: name
    })
  } catch (err) {
    store.remove(name)
    throw err
  }
}
