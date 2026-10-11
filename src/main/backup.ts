import fs from 'node:fs'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { openDb } from './db'

export const BACKUP_KEEP = 10
const PREFIX = 'app-'
const SUFFIX = '.db'

const pad = (n: number): string => String(n).padStart(2, '0')

export function backupFileName(d: Date): string {
  return `${PREFIX}${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${SUFFIX}`
}

export function listBackups(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((f) => f.startsWith(PREFIX) && f.endsWith(SUFFIX))
    .sort()
}

export function newestBackup(dir: string): string | null {
  const all = listBackups(dir)
  return all.length ? path.join(dir, all[all.length - 1]) : null
}

export function pruneBackups(dir: string, keep = BACKUP_KEEP): string[] {
  const all = listBackups(dir)
  const doomed = all.slice(0, Math.max(0, all.length - keep))
  for (const f of doomed) fs.rmSync(path.join(dir, f), { force: true })
  return doomed
}

// VACUUM INTO 要求目标不存在，且路径需以正斜杠写入 SQL 字面量
function vacuumInto(db: DatabaseSync, target: string): void {
  const literal = target.replace(/\\/g, '/').replace(/'/g, "''")
  db.exec(`VACUUM INTO '${literal}'`)
}

/** 用 VACUUM INTO 生成一致快照到指定文件（目标需不存在；供备份与导出复用） */
export function snapshotTo(db: DatabaseSync, target: string): void {
  vacuumInto(db, target)
}

/** 用 VACUUM INTO 生成一致快照（WAL 未 checkpoint 也能拿到完整数据） */
export function createBackup(db: DatabaseSync, dir: string, now: Date = new Date()): string {
  fs.mkdirSync(dir, { recursive: true })
  const target = path.join(dir, backupFileName(now))
  if (fs.existsSync(target)) fs.rmSync(target, { force: true })
  vacuumInto(db, target)
  pruneBackups(dir)
  return target
}

export function isHealthy(db: DatabaseSync): boolean {
  const row = db.prepare('PRAGMA quick_check').get() as { quick_check?: string } | undefined
  return row?.quick_check === 'ok'
}

export interface StartupResult {
  db: DatabaseSync
  notice: string | null
}

export function startupOpen(dbFile: string, backupDir: string): StartupResult {
  fs.mkdirSync(backupDir, { recursive: true })

  // 1) 库文件缺失：有备份就从最近一份恢复，否则当作全新安装
  if (!fs.existsSync(dbFile)) {
    const src = newestBackup(backupDir)
    if (!src) return { db: openDb(dbFile), notice: null }
    fs.copyFileSync(src, dbFile)
    const db = openDb(dbFile)
    createBackup(db, backupDir)
    return { db, notice: `未找到数据库文件，已从备份 ${path.basename(src)} 恢复` }
  }

  // 2) 打开并校验完整性
  let db: DatabaseSync | null = null
  try {
    db = openDb(dbFile)
    if (isHealthy(db)) {
      createBackup(db, backupDir)
      return { db, notice: null }
    }
  } catch {
    db = null
  }
  if (db) db.close()

  // 3) 损坏：坏文件改名隔离（连带清掉 -wal/-shm），再从最近备份恢复
  const src = newestBackup(backupDir)
  const quarantined = `${dbFile}.corrupt-${Date.now()}`
  fs.renameSync(dbFile, quarantined)
  fs.rmSync(`${dbFile}-wal`, { force: true })
  fs.rmSync(`${dbFile}-shm`, { force: true })

  if (!src) {
    return {
      db: openDb(dbFile),
      notice: `数据库损坏且没有可用备份，已新建空库；损坏文件保留为 ${path.basename(quarantined)}`
    }
  }
  fs.copyFileSync(src, dbFile)
  const restored = openDb(dbFile)
  createBackup(restored, backupDir)
  return {
    db: restored,
    notice: `数据库损坏，已从备份 ${path.basename(src)} 恢复；损坏文件保留为 ${path.basename(quarantined)}`
  }
}
