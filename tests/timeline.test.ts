import { describe, it, expect } from 'vitest'
import {
  calcBlocks, timelineBarHeight, timelineGridHeight, timelineHeight,
  TIMELINE_BOTTOM_PAD, TIMELINE_GRID_MAX_H, TIMELINE_MIN_H, TIMELINE_ROW_GAP, TIMELINE_TOP_PAD
} from '../src/renderer/src/lib/timeline'
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

describe('timelineGridHeight', () => {
  it('未封顶时等于泳道数 × 行高 + 底部留白', () => {
    expect(timelineGridHeight(false, 3)).toBe(3 * (8 + TIMELINE_ROW_GAP) + TIMELINE_BOTTOM_PAD)
    expect(timelineGridHeight(true, 3)).toBe(3 * (14 + TIMELINE_ROW_GAP) + TIMELINE_BOTTOM_PAD)
  })

  it('泳道数非法时按 1 条处理', () => {
    expect(timelineGridHeight(true, 0)).toBe(timelineGridHeight(true, 1))
    expect(timelineGridHeight(true, -5)).toBe(timelineGridHeight(true, 1))
    expect(timelineGridHeight(true, NaN)).toBe(timelineGridHeight(true, 1))
    expect(timelineGridHeight(true, 2.7)).toBe(timelineGridHeight(true, 2))
  })

  it('超出上限后封顶，转为内部滚动而不是继续长高', () => {
    expect(timelineGridHeight(true, 99)).toBe(TIMELINE_GRID_MAX_H)
    expect(timelineGridHeight(true, 1000)).toBe(TIMELINE_GRID_MAX_H)
  })
})

describe('timelineHeight（隐患修复回归：标题栏必须容得下展开态）', () => {
  it('紧凑单泳道保持基线高度', () => {
    expect(timelineHeight(false, 1)).toBe(TIMELINE_MIN_H)
  })

  it('展开态必然高于固定 40px 的旧实现', () => {
    expect(timelineHeight(true, 1)).toBeGreaterThan(40)
    expect(timelineHeight(true, 1)).toBe(TIMELINE_TOP_PAD + timelineGridHeight(true, 1) + TIMELINE_BOTTOM_PAD)
  })

  it('高度始终不小于色块区所需空间（不会裁切色块）', () => {
    for (const expanded of [false, true]) {
      for (let lanes = 0; lanes <= 10; lanes++) {
        expect(timelineHeight(expanded, lanes)).toBeGreaterThanOrEqual(
          TIMELINE_TOP_PAD + timelineGridHeight(expanded, lanes)
        )
      }
    }
  })

  it('3 条并发长期任务展开时的高度大于旧的 40px 固定值', () => {
    expect(timelineHeight(true, 3)).toBe(80)
    expect(timelineHeight(true, 3)).toBeGreaterThan(40)
  })

  it('随泳道数单调不减', () => {
    for (let lanes = 0; lanes <= 12; lanes++) {
      expect(timelineHeight(true, lanes + 1)).toBeGreaterThanOrEqual(timelineHeight(true, lanes))
    }
  })

  it('封顶后不再增长，避免时间轴吃掉主内容区', () => {
    const cap = TIMELINE_TOP_PAD + TIMELINE_GRID_MAX_H + TIMELINE_BOTTOM_PAD
    expect(timelineHeight(true, 99)).toBe(cap)
    expect(timelineHeight(true, 1000)).toBe(cap)
    expect(cap).toBeLessThan(200)
  })
})

describe('timelineBarHeight', () => {
  it('展开比紧凑高，且取值固定', () => {
    expect(timelineBarHeight(false)).toBe(8)
    expect(timelineBarHeight(true)).toBe(14)
  })
})
