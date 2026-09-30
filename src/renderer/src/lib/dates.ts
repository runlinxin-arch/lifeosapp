// 日期工具的实现在 src/shared/dates.ts（主进程与渲染进程共用）。
// 这里保留原路径的 re-export，避免 M1 时期的大量 `../../lib/dates` 导入全部改签名。
export * from '@shared/dates'
