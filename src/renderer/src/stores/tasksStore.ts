import { create } from 'zustand'
import type { Task, Priority } from '@shared/types'
import { api, type ConvertTaskInput } from '../lib/ipc'
import { todayStr } from '../lib/dates'
import { formatIpcError } from '../lib/errors'

interface TasksState {
  tasks: Task[]
  error: string | null
  clearError: () => void
  load: (date: string) => Promise<void>
  /** 返回是否成功，失败时由 error 承载原因（调用方可据此保留输入） */
  add: (title: string, priority: Priority) => Promise<boolean>
  toggle: (id: number) => Promise<boolean>
  remove: (id: number) => Promise<boolean>
  /** 待办转日程：成功后本行消失，由日程汇入形态重新出现 */
  convert: (id: number, input: ConvertTaskInput) => Promise<boolean>
}

export const useTasksStore = create<TasksState>((set, get) => {
  // 统一包裹 IPC 调用：失败不再变成静默的 unhandled rejection
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
    error: null,
    clearError: () => set({ error: null }),

    load: async (date) => {
      await run(async () => { set({ tasks: await api.tasks.list(date) }) })
    },

    add: (title, priority) =>
      run(async () => {
        await api.tasks.create({ title, priority, date: todayStr() })
        set({ tasks: await api.tasks.list(todayStr()) })
      }),

    toggle: (id) =>
      run(async () => {
        const t = get().tasks.find((x) => x.id === id)
        if (!t) return
        await api.tasks.update(id, { done: !t.done })
        set({ tasks: await api.tasks.list(todayStr()) })
      }),

    remove: (id) =>
      run(async () => {
        await api.tasks.remove(id)
        set({ tasks: await api.tasks.list(todayStr()) })
      }),

    convert: (id, input) =>
      run(async () => {
        await api.interop.convertTask(id, input)
        await api.interop.syncDates([input.startAt.slice(0, 10)])
        set({ tasks: await api.tasks.list(todayStr()) })
      })
  }
})
