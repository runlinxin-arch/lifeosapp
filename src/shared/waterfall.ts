import type { Inspiration } from './types'

/**
 * 瀑布流卡片高度估算。
 * 有图固定高度；无图按文字长度分档。
 * 不需要精确——只用于列分配，避免依赖 DOM 测量（那样就无法单测）。
 */
export function estimateCardHeight(item: Pick<Inspiration, 'image_path' | 'text'>): number {
  if (item.image_path) return 200
  const len = item.text.length
  if (len <= 40) return 90
  if (len <= 120) return 130
  return 170
}

/**
 * 贪心最短列优先：每张卡放进当前累计高度最小的列。
 * 高度相同时选最左列，保证结果确定（可复现、可断言）。
 * 不修改入参；columnCount <= 0 返回 []。
 */
export function distributeColumns<T>(
  items: T[],
  columnCount: number,
  heightOf: (item: T) => number
): T[][] {
  if (columnCount <= 0) return []
  const cols: T[][] = Array.from({ length: columnCount }, () => [])
  const heights = new Array<number>(columnCount).fill(0)

  for (const item of items) {
    let target = 0
    for (let i = 1; i < columnCount; i++) {
      if (heights[i] < heights[target]) target = i
    }
    cols[target].push(item)
    heights[target] += heightOf(item)
  }
  return cols
}
