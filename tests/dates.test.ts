import { describe, it, expect } from 'vitest'
import { toDateStr, addDays, diffDays, formatCn } from '../src/renderer/src/lib/dates'

describe('dates', () => {
  it('toDateStr formats local date', () => {
    expect(toDateStr(new Date(2026, 8, 29))).toBe('2026-09-29')
  })
  it('addDays crosses month boundary', () => {
    expect(addDays('2026-09-29', 3)).toBe('2026-10-02')
    expect(addDays('2026-10-02', -3)).toBe('2026-09-29')
  })
  it('diffDays is inclusive-safe', () => {
    expect(diffDays('2026-10-02', '2026-09-29')).toBe(3)
  })
  it('formatCn strips leading zeros', () => {
    expect(formatCn('2026-09-29')).toBe('9/29')
    expect(formatCn('2026-01-05')).toBe('1/5')
  })
})
