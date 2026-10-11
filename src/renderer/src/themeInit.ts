/**
 * 首屏主题初始化：在 React 挂载前，用主进程启动时读取到的主题色板设置 CSS 变量，
 * 避免浅色用户启动时先闪一下深色。主进程通过 additionalArguments 注入，
 * 预加载脚本解析后暴露为 window.__lifeosTheme（类型见 lib/ipc.ts 的全局声明）。
 */
const t = window.__lifeosTheme
if (t) {
  const root = document.documentElement
  for (const key of ['bg', 'card', 'border', 'accent', 'text', 'muted'] as const) {
    const v = t[key]
    if (v) root.style.setProperty(`--${key}`, v)
  }
}
