import { describe, it, expect } from 'vitest'
import { distributeColumns, estimateCardHeight } from '../src/shared/waterfall'

describe('estimateCardHeight', () => {
  it('有图固定 200', () => {
    expect(estimateCardHeight({ image_path: 'x.png', text: '很短' })).toBe(200)
    expect(estimateCardHeight({ image_path: 'x.png', text: '' })).toBe(200)
  })

  it('无图按文字长度分档', () => {
    expect(estimateCardHeight({ image_path: null, text: '短' })).toBe(90)
    expect(estimateCardHeight({ image_path: null, text: 'a'.repeat(40) })).toBe(90)
    expect(estimateCardHeight({ image_path: null, text: 'a'.repeat(41) })).toBe(130)
    expect(estimateCardHeight({ image_path: null, text: 'a'.repeat(120) })).toBe(130)
    expect(estimateCardHeight({ image_path: null, text: 'a'.repeat(121) })).toBe(170)
  })

  it('空文本按最短档', () => {
    expect(estimateCardHeight({ image_path: null, text: '' })).toBe(90)
  })
})

describe('distributeColumns', () => {
  const h = (n: number) => () => n

  it('按最短列优先分配', () => {
    // 三张等高卡分到 2 列：1→列0，2→列1，3→列0（此时列0 累计 100 与列1 相同，选最左）
    const cols = distributeColumns([1, 2, 3], 2, h(100))
    expect(cols[0]).toEqual([1, 3])
    expect(cols[1]).toEqual([2])
  })

  it('高度相同时选最左列（确定性）', () => {
    const cols = distributeColumns([1, 2], 2, h(50))
    expect(cols[0]).toEqual([1])
    expect(cols[1]).toEqual([2])
  })

  it('不等高时能把长卡分到较短的列', () => {
    const heights: Record<number, number> = { 1: 200, 2: 90, 3: 90 }
    const cols = distributeColumns([1, 2, 3], 2, (x: number) => heights[x])
    expect(cols[0]).toEqual([1])
    expect(cols[1]).toEqual([2, 3])
  })

  it('单列时全部进同一列', () => {
    expect(distributeColumns([1, 2, 3], 1, h(10))).toEqual([[1, 2, 3]])
  })

  it('列数为 0 或负数返回空数组', () => {
    expect(distributeColumns([1], 0, h(1))).toEqual([])
    expect(distributeColumns([1], -2, h(1))).toEqual([])
  })

  it('空输入返回对应数量的空列', () => {
    expect(distributeColumns([], 3, h(1))).toEqual([[], [], []])
  })

  it('不丢卡、不重复，且保持原始相对顺序', () => {
    const cols = distributeColumns([1, 2, 3, 4, 5], 3, (x: number) => x * 10)
    expect(cols.flat().sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5])
    // 每列内部顺序与入参一致
    for (const col of cols) expect([...col].sort((a, b) => a - b)).toEqual(col)
  })

  it('不修改入参', () => {
    const items = [1, 2, 3]
    distributeColumns(items, 2, h(1))
    expect(items).toEqual([1, 2, 3])
  })

  it('同样输入总是得到同样结果（可复现）', () => {
    const a = distributeColumns([1, 2, 3, 4, 5, 6], 3, (x: number) => (x % 2 ? 100 : 150))
    const b = distributeColumns([1, 2, 3, 4, 5, 6], 3, (x: number) => (x % 2 ? 100 : 150))
    expect(a).toEqual(b)
  })
})
