import { describe, it, expect } from 'vitest'
import { restartStrategy } from '../src/main/restart'

describe('restartStrategy', () => {
  it('打包版（isPackaged=true）用 relaunch 自动重启', () => {
    expect(restartStrategy(true)).toBe('relaunch')
  })

  it('开发模式（isPackaged=false）改为手动重启', () => {
    expect(restartStrategy(false)).toBe('manual')
  })
})
