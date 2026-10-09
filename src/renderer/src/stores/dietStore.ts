import { create } from 'zustand'
import type { Meal, MealInput, MealPlan, MealPlanInput } from '@shared/types'
import { api } from '../lib/ipc'
import { LatestGuard } from '../lib/latest'
import { addDays, todayStr } from '../lib/dates'
import { formatIpcError } from '../lib/errors'

/** 拉取区间：往前 7 天看近况，往后 14 天为「提前编排」留足空间 */
const BACK_DAYS = 7
const FORWARD_DAYS = 14

interface DietState {
  meals: Meal[]
  plans: MealPlan[]
  /** 当前查看的日期（可切到未来日期做编排） */
  date: string
  /** 今天的日期（横条锚点 / 「回到今天」） */
  today: string
  loading: boolean
  error: string | null

  clearError: () => void
  setDate: (date: string) => void
  load: () => Promise<boolean>
  saveMeal: (input: MealInput) => Promise<boolean>
  removeMeal: (id: number) => Promise<boolean>
  savePlan: (input: MealPlanInput) => Promise<boolean>
  removePlan: (id: number) => Promise<boolean>
}

export const useDietStore = create<DietState>((set, get) => {
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
  const mealsGuard = new LatestGuard()
  const plansGuard = new LatestGuard()

  const range = (): { from: string; to: string } => {
    const base = get().today || todayStr()
    return { from: addDays(base, -BACK_DAYS), to: addDays(base, FORWARD_DAYS) }
  }

  const fetchMeals = async (): Promise<void> => {
    const isLatest = mealsGuard.begin()
    const { from, to } = range()
    const meals = await api.diet.listMeals(from, to)
    if (isLatest()) set({ meals })
  }

  const fetchPlans = async (): Promise<void> => {
    const isLatest = plansGuard.begin()
    const { from, to } = range()
    const plans = await api.diet.listPlans(from, to)
    if (isLatest()) set({ plans })
  }

  return {
    meals: [],
    plans: [],
    date: todayStr(),
    today: todayStr(),
    loading: false,
    error: null,

    clearError: () => set({ error: null }),
    setDate: (date) => set({ date }),

    load: () => run(async () => {
      set({ loading: true, today: todayStr() })
      await Promise.all([fetchMeals(), fetchPlans()])
    }),

    saveMeal: (input) => run(async () => { await api.diet.upsertMeal(input); await fetchMeals() }),
    removeMeal: (id) => run(async () => { await api.diet.removeMeal(id); await fetchMeals() }),

    savePlan: (input) => run(async () => { await api.diet.upsertMealPlan(input); await fetchPlans() }),
    removePlan: (id) => run(async () => { await api.diet.removePlan(id); await fetchPlans() })
  }
})
