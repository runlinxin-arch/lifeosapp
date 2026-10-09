import type { DevColumn } from './types'

export const DEV_COLUMNS: readonly DevColumn[] = ['todo', 'doing', 'done']

export interface Positioned {
  id: number
  column: DevColumn
  position: number
}

/** 按列分组，列内按 position 升序（position 相同按 id 稳定排序） */
export function columnsOf(items: Positioned[]): Record<DevColumn, Positioned[]> {
  const out: Record<DevColumn, Positioned[]> = { todo: [], doing: [], done: [] }
  for (const c of DEV_COLUMNS) {
    out[c] = items
      .filter((x) => x.column === c)
      .sort((a, b) => a.position - b.position || a.id - b.id)
  }
  return out
}

/**
 * 由鼠标 Y 坐标算出插入索引。
 *
 * 判定规则：从上往下找第一张「中线在指针下方」的卡片，插到它前面；都不满足则插到末尾。
 * 这样整列都是有效投放区（而不是只有卡片之间的窄缝），落点也更符合直觉。
 */
export function dropIndexFromY(cards: { top: number; height: number }[], clientY: number): number {
  for (let i = 0; i < cards.length; i++) {
    const mid = cards[i].top + cards[i].height / 2
    if (clientY < mid) return i
  }
  return cards.length
}

/**
 * 纯函数：把 taskId 移到 toColumn 的 toIndex 位置，返回**完整**的新列表。
 * - toIndex 越界会夹到 [0, 目标列长度]
 * - 移动后原列与目标列都重排为 0..n-1，不留空洞
 * - 未受影响的列原样返回
 * - 不修改入参；未知 taskId 时原样返回
 */
export function planMove(
  items: Positioned[],
  taskId: number,
  toColumn: DevColumn,
  toIndex: number
): Positioned[] {
  const moving = items.find((x) => x.id === taskId)
  if (!moving) return items

  const cols = columnsOf(items)
  const fromColumn = moving.column
  cols[fromColumn] = cols[fromColumn].filter((x) => x.id !== taskId)

  const target = cols[toColumn]
  const idx = Math.max(0, Math.min(Math.floor(toIndex), target.length))
  const nextTarget = [...target.slice(0, idx), { ...moving, column: toColumn }, ...target.slice(idx)]

  const out: Positioned[] = []
  for (const c of DEV_COLUMNS) {
    const list = c === toColumn ? nextTarget : cols[c]
    list.forEach((item, i) => out.push({ id: item.id, column: c, position: i }))
  }
  return out
}
