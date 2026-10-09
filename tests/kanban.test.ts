import { describe, it, expect } from 'vitest'
import { columnsOf, dropIndexFromY, planMove, type Positioned } from '../src/shared/kanban'

const p = (id: number, column: 'todo' | 'doing' | 'done', position: number): Positioned => ({ id, column, position })

describe('dropIndexFromY', () => {
  // 三张卡：0-40 / 44-84 / 88-128，中线分别 20 / 64 / 108
  const cards = [
    { top: 0, height: 40 },
    { top: 44, height: 40 },
    { top: 88, height: 40 }
  ]

  it('指针在第一张上半部 → 插到最前', () => {
    expect(dropIndexFromY(cards, 5)).toBe(0)
    expect(dropIndexFromY(cards, 19)).toBe(0)
  })

  it('指针过第一张中线 → 插到第二张前', () => {
    expect(dropIndexFromY(cards, 21)).toBe(1)
    expect(dropIndexFromY(cards, 63)).toBe(1)
  })

  it('指针过第二张中线 → 插到第三张前', () => {
    expect(dropIndexFromY(cards, 65)).toBe(2)
    expect(dropIndexFromY(cards, 107)).toBe(2)
  })

  it('指针在最后一张中线之下 → 插到末尾', () => {
    expect(dropIndexFromY(cards, 109)).toBe(3)
    expect(dropIndexFromY(cards, 999)).toBe(3)
  })

  it('恰好等于中线时算「下一张之前」', () => {
    expect(dropIndexFromY(cards, 20)).toBe(1)
    expect(dropIndexFromY(cards, 64)).toBe(2)
  })

  it('指针在列顶部之上 → 0', () => {
    expect(dropIndexFromY(cards, -50)).toBe(0)
  })

  it('空列返回 0', () => {
    expect(dropIndexFromY([], 123)).toBe(0)
  })

  it('单张卡：上半插前、下半插后', () => {
    const one = [{ top: 10, height: 40 }]
    expect(dropIndexFromY(one, 15)).toBe(0)
    expect(dropIndexFromY(one, 35)).toBe(1)
  })

  it('结果恒在 [0, 卡片数] 区间内', () => {
    for (const y of [-100, 0, 30, 60, 100, 500]) {
      const i = dropIndexFromY(cards, y)
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThanOrEqual(cards.length)
    }
  })
})

describe('planMove', () => {
  const board: Positioned[] = [
    p(1, 'todo', 0), p(2, 'todo', 1), p(3, 'todo', 2),
    p(4, 'doing', 0), p(5, 'doing', 1)
  ]

  it('跨列移动到指定位置并重排两列', () => {
    const next = planMove(board, 2, 'doing', 1)
    const byId = new Map(next.map((x) => [x.id, x]))
    expect(byId.get(2)).toMatchObject({ column: 'doing', position: 1 })
    expect(byId.get(4)).toMatchObject({ column: 'doing', position: 0 })
    expect(byId.get(5)).toMatchObject({ column: 'doing', position: 2 })
    // 原列重排无空洞
    expect(byId.get(1)).toMatchObject({ column: 'todo', position: 0 })
    expect(byId.get(3)).toMatchObject({ column: 'todo', position: 1 })
  })

  it('列内重排', () => {
    const next = planMove(board, 3, 'todo', 0)
    expect(columnsOf(next).todo.map((x) => x.id)).toEqual([3, 1, 2])
  })

  it('插到列首', () => {
    const next = planMove(board, 3, 'doing', 0)
    expect(columnsOf(next).doing.map((x) => x.id)).toEqual([3, 4, 5])
  })

  it('插到列尾（索引越界夹紧）', () => {
    const next = planMove(board, 1, 'doing', 99)
    expect(columnsOf(next).doing.map((x) => x.id)).toEqual([4, 5, 1])
  })

  it('负数索引夹到 0', () => {
    const next = planMove(board, 1, 'doing', -5)
    expect(columnsOf(next).doing.map((x) => x.id)).toEqual([1, 4, 5])
  })

  it('移动到空列', () => {
    const next = planMove(board, 1, 'done', 0)
    expect(columnsOf(next).done.map((x) => x.id)).toEqual([1])
    expect(columnsOf(next).todo.map((x) => x.id)).toEqual([2, 3])
  })

  it('把最后一列的最后一张移走后原列变空', () => {
    const single: Positioned[] = [p(1, 'todo', 0)]
    const next = planMove(single, 1, 'done', 0)
    expect(columnsOf(next).todo).toEqual([])
    expect(columnsOf(next).done.map((x) => x.id)).toEqual([1])
  })

  it('同一张卡移到原位不改变顺序', () => {
    const next = planMove(board, 2, 'todo', 1)
    expect(columnsOf(next).todo.map((x) => x.id)).toEqual([1, 2, 3])
  })

  it('未知 taskId 原样返回', () => {
    expect(planMove(board, 999, 'doing', 0)).toEqual(board)
  })

  it('不修改入参', () => {
    const copy = JSON.parse(JSON.stringify(board))
    planMove(board, 2, 'doing', 1)
    expect(board).toEqual(copy)
  })

  it('返回的 position 在每列内都是连续的 0..n-1', () => {
    const next = planMove(board, 2, 'doing', 1)
    const cols = columnsOf(next)
    for (const c of ['todo', 'doing', 'done'] as const) {
      expect(cols[c].map((x) => x.position)).toEqual(cols[c].map((_, i) => i))
    }
  })

  it('返回条数与入参一致', () => {
    expect(planMove(board, 2, 'doing', 1)).toHaveLength(board.length)
  })
})

describe('columnsOf', () => {
  it('按列分组并按 position 升序', () => {
    const items = [p(1, 'todo', 2), p(2, 'todo', 0), p(3, 'doing', 0)]
    expect(columnsOf(items).todo.map((x) => x.id)).toEqual([2, 1])
    expect(columnsOf(items).doing.map((x) => x.id)).toEqual([3])
    expect(columnsOf(items).done).toEqual([])
  })

  it('position 相同时按 id 稳定排序', () => {
    const items = [p(5, 'todo', 0), p(3, 'todo', 0)]
    expect(columnsOf(items).todo.map((x) => x.id)).toEqual([3, 5])
  })

  it('空输入返回三个空列', () => {
    expect(columnsOf([])).toEqual({ todo: [], doing: [], done: [] })
  })
})
