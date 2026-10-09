import { describe, it, expect } from 'vitest'
import { columnsOf, planMove, type Positioned } from '../src/shared/kanban'

const p = (id: number, column: 'todo' | 'doing' | 'done', position: number): Positioned => ({ id, column, position })

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
