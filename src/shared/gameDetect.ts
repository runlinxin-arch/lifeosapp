// 游戏自动检测（A-minus）纯函数：可单测的解析 / 挑选 / 匹配 / 状态机，不含任何 IO。

/** 米哈游硬编码：显示名 → 进程名列表（小写、去 .exe） */
export const MIHOYO_GAMES: Record<string, string[]> = {
  原神: ['yuanshen', 'genshinimpact'],
  崩坏星穹铁道: ['starrail'],
  绝区零: ['zenlesszonezero'],
  崩坏3: ['bh3']
}

/** 归一化进程名：去首尾空白、转小写、去 .exe 后缀 */
export function normalizeExe(name: string): string {
  return name.trim().toLowerCase().replace(/\.exe$/, '')
}

/** 解析 appmanifest_*.acf 文本 → { appid, name, installdir }；缺 name/installdir 返回 null */
export function parseAcf(text: string): { appid: string; name: string; installdir: string } | null {
  const pick = (key: string): string | null => {
    const m = text.match(new RegExp('"' + key + '"\\s+"([^"]*)"'))
    return m ? m[1] : null
  }
  const name = pick('name')
  const installdir = pick('installdir')
  if (!name || !installdir) return null
  return { appid: pick('appid') ?? '', name, installdir }
}

/** 安装/卸载/工具类 exe 的噪声特征，避免误判为"主程序在跑" */
const NOISE_EXE = /(unins|uninstall|crash|report|setup|install|redist|vc_?redist|dxsetup|dotnet|directx|launcher|updater|notifier|helper|cleanup|benchmark|config|crashpad|cef|sentry)/i

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * 从游戏目录里收集到的 exe 文件名中挑出最可能是"主程序"的：
 * - 强匹配：exe 名（去扩展名）与 installdir 归一化后相等或互为前缀；
 * - 弱匹配：排除噪声 exe，取前 3 个。
 */
export function pickGameExes(installdir: string, exeBasenames: string[]): string[] {
  const dirKey = norm(installdir)
  const keys = exeBasenames.map((e) => ({ raw: e, key: norm(e.replace(/\.exe$/i, '')) }))

  const strong = keys
    .filter((k) => k.key && (k.key === dirKey || k.key.startsWith(dirKey) || (dirKey.length > 0 && dirKey.startsWith(k.key))))
    .map((k) => k.raw)
  if (strong.length) return strong.slice(0, 3)

  return exeBasenames.filter((e) => !NOISE_EXE.test(e)).slice(0, 3)
}

export interface GameEntry {
  game: string
  exes: string[]
}

/** 由「游戏 → 进程名列表」条目构建 exe名 → 游戏名 映射；同名 exe 先到先得 */
export function buildGameMap(entries: GameEntry[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const e of entries) {
    for (const raw of e.exes) {
      const key = normalizeExe(raw)
      if (key && !m.has(key)) m.set(key, e.game)
    }
  }
  return m
}

/** 运行中的进程名 → 正在玩的游戏名集合 */
export function matchRunningGames(processNames: string[], gameMap: Map<string, string>): Set<string> {
  const out = new Set<string>()
  for (const raw of processNames) {
    const game = gameMap.get(normalizeExe(raw))
    if (game) out.add(game)
  }
  return out
}

/** 会话时长：毫秒 → 分钟（向下取整，夹到 0–1440；<1 分钟返回 0 由调用方丢弃） */
export function sessionMinutes(startedAt: number, endedAt: number): number {
  const minutes = Math.floor((endedAt - startedAt) / 60000)
  return Math.min(1440, Math.max(0, minutes))
}

/**
 * 会话状态机一步：
 * - 仍在玩的游戏保留 startedAt；
 * - 消失的游戏结账，返回要落库的 {game, minutes}；
 * - 新出现的游戏记 startedAt = now。
 */
export function stepSessions(
  startedAt: Map<string, number>,
  running: Set<string>,
  now: number
): { game: string; minutes: number }[] {
  const ended: { game: string; minutes: number }[] = []
  for (const game of [...startedAt.keys()]) {
    if (!running.has(game)) {
      ended.push({ game, minutes: sessionMinutes(startedAt.get(game)!, now) })
      startedAt.delete(game)
    }
  }
  for (const game of running) {
    if (!startedAt.has(game)) startedAt.set(game, now)
  }
  return ended
}
