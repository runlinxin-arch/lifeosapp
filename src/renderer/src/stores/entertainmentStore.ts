import { create } from 'zustand'
import type { Media, MediaInput, MediaPatch, Play, PlayInput } from '@shared/types'
import { api } from '../lib/ipc'
import { LatestGuard } from '../lib/latest'
import { formatIpcError } from '../lib/errors'

/** 页签：游玩记录 / 影视 / 书籍（影视与书籍分开；愿望单已按用户要求移除） */
export type EntTab = 'plays' | 'screen' | 'book'

interface EntState {
  plays: Play[]
  media: Media[]
  tab: EntTab
  loading: boolean
  error: string | null

  setTab: (tab: EntTab) => void
  clearError: () => void
  load: () => Promise<boolean>

  addPlay: (input: PlayInput) => Promise<boolean>
  removePlay: (id: number) => Promise<boolean>

  addMedia: (input: MediaInput) => Promise<boolean>
  updateMedia: (id: number, patch: MediaPatch) => Promise<boolean>
  removeMedia: (id: number) => Promise<boolean>
}

export const useEntertainmentStore = create<EntState>((set) => {
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
  const playsGuard = new LatestGuard()
  const mediaGuard = new LatestGuard()

  const fetchPlays = async (): Promise<void> => {
    const isLatest = playsGuard.begin()
    const plays = await api.ent.listPlays()
    if (isLatest()) set({ plays })
  }

  const fetchMedia = async (): Promise<void> => {
    const isLatest = mediaGuard.begin()
    const media = await api.ent.listMedia()
    if (isLatest()) set({ media })
  }

  return {
    plays: [],
    media: [],
    tab: 'plays',
    loading: false,
    error: null,

    setTab: (tab) => set({ tab }),
    clearError: () => set({ error: null }),

    load: () => run(async () => {
      set({ loading: true })
      // 游玩记录跨全部历史聚合，因此不按日期区间裁剪
      await Promise.all([fetchPlays(), fetchMedia()])
    }),

    addPlay: (input) => run(async () => { await api.ent.createPlay(input); await fetchPlays() }),
    removePlay: (id) => run(async () => { await api.ent.removePlay(id); await fetchPlays() }),

    addMedia: (input) => run(async () => { await api.ent.createMedia(input); await fetchMedia() }),
    updateMedia: (id, patch) => run(async () => { await api.ent.updateMedia(id, patch); await fetchMedia() }),
    removeMedia: (id) => run(async () => { await api.ent.removeMedia(id); await fetchMedia() })
  }
})
