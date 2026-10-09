import { create } from 'zustand'
import { elapsedToMinutes } from '@shared/duration'
import { formatLocal } from '../lib/dates'
import { useDevStore } from './devStore'

export interface RunningTimer {
  taskId: number
  taskTitle: string
  /** 开始时刻（毫秒时间戳） */
  startedAt: number
}

interface DevTimerState {
  running: RunningTimer | null
  start: (taskId: number, taskTitle: string) => void
  cancel: () => void
  /**
   * 停止并落库。
   * 只在**成功写入**后才清空 running —— 失败时计时继续保留，
   * 用户不会因为一次写库失败而丢失已投入的时间。
   */
  stop: () => Promise<boolean>
}

export const useDevTimerStore = create<DevTimerState>((set, get) => ({
  running: null,

  start: (taskId, taskTitle) => set({ running: { taskId, taskTitle, startedAt: Date.now() } }),

  cancel: () => set({ running: null }),

  stop: async () => {
    const r = get().running
    if (!r) return false
    const endedMs = Date.now()
    const minutes = elapsedToMinutes(Math.floor((endedMs - r.startedAt) / 1000))
    // 复用 devStore 的写入与刷新逻辑（会一并刷新会话列表与项目统计）
    const ok = await useDevStore
      .getState()
      .createSession(r.taskId, formatLocal(new Date(r.startedAt)), formatLocal(new Date(endedMs)), minutes)
    if (ok) set({ running: null })
    return ok
  }
}))
