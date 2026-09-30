import { create } from 'zustand'
import type { Settings, SettingsKey } from '@shared/settings'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { api } from '../lib/ipc'
import { formatIpcError } from '../lib/errors'

interface SettingsState {
  settings: Settings
  loaded: boolean
  error: string | null
  load: () => Promise<boolean>
  set: <K extends SettingsKey>(key: K, value: Settings[K]) => Promise<boolean>
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  error: null,

  load: async () => {
    try {
      const settings = await api.settings.getAll()
      set({ settings, loaded: true, error: null })
      return true
    } catch (e) {
      set({ error: formatIpcError(e) })
      return false
    }
  },

  set: async (key, value) => {
    try {
      const settings = await api.settings.set(key, value)
      set({ settings, error: null })
      return true
    } catch (e) {
      set({ error: formatIpcError(e) })
      return false
    }
  }
}))
