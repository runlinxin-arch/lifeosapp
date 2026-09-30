import { create } from 'zustand'
import type { LongTask, LongTaskPatch } from '@shared/types'
import { api } from '../lib/ipc'
import { todayStr } from '../lib/dates'
import { computeTimelineRange } from '../lib/clock'
import { formatIpcError } from '../lib/errors'
import { useSettingsStore } from './settingsStore'

/** 时间轴向前多显示几天，便于看到已经开始的任务 */
export const PAST_DAYS = 3

interface LongTasksState {
  tasks: LongTask[]
  range: { from: string; to: string }
  error: string | null
  clearError: () => void
  reload: () => Promise<boolean>
  /** 返回是否成功，失败时由 error 承载原因（调用方可据此保留表单） */
  create: (title: string, startDate: string, endDate: string) => Promise<boolean>
  setDone: (id: number, done: boolean) => Promise<boolean>
  update: (id: number, patch: LongTaskPatch) => Promise<boolean>
  remove: (id: number) => Promise<boolean>
}

/** 显示范围来自设置（7 / 30 / 90 天），并且每次都按"当前这一天"重算 */
function currentRange(): { from: string; to: string } {
  const days = useSettingsStore.getState().settings['timeline.rangeDays']
  return computeTimelineRange(todayStr(), days, PAST_DAYS)
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

  const fetchRange = async (): Promise<void> => {
    const range = currentRange()
    const tasks = await api.longTasks.listRange(range.from, range.to)
    set({ range, tasks })
  }

  return {
    tasks: [],
    range: currentRange(),
    error: null,
    clearError: () => set({ error: null }),

    reload: () => run(fetchRange),

    create: (title, startDate, endDate) =>
      run(async () => {
        await api.longTasks.create({ title, startDate, endDate })
        await fetchRange()
      }),

    setDone: (id, done) =>
      run(async () => {
        await api.longTasks.setDone(id, done)
        await fetchRange()
      }),

    update: (id, patch) =>
      run(async () => {
        await api.longTasks.update(id, patch)
        await fetchRange()
      }),

    remove: (id) =>
      run(async () => {
        await api.longTasks.remove(id)
        await fetchRange()
      })
  }
})
