import { create } from 'zustand'
import type {
  BoardInput, BoardPatch, CaptureInput, Inspiration, InspirationBoard, InspirationPatch
} from '@shared/types'
import type { InspirationFilter } from '@shared/inspirationFilter'
import { api, type BoardStat } from '../lib/ipc'
import { LatestGuard } from '../lib/latest'
import { formatIpcError } from '../lib/errors'

export type InspView = 'flow' | 'boards'

interface InspState {
  view: InspView
  items: Inspiration[]
  boards: InspirationBoard[]
  boardStats: Map<number, BoardStat>
  tags: string[]
  filter: InspirationFilter
  /** 非空表示正在看某个画板的瀑布流 */
  selectedBoardId: number | null
  loading: boolean
  error: string | null

  clearError: () => void
  setView: (view: InspView) => void
  setFilter: (filter: InspirationFilter) => Promise<boolean>
  openBoard: (id: number | null) => Promise<boolean>
  load: () => Promise<boolean>

  capture: (input: CaptureInput) => Promise<boolean>
  update: (id: number, patch: InspirationPatch) => Promise<boolean>
  remove: (id: number) => Promise<boolean>
  toggleStar: (id: number, starred: boolean) => Promise<boolean>

  createBoard: (input: BoardInput) => Promise<boolean>
  updateBoard: (id: number, patch: BoardPatch) => Promise<boolean>
  removeBoard: (id: number) => Promise<boolean>
}

export const useInspStore = create<InspState>((set, get) => {
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
  const itemsGuard = new LatestGuard()
  const boardsGuard = new LatestGuard()
  const tagsGuard = new LatestGuard()

  const fetchItems = async (): Promise<void> => {
    const isLatest = itemsGuard.begin()
    const items = await api.insp.list(get().filter)
    if (isLatest()) set({ items })
  }

  const fetchBoards = async (): Promise<void> => {
    const isLatest = boardsGuard.begin()
    const [boards, statsPairs] = await Promise.all([api.insp.listBoards(), api.insp.boardStats()])
    if (isLatest()) set({ boards, boardStats: new Map(statsPairs) })
  }

  const fetchTags = async (): Promise<void> => {
    const isLatest = tagsGuard.begin()
    const tags = await api.insp.listTags()
    if (isLatest()) set({ tags })
  }

  /** 任何写操作后统一刷新：列表 + 画板统计 + 标签 */
  const refreshAll = async (): Promise<void> => {
    await Promise.all([fetchItems(), fetchBoards(), fetchTags()])
  }

  return {
    view: 'flow',
    items: [],
    boards: [],
    boardStats: new Map(),
    tags: [],
    filter: {},
    selectedBoardId: null,
    loading: false,
    error: null,

    clearError: () => set({ error: null }),
    setView: (view) => set({ view }),

    setFilter: (filter) => run(async () => {
      set({ filter })
      await fetchItems()
    }),

    openBoard: (id) => run(async () => {
      const boardId = id === null ? 'all' : id
      set({ selectedBoardId: id, filter: { ...get().filter, boardId } })
      await fetchItems()
    }),

    load: () => run(async () => {
      set({ loading: true })
      await refreshAll()
    }),

    capture: (input) => run(async () => {
      await api.insp.capture(input)
      await refreshAll()
    }),

    update: (id, patch) => run(async () => {
      await api.insp.update(id, patch)
      await refreshAll()
    }),

    remove: (id) => run(async () => {
      await api.insp.remove(id)
      await refreshAll()
    }),

    toggleStar: (id, starred) => run(async () => {
      await api.insp.setStarred(id, starred)
      await refreshAll()
    }),

    createBoard: (input) => run(async () => {
      await api.insp.createBoard(input)
      await refreshAll()
    }),

    updateBoard: (id, patch) => run(async () => {
      await api.insp.updateBoard(id, patch)
      await refreshAll()
    }),

    removeBoard: (id) => run(async () => {
      await api.insp.removeBoard(id)
      // 画板没了，退回全部视图
      if (get().selectedBoardId === id) set({ selectedBoardId: null, filter: { ...get().filter, boardId: 'all' } })
      await refreshAll()
    })
  }
})
