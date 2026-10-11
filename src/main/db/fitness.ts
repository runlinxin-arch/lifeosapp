import type { DatabaseSync } from 'node:sqlite'
import type {
  BodyMetric, BodyMetricInput, WorkoutLog, WorkoutLogInput, WorkoutLogPatch,
  WorkoutPlan, WorkoutPlanInput, WorkoutPlanPatch
} from '@shared/types'
import { parseSchedule, parseWorkoutContent, scheduleToJson, workoutContentToJson } from '@shared/fitnessContent'
import { assertDateStr, assertNonEmpty } from './validate'

export type {
  BodyMetricInput, WorkoutLogInput, WorkoutLogPatch, WorkoutPlanInput, WorkoutPlanPatch
} from '@shared/types'

const MAX_WEIGHT_KG = 500

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asPlan = (r: any): WorkoutPlan => ({ ...r, schedule: parseSchedule(String(r.schedule ?? '{}')) })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asLog = (r: any): WorkoutLog => ({ ...r, content: parseWorkoutContent(String(r.content ?? '[]')) })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asMetric = (r: any): BodyMetric => r as BodyMetric

function assertWeight(w: number): void {
  if (!Number.isFinite(w) || w <= 0 || w > MAX_WEIGHT_KG) {
    throw new Error(`体重必须大于 0 且不超过 ${MAX_WEIGHT_KG}`)
  }
}

function assertBodyFat(f: number | null | undefined): void {
  if (f === null || f === undefined) return
  if (!Number.isFinite(f) || f <= 0 || f > 100) throw new Error('体脂率必须大于 0 且不超过 100')
}

// ---------- 训练计划 ----------

export function listPlans(db: DatabaseSync): WorkoutPlan[] {
  return db.prepare('SELECT * FROM workout_plans ORDER BY id ASC').all().map(asPlan)
}

export function getPlan(db: DatabaseSync, id: number): WorkoutPlan | null {
  const row = db.prepare('SELECT * FROM workout_plans WHERE id = ?').get(id)
  return row ? asPlan(row) : null
}

export function createPlan(db: DatabaseSync, input: WorkoutPlanInput): WorkoutPlan {
  const name = assertNonEmpty(input.name, '计划名称')
  const info = db.prepare('INSERT INTO workout_plans (name, schedule) VALUES (?, ?)')
    .run(name, scheduleToJson(input.schedule ?? {}))
  return getPlan(db, Number(info.lastInsertRowid))!
}

export function updatePlan(db: DatabaseSync, id: number, patch: WorkoutPlanPatch): WorkoutPlan {
  const cur = getPlan(db, id)
  if (!cur) throw new Error(`workout_plan ${id} not found`)

  const name = patch.name !== undefined ? assertNonEmpty(patch.name, '计划名称') : cur.name
  const schedule = patch.schedule !== undefined ? patch.schedule : cur.schedule

  db.prepare(`
    UPDATE workout_plans SET name=?, schedule=?, updated_at=datetime('now','localtime') WHERE id=?
  `).run(name, scheduleToJson(schedule), id)
  return getPlan(db, id)!
}

/** 删除计划：打卡记录因外键 SET NULL 保留，历史不丢 */
export function deletePlan(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM workout_plans WHERE id = ?').run(id)
}

// ---------- 训练打卡 ----------

export function listLogs(db: DatabaseSync, from?: string, to?: string): WorkoutLog[] {
  const sql = from && to
    ? 'SELECT * FROM workout_logs WHERE date >= ? AND date <= ? ORDER BY date DESC, id DESC'
    : 'SELECT * FROM workout_logs ORDER BY date DESC, id DESC'
  const rows = from && to ? db.prepare(sql).all(from, to) : db.prepare(sql).all()
  return (rows as unknown as WorkoutLog[]).map(asLog)
}

export function getLog(db: DatabaseSync, id: number): WorkoutLog | null {
  const row = db.prepare('SELECT * FROM workout_logs WHERE id = ?').get(id)
  return row ? asLog(row) : null
}

export function createLog(db: DatabaseSync, input: WorkoutLogInput): WorkoutLog {
  assertDateStr(input.date, '训练日期')
  const planId = input.planId ?? null
  if (planId !== null && !getPlan(db, planId)) throw new Error(`workout_plan ${planId} not found`)

  const info = db.prepare('INSERT INTO workout_logs (plan_id, date, content) VALUES (?, ?, ?)')
    .run(planId, input.date, workoutContentToJson(input.content ?? []))
  return getLog(db, Number(info.lastInsertRowid))!
}

export function updateLog(db: DatabaseSync, id: number, patch: WorkoutLogPatch): WorkoutLog {
  const cur = getLog(db, id)
  if (!cur) throw new Error(`workout_log ${id} not found`)

  const planId = patch.planId !== undefined ? patch.planId : cur.plan_id
  if (planId !== null && !getPlan(db, planId)) throw new Error(`workout_plan ${planId} not found`)
  const content = patch.content !== undefined ? patch.content : cur.content

  db.prepare(`
    UPDATE workout_logs SET plan_id=?, content=?, updated_at=datetime('now','localtime') WHERE id=?
  `).run(planId, workoutContentToJson(content), id)
  return getLog(db, id)!
}

export function deleteLog(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM workout_logs WHERE id = ?').run(id)
}

// ---------- 身体数据 ----------

/** 按日期升序返回，便于直接喂曲线 */
export function listMetrics(db: DatabaseSync, from?: string, to?: string): BodyMetric[] {
  const sql = from && to
    ? 'SELECT * FROM body_metrics WHERE date >= ? AND date <= ? ORDER BY date ASC'
    : 'SELECT * FROM body_metrics ORDER BY date ASC'
  const rows = from && to ? db.prepare(sql).all(from, to) : db.prepare(sql).all()
  return (rows as unknown as BodyMetric[]).map(asMetric)
}

export function getMetric(db: DatabaseSync, id: number): BodyMetric | null {
  const row = db.prepare('SELECT * FROM body_metrics WHERE id = ?').get(id)
  return row ? asMetric(row) : null
}

/** 每天一条：同一天再次写入是覆盖（配合 date UNIQUE 用 upsert） */
export function upsertMetric(db: DatabaseSync, input: BodyMetricInput): BodyMetric {
  assertDateStr(input.date, '记录日期')
  assertWeight(input.weight)
  const bodyFat = input.bodyFat ?? null
  assertBodyFat(bodyFat)

  db.prepare(`
    INSERT INTO body_metrics (date, weight, body_fat) VALUES (?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      weight = excluded.weight,
      body_fat = excluded.body_fat,
      updated_at = datetime('now','localtime')
  `).run(input.date, input.weight, bodyFat)

  return db.prepare('SELECT * FROM body_metrics WHERE date = ?').get(input.date) as unknown as BodyMetric
}

export function deleteMetric(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM body_metrics WHERE id = ?').run(id)
}
