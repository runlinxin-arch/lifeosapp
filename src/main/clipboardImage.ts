/**
 * 读取剪贴板里的图片。
 *
 * 走主进程的 `clipboard` 而不是渲染进程的 `navigator.clipboard`：
 * 前者不需要用户授权、不依赖焦点。
 *
 * 注意 Electron 44 的 Clipboard 是 W3C 风格的**异步**接口
 * （`read(): Promise<ClipboardItem[]>`），早期版本的同步 `readImage()` 已不存在。
 *
 * 依赖以接口注入，因此选型与转字节的逻辑可以在不启动 Electron 的前提下单测。
 */

export interface ClipboardItemLike {
  /** 平台当前为该条目提供的 MIME 类型列表 */
  readonly types: string[]
  /**
   * 返回该 MIME 的内容。这里故意声明为 `unknown`：
   * Electron 的 `getType` 对 bookmark 类型走另一个重载，联合返回类型无法直接赋给 `Promise<Blob>`。
   */
  getType(type: string): Promise<unknown>
}

export interface ClipboardLike {
  read(): Promise<ClipboardItemLike[]>
}

export interface ClipboardImage {
  bytes: Uint8Array
  mime: string
}

/** 优先无损 PNG，其余按应用支持的格式挑选 */
const PREFERRED_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

/**
 * 取剪贴板里的第一张图片并转成字节。
 * 剪贴板没有图片时返回 null；平台只提供非图片类型时同样返回 null。
 */
export async function readClipboardImage(clip: ClipboardLike): Promise<ClipboardImage | null> {
  const items = await clip.read()

  for (const item of items) {
    const type =
      PREFERRED_MIMES.find((t) => item.types.includes(t)) ??
      item.types.find((t) => t.startsWith('image/'))
    if (!type) continue

    const raw = await item.getType(type)
    if (!raw || typeof (raw as Blob).arrayBuffer !== 'function') continue

    const buf = await (raw as Blob).arrayBuffer()
    if (buf.byteLength === 0) continue

    return { bytes: new Uint8Array(buf), mime: type }
  }

  return null
}
