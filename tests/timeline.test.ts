import { describe, it, expect } from 'vitest'
import { calcBlocks } from '../src/renderer/src/lib/timeline'
import type { LongTask } from '../src/shared/types'

const lt = (id: number, s: string, e: string): LongTask => ({
  id, title: `T${id}`, start_date: s, end_date: e, color: '#fff',
  source_module: null, source_id: null, created_at: '', updated_at: ''
})

describe('calcBlocks', () => {
  it('clamps to range and computes percents', () => {
    const blocks = calcBlocks([lt(1, '2026-09-01', '2026-10-31')], '2026-09-29', '2026-10-28')
    expect(blocks[0].leftPct).toBe(0)
    expect(blocks[0].widthPct).toBeCloseTo(100)
  })
  it('assigns lanes to overlapping tasks', () => {
    const blocks = calcBlocks([lt(1, '2026-09-29', '2026-10-05'), lt(2, '2026-10-01', '2026-10-08')], '2026-09-29', '2026-10-28')
    expect(blocks[0].lane).toBe(0)
    expect(blocks[1].lane).toBe(1)
  })
  it('non-overlapping tasks share lane 0', () => {
    const blocks = calcBlocks([lt(1, '2026-09-29', '2026-10-05'), lt(2, '2026-10-06', '2026-10-08')], '2026-09-29', '2026-10-28')
    expect(blocks.every((b) => b.lane === 0)).toBe(true)
  })
})
