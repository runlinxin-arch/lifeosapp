import { describe, it, expect } from 'vitest'
import { isMarkedFrom, type LongTaskSourceRef } from '../src/shared/longTaskSource'

const ref = (m: string | null, id: number | null): LongTaskSourceRef => ({ source_module: m, source_id: id })

describe('isMarkedFrom', () => {
  it('模块与 id 都匹配才算已标记', () => {
    expect(isMarkedFrom([ref('learning', 3)], 'learning', 3)).toBe(true)
  })

  it('模块不同不算', () => {
    expect(isMarkedFrom([ref('dev', 3)], 'learning', 3)).toBe(false)
  })

  it('id 不同不算', () => {
    expect(isMarkedFrom([ref('learning', 4)], 'learning', 3)).toBe(false)
  })

  it('空列表返回 false', () => {
    expect(isMarkedFrom([], 'learning', 1)).toBe(false)
  })

  it('独立长期任务（来源为空）不会误判', () => {
    expect(isMarkedFrom([ref(null, null)], 'learning', 1)).toBe(false)
  })

  it('多条中命中任意一条即可', () => {
    const refs = [ref(null, null), ref('dev', 9), ref('learning', 3)]
    expect(isMarkedFrom(refs, 'learning', 3)).toBe(true)
  })

  it('同一模块下不同 id 互不干扰', () => {
    const refs = [ref('learning', 1), ref('learning', 2)]
    expect(isMarkedFrom(refs, 'learning', 2)).toBe(true)
    expect(isMarkedFrom(refs, 'learning', 3)).toBe(false)
  })
})
