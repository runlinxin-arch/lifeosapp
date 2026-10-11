export type RestartStrategy = 'relaunch' | 'manual'

/**
 * 导入后的重启策略：
 * - 打包版（已安装）用 `app.relaunch()` 自动重启；
 * - 开发模式（electron-vite dev 拉起）下 `app.relaunch()` 重启行为不保证，
 *   改为提示用户手动重启（关闭后重新运行 npm run dev）。
 */
export function restartStrategy(isPackaged: boolean): RestartStrategy {
  return isPackaged ? 'relaunch' : 'manual'
}
