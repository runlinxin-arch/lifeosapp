import { describe, it, expect, beforeEach } from 'vitest'
import { openDb } from '../src/main/db'
import { listRange, createLongTask, deleteLongTask } from '../src/main/db/longTasks'

let db: ReturnType<typeof openDb>
beforeEach(() => { db = openDb(':memory:') })

describe('longTasks', () => {
  it('creates with default color', () => {
    const t = createLongTask(db, { title: '备考', startDate: '2026-10-01', endDate: '2026-12-01' })
    expect(t.color).toBe('#8b8d98')
  })
  it('listRange returns overlapping tasks only', () => {
    createLongTask(db, { title: 'A', startDate: '2026-09-01', endDate: '2026-10-15' })
    createLongTask(db, { title: 'B', startDate: '2026-11-01', endDate: '2026-11-30' })
    const r = listRange(db, '2026-09-29', '2026-10-29')
    expect(r.map((x) => x.title)).toEqual(['A'])
  })
  it('deletes', () => {
    const t = createLongTask(db, { title: 'A', startDate: '2026-09-01', endDate: '2026-09-30' })
    deleteLongTask(db, t.id)
    expect(listRange(db, '2026-09-01', '2026-09-30')).toHaveLength(0)
  })
})
