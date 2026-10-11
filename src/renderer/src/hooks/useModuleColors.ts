import { useSettingsStore } from '../stores/settingsStore'
import { LIGHT_MODULE_COLORS, MODULE_COLORS, STANDALONE_DARK, STANDALONE_LIGHT } from '@shared/moduleColors'

/**
 * 返回当前主题（深/浅）下的模块色 + 独立灰。
 * 用于把模块色作为「文字/状态色」的地方：浅色模式下自动切到更深的变体，保证可读性。
 */
export function useModuleColors(): {
  schedule: string
  learning: string
  dev: string
  inspiration: string
  fitness: string
  diet: string
  gray: string
} {
  const mode = useSettingsStore((s) => s.settings['theme.mode'])
  const light = mode === 'light'
  return {
    schedule: light ? LIGHT_MODULE_COLORS.schedule : MODULE_COLORS.schedule,
    learning: light ? LIGHT_MODULE_COLORS.learning : MODULE_COLORS.learning,
    dev: light ? LIGHT_MODULE_COLORS.dev : MODULE_COLORS.dev,
    inspiration: light ? LIGHT_MODULE_COLORS.inspiration : MODULE_COLORS.inspiration,
    fitness: light ? LIGHT_MODULE_COLORS.fitness : MODULE_COLORS.fitness,
    diet: light ? LIGHT_MODULE_COLORS.diet : MODULE_COLORS.diet,
    gray: light ? STANDALONE_LIGHT : STANDALONE_DARK
  }
}
