import path from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * 外链与页面跳转的白名单。
 *
 * 为什么必须在这里拦：
 * 1. `setWindowOpenHandler` 拿到的 URL 完全来自页面内容（笔记、灵感里的链接）。
 *    直接把任意 URL 交给 `shell.openExternal`，`file://`、`smb://`、自定义协议
 *    都会原样交给系统处理——这是 Electron 安全清单里明确点名的一类问题。
 * 2. 更要命的是窗口本身：默认允许 `<a href>` / `location.href` 把**应用窗口**导航到外部站点；
 *    导航后 preload 会重新注入，外部页面就能拿到全部 IPC 方法（增删改数据库、导出、导入）。
 *    所以除「应用自己的页面」外，一律在 will-navigate 拦下。
 */

/** 只放行日常会用到的三种协议；`javascript:`、`file:`、`data:`、自定义协议一律不交给系统。 */
const SAFE_EXTERNAL_PROTOCOLS = new Set(['https:', 'http:', 'mailto:'])

/** 该 URL 是否可以交给系统浏览器 / 邮件客户端打开。 */
export function isSafeExternalUrl(raw: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (!SAFE_EXTERNAL_PROTOCOLS.has(u.protocol)) return false
  // mailto 没有主机名是正常的；http(s) 必须有
  if (u.protocol !== 'mailto:' && !u.hostname) return false
  return true
}

export interface NavigationAllowlist {
  /** 开发模式下渲染进程的地址（electron-vite dev server） */
  devUrl?: string
  /** 打包后的渲染进程目录（out/renderer） */
  rendererDir: string
}

/**
 * 该导航是否仍停留在应用自己的页面上。
 * 生产环境只认 `rendererDir` 下的 file://；开发环境额外认 dev server 的同源地址。
 */
export function isInternalNavigation(raw: string, allow: NavigationAllowlist): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }

  if (u.protocol === 'file:') {
    const root = pathToFileURL(path.resolve(allow.rendererDir) + path.sep).href
    return u.href.startsWith(root)
  }

  if (allow.devUrl) {
    try {
      return u.origin === new URL(allow.devUrl).origin
    } catch {
      return false
    }
  }

  return false
}
