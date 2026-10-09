import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { DATA_DIR_ENV, resolveDataDir } from '../src/main/paths'

describe('resolveDataDir', () => {
  const fallback = 'C:\\Users\\me\\AppData\\Roaming\\lifeos'

  it('未设置环境变量时回退到 userData', () => {
    expect(resolveDataDir({}, fallback)).toBe(fallback)
    expect(resolveDataDir({ OTHER: 'x' }, fallback)).toBe(fallback)
  })

  it('空串 / 纯空白视为未设置', () => {
    expect(resolveDataDir({ [DATA_DIR_ENV]: '' }, fallback)).toBe(fallback)
    expect(resolveDataDir({ [DATA_DIR_ENV]: '   ' }, fallback)).toBe(fallback)
  })

  it('设置后返回解析后的绝对路径，并去掉首尾空白', () => {
    const abs = path.join(process.cwd(), '.e2e-data')
    expect(resolveDataDir({ [DATA_DIR_ENV]: `  ${abs}  ` }, fallback)).toBe(path.resolve(abs))
  })

  it('相对路径按当前工作目录解析', () => {
    expect(resolveDataDir({ [DATA_DIR_ENV]: '.e2e-data' }, fallback)).toBe(path.resolve('.e2e-data'))
  })

  it('不修改传入的 env 对象', () => {
    const env: Record<string, string | undefined> = { [DATA_DIR_ENV]: ' .e2e-data ' }
    resolveDataDir(env, fallback)
    expect(env[DATA_DIR_ENV]).toBe(' .e2e-data ')
  })
})
