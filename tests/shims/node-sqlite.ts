// 测试环境 shim：vite-node 对 node:sqlite 的 externalize 判断有缺陷，
// 通过别名把 'node:sqlite' 映射到此文件，用 createRequire 绕开 Vite 静态解析，
// 由 Node 运行时原生加载内置模块。生产构建不受影响（electron-vite 独立配置）。
import { createRequire } from 'node:module'

const req = createRequire(import.meta.url)
const sqlite = req('node:sqlite') as typeof import('node:sqlite')

export const DatabaseSync = sqlite.DatabaseSync
export const StatementSync = sqlite.StatementSync
