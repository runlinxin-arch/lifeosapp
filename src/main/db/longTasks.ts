import type { DatabaseSync } from 'node:sqlite'
import type { LongTask } from '@shared/types'

export interface LongTaskInput {
  title: string
  startDate: string
  endDate: string
  color?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToLongTask = (r: any): LongTask => r as LongTask

export function listRange(db: DatabaseSync, from: string, to: string): LongTask[] {
  return db.prepare(`
    SELECT * FROM long_tasks
    WHERE start_date <= ? AND end_date >= ?
    ORDER BY start_date ASC, id ASC
  `).all(to, from).map(rowToLongTask)
}

export function createLongTask(db: DatabaseSync, input: LongTaskInput): LongTask {
  const info = db.prepare(`
    INSERT INTO long_tasks (title, start_date, end_date, color)
    VALUES (?, ?, ?, ?)
  `).run(input.title, input.startDate, input.endDate, input.color ?? '#8b8d98')
  const row = db.prepare('SELECT * FROM long_tasks WHERE id = ?').get(Number(info.lastInsertRowid))
  return rowToLongTask(row)
}

export function deleteLongTask(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM long_tasks WHERE id = ?').run(id)
}
