import { create } from 'zustand'
import type { LearnItem, LearnItemInput, LearnItemPatch, LearnNote, LearnSession } from '@shared/types'
import { api } from '../lib/ipc'
import { addDays, todayStr } from '../lib/dates'
import { formatIpcError } from '../lib/errors'

interface LearnState {
  items: LearnItem[]
  notes: LearnNote[]
  /** 最近 400 天的学习记录，供统计与连续天数使用 */
  sessions: LearnSession[]
  selectedId: number | null
  loading: boolean
  error: string | null
  clearError: () => void
  load: () => Promise<boolean>
  select: (id: number | null) => void
  createItem: (input: LearnItemInput) => Promise<boolean>
  updateItem: (id: number, patch: LearnItemPatch) => Promise<boolean>
  removeItem: (id: number) => Promise<boolean>
  setProgress: (id: number, doneUnits: number) => Promise<boolean>
  createNote: (itemId: number, content: string) => Promise<boolean>
  updateNote: (id: number, content: string) => Promise<boolean>
  removeNote: (id: number) => Promise<boolean>
  createSession: (itemId: number, date: string, minutes: number) => Promise<boolean>
  removeSession: (id: number) => Promise<boolean>
}

export const useLearnStore = create<LearnState>((set, get) => {
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

  const fetchItems = async (): Promise<void> => set({ items: await api.learn.listItems() })

  const fetchSessions = async (): Promise<void> => {
    const from = addDays(todayStr(), -400)
    set({ sessions: await api.learn.listSessions(from, todayStr()) })
  }

  const fetchNotes = async (itemId: number | null): Promise<void> => {
    set({ notes: itemId === null ? [] : await api.learn.listNotes(itemId) })
  }

  return {
    items: [],
    notes: [],
    sessions: [],
    selectedId: null,
    loading: false,
    error: null,
    clearError: () => set({ error: null }),

    load: () => run(async () => {
      set({ loading: true })
      await Promise.all([fetchItems(), fetchSessions()])
      const { selectedId, items } = get()
      // 选中的项已被删除时自动退回未选中
      const stillExists = selectedId !== null && items.some((i) => i.id === selectedId)
      if (!stillExists) set({ selectedId: null })
      await fetchNotes(stillExists ? selectedId : null)
    }),

    select: (id) => {
      set({ selectedId: id })
      void run(() => fetchNotes(id))
    },

    createItem: (input) => run(async () => { await api.learn.createItem(input); await fetchItems() }),

    updateItem: (id, patch) => run(async () => { await api.learn.updateItem(id, patch); await fetchItems() }),

    removeItem: (id) => run(async () => {
      await api.learn.removeItem(id)
      if (get().selectedId === id) set({ selectedId: null, notes: [] })
      await fetchItems()
    }),

    setProgress: (id, doneUnits) => run(async () => {
      await api.learn.setProgress(id, doneUnits)
      await fetchItems()
    }),

    createNote: (itemId, content) => run(async () => {
      await api.learn.createNote(itemId, content)
      await fetchNotes(itemId)
    }),

    updateNote: (id, content) => run(async () => {
      await api.learn.updateNote(id, content)
      await fetchNotes(get().selectedId)
    }),

    removeNote: (id) => run(async () => {
      await api.learn.removeNote(id)
      await fetchNotes(get().selectedId)
    }),

    createSession: (itemId, date, minutes) => run(async () => {
      await api.learn.createSession(itemId, date, minutes)
      await fetchSessions()
    }),

    removeSession: (id) => run(async () => {
      await api.learn.removeSession(id)
      await fetchSessions()
    })
  }
})
