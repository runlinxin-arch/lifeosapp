import { create } from 'zustand'
import type { Task, Priority } from '@shared/types'
import { api } from '../lib/ipc'
import { todayStr } from '../lib/dates'

interface TasksState {
  tasks: Task[]
  load: (date: string) => Promise<void>
  add: (title: string, priority: Priority) => Promise<void>
  toggle: (id: number) => Promise<void>
  remove: (id: number) => Promise<void>
}

export const useTasksStore = create<TasksState>((set, get) => ({
  tasks: [],
  load: async (date) => {
    const tasks = await api.tasks.list(date)
    set({ tasks })
  },
  add: async (title, priority) => {
    await api.tasks.create({ title, priority, date: todayStr() })
    await get().load(todayStr())
  },
  toggle: async (id) => {
    const t = get().tasks.find((x) => x.id === id)
    if (!t) return
    await api.tasks.update(id, { done: !t.done })
    await get().load(todayStr())
  },
  remove: async (id) => {
    await api.tasks.remove(id)
    await get().load(todayStr())
  }
}))
