import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  MIHOYO_GAMES,
  normalizeExe,
  parseAcf,
  pickGameExes,
  buildGameMap,
  matchRunningGames,
  sessionMinutes,
  stepSessions
} from '@shared/gameDetect'
import { openDb } from '../src/main/db'
import { startGameDetect } from '../src/main/gameDetect'
import { listPlays } from '../src/main/db/entertainment'
import { setSetting } from '../src/main/db/settings'

describe('normalizeExe', () => {
  it('去 .exe、转小写、去空白', () => {
    expect(normalizeExe('  EldenRing.EXE ')).toBe('eldenring')
    expect(normalizeExe('StarRail.exe')).toBe('starrail')
    expect(normalizeExe('yuanshen')).toBe('yuanshen')
  })
})

describe('parseAcf', () => {
  const sample = `"AppState"\n{\n\t"appid"\t\t"1245620"\n\t"name"\t\t"ELDEN RING"\n\t"installdir"\t\t"ELDEN RING"\n\t"StateFlags"\t\t"4"\n}`
  it('解析 name/installdir/appid', () => {
    expect(parseAcf(sample)).toEqual({ appid: '1245620', name: 'ELDEN RING', installdir: 'ELDEN RING' })
  })
  it('缺 name 或 installdir 返回 null', () => {
    expect(parseAcf('{"appid" "1"}')).toBeNull()
    expect(parseAcf('')).toBeNull()
  })
  it('appid 缺失时给空串，不判 null', () => {
    expect(parseAcf('"name" "X"\n"installdir" "X"')).toEqual({ appid: '', name: 'X', installdir: 'X' })
  })
})

describe('pickGameExes', () => {
  it('exe 名与 installdir 归一化后相等 → 强匹配', () => {
    expect(pickGameExes('ELDEN RING', ['eldenring.exe', 'crashpad_handler.exe'])).toEqual(['eldenring.exe'])
  })
  it('exe 名以 installdir 为前缀（子目录里的 Game.exe 场景）', () => {
    expect(pickGameExes('ELDEN RING', ['eldenringgame.exe', 'foo.exe'])).toContain('eldenringgame.exe')
  })
  it('无强匹配时排除噪声 exe', () => {
    const exes = ['uninstall.exe', 'vc_redist.x64.exe', 'dxsetup.exe', 'mygame.exe']
    expect(pickGameExes('SomeGame', exes)).toEqual(['mygame.exe'])
  })
  it('空列表返回空', () => {
    expect(pickGameExes('X', [])).toEqual([])
  })
})

describe('buildGameMap / matchRunningGames', () => {
  const map = buildGameMap([
    { game: '原神', exes: MIHOYO_GAMES['原神'] },
    { game: 'ELDEN RING', exes: ['eldenring.exe'] }
  ])
  it('构建 exe→游戏 映射', () => {
    expect(map.get('yuanshen')).toBe('原神')
    expect(map.get('genshinimpact')).toBe('原神')
    expect(map.get('eldenring')).toBe('ELDEN RING')
  })
  it('同名 exe 先到先得', () => {
    const m = buildGameMap([
      { game: 'A', exes: ['dup.exe'] },
      { game: 'B', exes: ['dup.exe'] }
    ])
    expect(m.get('dup')).toBe('A')
  })
  it('按进程名匹配正在玩的游戏，忽略无关进程', () => {
    const running = matchRunningGames(['eldenring.exe', 'chrome.exe', 'Steam.exe'], map)
    expect([...running]).toEqual(['ELDEN RING'])
  })
})

describe('sessionMinutes', () => {
  it('向下取整到分钟', () => {
    expect(sessionMinutes(0, 90_000)).toBe(1)
    expect(sessionMinutes(0, 119_999)).toBe(1)
  })
  it('<1 分钟返回 0', () => {
    expect(sessionMinutes(0, 59_999)).toBe(0)
  })
  it('夹到 1440 上限', () => {
    expect(sessionMinutes(0, 2 * 24 * 60 * 60 * 1000)).toBe(1440)
  })
})

describe('stepSessions', () => {
  it('新出现记 startedAt，不产生结账', () => {
    const started = new Map<string, number>()
    const ended = stepSessions(started, new Set(['原神']), 1000)
    expect(ended).toEqual([])
    expect(started.get('原神')).toBe(1000)
  })
  it('消失结账返回 minutes 并删除', () => {
    const started = new Map<string, number>([['原神', 0]])
    const ended = stepSessions(started, new Set(), 120_000)
    expect(ended).toEqual([{ game: '原神', minutes: 2 }])
    expect(started.has('原神')).toBe(false)
  })
  it('同时有结束与新开始', () => {
    const started = new Map<string, number>([['原神', 0]])
    const ended = stepSessions(started, new Set(['星穹铁道']), 60_000)
    expect(ended).toEqual([{ game: '原神', minutes: 1 }])
    expect(started.get('星穹铁道')).toBe(60_000)
  })
  it('仍在玩的游戏保留 startedAt', () => {
    const started = new Map<string, number>([['原神', 0]])
    const ended = stepSessions(started, new Set(['原神']), 60_000)
    expect(ended).toEqual([])
    expect(started.get('原神')).toBe(0)
  })
})

describe('startGameDetect 轮询器', () => {
  afterEach(() => { vi.useRealTimers() })

  it('游戏运行中不写库，退出后写一条', () => {
    vi.useFakeTimers()
    const db = openDb(':memory:')
    let processes = ['eldenring.exe']
    const io = {
      listProcessNames: () => processes,
      steamGames: () => [{ game: 'ELDEN RING', exes: ['eldenring.exe'] }]
    }
    const stop = startGameDetect(db, io, { intervalMs: 30_000, refreshMs: 60_000 })

    expect(listPlays(db)).toEqual([])
    vi.advanceTimersByTime(60_000)
    expect(listPlays(db)).toEqual([])

    processes = []
    vi.advanceTimersByTime(30_000)
    const plays = listPlays(db)
    expect(plays).toHaveLength(1)
    expect(plays[0].game).toBe('ELDEN RING')
    expect(plays[0].minutes).toBe(1)
    stop()
  })

  it('autoGameLog.enabled=false 时不记录', () => {
    vi.useFakeTimers()
    const db = openDb(':memory:')
    setSetting(db, 'autoGameLog.enabled', false)
    const io = {
      listProcessNames: () => ['eldenring.exe'],
      steamGames: () => [{ game: 'ELDEN RING', exes: ['eldenring.exe'] }]
    }
    const stop = startGameDetect(db, io, { intervalMs: 30_000 })
    vi.advanceTimersByTime(120_000)
    expect(listPlays(db)).toEqual([])
    stop()
  })
})
