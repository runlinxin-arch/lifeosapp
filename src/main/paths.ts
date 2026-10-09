import path from 'node:path'

/**
 * 覆盖应用数据目录的环境变量。
 * 验收/E2E 把它指向临时目录，这样清库、造数据都不会碰到用户的真实数据。
 */
export const DATA_DIR_ENV = 'LIFEOS_DATA_DIR'

/**
 * 解析应用数据目录（app.db / images / backups 的父目录）。
 *
 * - 环境变量存在且去空白后非空 → 取其绝对路径（相对路径按当前工作目录解析）
 * - 未设置 / 空串 / 纯空白 → 回退到 Electron 的 `app.getPath('userData')`
 *
 * 纯函数：不读全局状态，便于单测；主进程在启动时调用一次。
 */
export function resolveDataDir(env: Record<string, string | undefined>, fallback: string): string {
  const raw = env[DATA_DIR_ENV]
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  return trimmed ? path.resolve(trimmed) : fallback
}
