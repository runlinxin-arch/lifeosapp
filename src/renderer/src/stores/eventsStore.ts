import { create } from 'zustand'
import type { Event, EventInput, EventPatch, Occurrence } from '@shared/types'
import { api } from '../lib/ipc'
import { addDays, datePart, todayStr } from '@shared/dates'
import { monthMatrix, weekStart } from '@shared/layout'
import { formatIpcError } from '../lib/errors'

export type ViewMode = 'week' | 'month'

interface EventsState {
  view: ViewMode
  anchor: string
  events: Event[]
  occurrences: Occurrence[]
  loading: boolean
  error: string | null
  clearError: () => void
  setView: (v: ViewMode) => void
  setAnchor: (d: string) => void
  reload: () => Promise<boolean>
  create: (input: EventInput) => Promise<boolean>
  update: (id: number, patch: EventPatch) => Promise<boolean>
  remove: (id: number) => Promise<boolean>
}

/** 当前视图需要加载的日期区间（周视图一整周，月视图覆盖 42 格） */
export function visibleRange(view: ViewMode, anchor: string): { from: string; to: string } {
  if (view === 'week') {
    const from = weekStart(anchor)
    return { from, to: addDays(from, 6) }
  }
  const grid = monthMatrix(anchor)
  return { from: grid[0], to: grid[grid.length - 1] }
}

export const useEventsStore = create<EventsState>((set, get) => {
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

  const fetchRange = async (): Promise<void> => {
    const { view, anchor } = get()
    const { from, to } = visibleRange(view, anchor)
    const [events, occurrences] = await Promise.all([
      api.events.listInRange(from, to),
      api.events.listOccurrences(from, to)
    ])
    set({ events, occurrences })
  }

  return {
    view: 'week',
    anchor: todayStr(),
    events: [],
    occurrences: [],
    loading: false,
    error: null,
    clearError: () => set({ error: null }),

    setView: (view) => { set({ view }); void get().reload() },
    setAnchor: (anchor) => { set({ anchor }); void get().reload() },

    reload: () => run(async () => {
      set({ loading: true })
      await fetchRange()
    }),

    create: (input) => run(async () => {
      const ev = await api.events.create(input)
      await api.interop.syncDates([datePart(ev.start_at)])
      await fetchRange()
    }),

    update: (id, patch) => run(async () => {
      const before = get().events.find((e) => e.id === id)
      const after = await api.events.update(id, patch)
      const dates = new Set<string>()
      if (before) dates.add(datePart(before.start_at))
      dates.add(datePart(after.start_at))
      await api.interop.syncDates([...dates])
      await fetchRange()
    }),

    remove: (id) => run(async () => {
      const before = get().events.find((e) => e.id === id)
      await api.events.remove(id)
      if (before) await api.interop.syncDates([datePart(before.start_at)])
      await fetchRange()
    })
  }
})
