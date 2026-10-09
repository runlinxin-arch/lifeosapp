import type { ModuleKey } from './types'

/** 长期任务的来源回指（source_module + source_id） */
export interface LongTaskSourceRef {
  source_module: string | null
  source_id: number | null
}

/**
 * 判断某条长期任务是否由指定来源标记而来。
 * 模块事项（学习项/开发项目…）用它决定按钮显示"标记"还是"已上轴"。
 */
export function isMarkedFrom(
  refs: LongTaskSourceRef[],
  sourceModule: ModuleKey | 'event',
  sourceId: number
): boolean {
  return refs.some((r) => r.source_module === sourceModule && r.source_id === sourceId)
}
