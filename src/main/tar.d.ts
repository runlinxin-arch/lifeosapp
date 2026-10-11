/**
 * node-tar 未随包发布类型，这里按本项目用到的子集补最小声明。
 * 只用到 tar.c（打包）与 tar.x（解包）。
 */
declare module 'tar' {
  export interface TarOptions {
    gzip?: boolean
    file?: string
    cwd?: string
    [key: string]: unknown
  }
  export function c(options: TarOptions, entries: readonly string[]): Promise<void>
  export function x(options: TarOptions): Promise<void>
}
