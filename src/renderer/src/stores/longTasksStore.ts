import { create } from 'zustand'
import type { LongTask } from '@shared/types'
import { api } from '../lib/ipc'
import { todayStr } from '../lib/dates'
import { computeTimelineRange } from '../lib/clock'
import { formatIpcError } from '../lib/errors'

export const RANGE_DAYS = 30
export const PAST_DAYS = 3

interface LongTasksState {
  tasks: LongTask[]
  range: { from: string; to: string }
  error: string | null
  clearError: () => void
  reload: () => Promise<boolean>
  /** 返回是否成功，失败时由 error 承载原因（调用方可据此保留表单） */
  create: (title: string, startDate: string, endDate: string) => Promise<boolean>
  remove: (id: number) => Promise<boolean>
}

export const useLongTasksStore = create<LongTasksState>((set) => {
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

  // 每次都按"当前这一天"重算区间：应用跨零点长挂后范围随之滚动
  const fetchRange = async (): Promise<void> => {
    const range = computeTimelineRange(todayStr(), RANGE_DAYS, PAST_DAYS)
    const tasks = await api.longTasks.listRange(range.from, range.to)
    set({ range, tasks })
  }

  return {
    tasks: [],
    range: computeTimelineRange(todayStr(), RANGE_DAYS, PAST_DAYS),
    error: null,
    clearError: () => set({ error: null }),
    reload: () => run(fetchRange),
    create: (title, startDate, endDate) =>
      run(async () => {
        await api.longTasks.create({ title, startDate, endDate })
        await fetchRange()
      }),
    remove: (id) =>
      run(async () => {
        await api.longTasks.remove(id)
        await fetchRange()
      })
  }
})
