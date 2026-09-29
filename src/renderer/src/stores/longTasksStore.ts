import { create } from 'zustand'
import type { LongTask } from '@shared/types'
import { api } from '../lib/ipc'
import { todayStr, addDays } from '../lib/dates'

export const RANGE_DAYS = 30
const PAST_DAYS = 3

interface LongTasksState {
  tasks: LongTask[]
  range: { from: string; to: string }
  reload: () => Promise<void>
  create: (title: string, startDate: string, endDate: string) => Promise<void>
  remove: (id: number) => Promise<void>
}

export const useLongTasksStore = create<LongTasksState>((set, get) => ({
  tasks: [],
  range: { from: addDays(todayStr(), -PAST_DAYS), to: addDays(todayStr(), RANGE_DAYS) },
  reload: async () => {
    const { from, to } = get().range
    const tasks = await api.longTasks.listRange(from, to)
    set({ tasks })
  },
  create: async (title, startDate, endDate) => {
    await api.longTasks.create({ title, startDate, endDate })
    await get().reload()
  },
  remove: async (id) => {
    await api.longTasks.remove(id)
    await get().reload()
  }
}))
