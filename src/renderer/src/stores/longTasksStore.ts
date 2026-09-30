import { create } from 'zustand'
import type { LongTask } from '@shared/types'
import { api } from '../lib/ipc'
import { todayStr, addDays } from '../lib/dates'
import { formatIpcError } from '../lib/errors'

export const RANGE_DAYS = 30
const PAST_DAYS = 3

interface LongTasksState {
  tasks: LongTask[]
  range: { from: string; to: string }
  error: string | null
  clearError: () => void
  reload: () => Promise<void>
  /** 返回是否成功，失败时由 error 承载原因（调用方可据此保留表单） */
  create: (title: string, startDate: string, endDate: string) => Promise<boolean>
  remove: (id: number) => Promise<boolean>
}

export const useLongTasksStore = create<LongTasksState>((set, get) => {
  const run = async (action: () => Promise<void>): Promise<boolean> => {
    try {
      await action()
      set({ error: null })
      return true
    } catch (e) {
      set({ error: formatIpcError(e) })
      return false
    }
  }

  return {
    tasks: [],
    range: { from: addDays(todayStr(), -PAST_DAYS), to: addDays(todayStr(), RANGE_DAYS) },
    error: null,
    clearError: () => set({ error: null }),

    reload: async () => {
      await run(async () => {
        const { from, to } = get().range
        set({ tasks: await api.longTasks.listRange(from, to) })
      })
    },

    create: (title, startDate, endDate) =>
      run(async () => {
        await api.longTasks.create({ title, startDate, endDate })
        const { from, to } = get().range
        set({ tasks: await api.longTasks.listRange(from, to) })
      }),

    remove: (id) =>
      run(async () => {
        await api.longTasks.remove(id)
        const { from, to } = get().range
        set({ tasks: await api.longTasks.listRange(from, to) })
      })
  }
})
