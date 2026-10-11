import { execSync } from 'node:child_process'
import fs from 'node:fs'
import type { Dirent } from 'node:fs'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import {
  buildGameMap, matchRunningGames, MIHOYO_GAMES, parseAcf, pickGameExes, stepSessions,
  type GameEntry
} from '@shared/gameDetect'
import { createPlay } from './db/entertainment'
import { getAllSettings } from './db/settings'
import { todayStr } from '@shared/dates'

/** 轮询间隔（毫秒） */
export const GAME_DETECT_INTERVAL_MS = 30_000
/** Steam 游戏映射刷新间隔（毫秒） */
const MAP_REFRESH_MS = 10 * 60_000

export interface GameDetectIO {
  /** 运行中的进程名列表（原始，含 .exe） */
  listProcessNames(): string[]
  /** Steam 已装游戏：显示名 → 候选 exe 文件名 */
  steamGames(): GameEntry[]
}

function readSteamPath(): string | null {
  try {
    const out = execSync('reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath', {
      encoding: 'utf8', windowsHide: true
    })
    const m = out.match(/REG_SZ\s+(.+)/)
    const p = m ? m[1].trim() : ''
    return p || null
  } catch {
    return null
  }
}

function listProcessNames(): string[] {
  try {
    const out = execSync('tasklist /FO CSV /NH', { encoding: 'utf8', windowsHide: true })
    return out
      .split(/\r?\n/)
      .map((line) => line.match(/"([^"]+)"/)?.[1] ?? '')
      .filter((s) => s.length > 0)
  } catch {
    return []
  }
}

/** 递归收集目录里的 exe 文件名（最多两层、最多 30 个，避免扫到工具类/子目录爆炸） */
function collectExes(dir: string, depth: number, out: string[]): void {
  if (depth < 0 || out.length >= 30) return
  let entries: Dirent[] = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    if (e.isFile() && e.name.toLowerCase().endsWith('.exe')) out.push(e.name)
    else if (e.isDirectory() && depth > 0) collectExes(path.join(dir, e.name), depth - 1, out)
  }
}

function listSteamGames(steamPath: string): GameEntry[] {
  const apps = path.join(steamPath, 'steamapps')
  const common = path.join(apps, 'common')
  const out: GameEntry[] = []
  let manifests: string[] = []
  try {
    manifests = fs.readdirSync(apps).filter((f) => f.startsWith('appmanifest_') && f.endsWith('.acf'))
  } catch {
    return out
  }
  for (const mf of manifests) {
    let parsed: { appid: string; name: string; installdir: string } | null = null
    try { parsed = parseAcf(fs.readFileSync(path.join(apps, mf), 'utf8')) } catch { parsed = null }
    if (!parsed) continue
    const exes: string[] = []
    collectExes(path.join(common, parsed.installdir), 1, exes)
    const picked = pickGameExes(parsed.installdir, exes)
    if (picked.length) out.push({ game: parsed.name, exes: picked })
  }
  return out
}

function defaultIo(): GameDetectIO {
  return {
    listProcessNames,
    steamGames: () => {
      const p = readSteamPath()
      return p ? listSteamGames(p) : []
    }
  }
}

/**
 * 启动游戏自动检测轮询器（A-minus）。返回停止函数，app 退出时调用。
 * 仅在设置 `autoGameLog.enabled` 为 true 时工作；关闭时丢弃进行中的会话。
 */
export function startGameDetect(
  db: DatabaseSync,
  io: GameDetectIO = defaultIo(),
  opts: { intervalMs?: number; refreshMs?: number } = {}
): () => void {
  const intervalMs = opts.intervalMs ?? GAME_DETECT_INTERVAL_MS
  const refreshMs = opts.refreshMs ?? MAP_REFRESH_MS

  const startedAt = new Map<string, number>()
  let gameMap = new Map<string, string>()
  let lastRefresh = 0

  const rebuildMap = (): void => {
    const entries: GameEntry[] = Object.entries(MIHOYO_GAMES).map(([game, exes]) => ({ game, exes }))
    entries.push(...io.steamGames())
    gameMap = buildGameMap(entries)
    lastRefresh = Date.now()
  }

  const tick = (): void => {
    const settings = getAllSettings(db)
    if (!settings['autoGameLog.enabled']) {
      // 关闭自动记录时丢弃进行中的会话，避免重开后把「退出前早就结束」算成超长时长
      startedAt.clear()
      return
    }
    if (Date.now() - lastRefresh >= refreshMs) rebuildMap()

    const running = matchRunningGames(io.listProcessNames(), gameMap)
    const ended = stepSessions(startedAt, running, Date.now())
    for (const e of ended) {
      if (e.minutes >= 1) {
        try {
          createPlay(db, { game: e.game, date: todayStr(), minutes: e.minutes })
        } catch {
          // 单条写库失败（如校验/磁盘）忽略，不打断轮询
        }
      }
    }
  }

  rebuildMap()
  tick()
  const timer = setInterval(tick, intervalMs)
  return () => clearInterval(timer)
}
