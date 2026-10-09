import { create } from 'zustand'
import type {
  BodyMetric, BodyMetricInput, WorkoutLog, WorkoutLogInput, WorkoutLogPatch,
  WorkoutPlan, WorkoutPlanInput, WorkoutPlanPatch
} from '@shared/types'
import { api } from '../lib/ipc'
import { LatestGuard } from '../lib/latest'
import { addDays, todayStr } from '../lib/dates'
import { formatIpcError } from '../lib/errors'

interface FitnessState {
  plans: WorkoutPlan[]
  /** 最近 400 天的打卡记录 */
  logs: WorkoutLog[]
  /** 最近 400 天的身体数据（按日期升序） */
  metrics: BodyMetric[]
  selectedPlanId: number | null
  loading: boolean
  error: string | null

  clearError: () => void
  load: () => Promise<boolean>
  selectPlan: (id: number | null) => void

  createPlan: (input: WorkoutPlanInput) => Promise<boolean>
  updatePlan: (id: number, patch: WorkoutPlanPatch) => Promise<boolean>
  removePlan: (id: number) => Promise<boolean>

  saveLog: (input: WorkoutLogInput) => Promise<boolean>
  updateLog: (id: number, patch: WorkoutLogPatch) => Promise<boolean>
  removeLog: (id: number) => Promise<boolean>

  saveMetric: (input: BodyMetricInput) => Promise<boolean>
  removeMetric: (id: number) => Promise<boolean>
}

export const useFitnessStore = create<FitnessState>((set, get) => {
  const run = async (action: () => Promise<void>): Promise<boolean> => {
    try {
      await action()
      set({ error: null, loading: false })
      return true
    } catch (e) {
      set({ error: formatIpcError(e), loading: false })
      return false
    }
  }

  // 并发刷新时只认最新一次请求，避免慢响应把新数据覆盖回旧值
  const plansGuard = new LatestGuard()
  const logsGuard = new LatestGuard()
  const metricsGuard = new LatestGuard()

  const range = (): { from: string; to: string } => ({ from: addDays(todayStr(), -400), to: todayStr() })

  const fetchPlans = async (): Promise<void> => {
    const isLatest = plansGuard.begin()
    const plans = await api.fit.listPlans()
    if (isLatest()) set({ plans })
  }

  const fetchLogs = async (): Promise<void> => {
    const isLatest = logsGuard.begin()
    const { from, to } = range()
    const logs = await api.fit.listLogs(from, to)
    if (isLatest()) set({ logs })
  }

  const fetchMetrics = async (): Promise<void> => {
    const isLatest = metricsGuard.begin()
    const { from, to } = range()
    const metrics = await api.fit.listMetrics(from, to)
    if (isLatest()) set({ metrics })
  }

  const refreshAll = async (): Promise<void> => {
    await Promise.all([fetchPlans(), fetchLogs(), fetchMetrics()])
  }

  return {
    plans: [],
    logs: [],
    metrics: [],
    selectedPlanId: null,
    loading: false,
    error: null,

    clearError: () => set({ error: null }),
    selectPlan: (id) => set({ selectedPlanId: id }),

    load: () => run(async () => {
      set({ loading: true })
      await refreshAll()
      const { selectedPlanId, plans } = get()
      // 选中的计划被删掉时自动退回第一个
      const stillExists = selectedPlanId !== null && plans.some((p) => p.id === selectedPlanId)
      if (!stillExists) set({ selectedPlanId: plans[0]?.id ?? null })
    }),

    createPlan: (input) => run(async () => {
      const created = await api.fit.createPlan(input)
      await fetchPlans()
      set({ selectedPlanId: created.id })
    }),

    updatePlan: (id, patch) => run(async () => { await api.fit.updatePlan(id, patch); await fetchPlans() }),

    removePlan: (id) => run(async () => {
      await api.fit.removePlan(id)
      if (get().selectedPlanId === id) set({ selectedPlanId: null })
      await refreshAll()
    }),

    saveLog: (input) => run(async () => { await api.fit.createLog(input); await fetchLogs() }),
    updateLog: (id, patch) => run(async () => { await api.fit.updateLog(id, patch); await fetchLogs() }),
    removeLog: (id) => run(async () => { await api.fit.removeLog(id); await fetchLogs() }),

    saveMetric: (input) => run(async () => { await api.fit.upsertMetric(input); await fetchMetrics() }),
    removeMetric: (id) => run(async () => { await api.fit.removeMetric(id); await fetchMetrics() })
  }
})
