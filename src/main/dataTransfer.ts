import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as tar from 'tar'
import type { DatabaseSync } from 'node:sqlite'
import { createBackup, isHealthy, snapshotTo } from './backup'
import { openDb } from './db'

export const EXPORT_DB = 'app.db'
export const EXPORT_IMAGES = 'images'

const pad = (n: number): string => String(n).padStart(2, '0')

/** 默认导出文件名：LifeOS-backup-<时间戳>.tar.gz */
export function defaultExportFileName(now: Date = new Date()): string {
  const d = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const t = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `LifeOS-backup-${d}-${t}.tar.gz`
}

/**
 * 导入错误：dbClosed 标记失败时是否已经关闭了数据库连接。
 * 为 true 表示失败发生在关库之后的替换阶段——此时应用必须重启，由 startupOpen 从滚动备份恢复。
 */
export class ImportError extends Error {
  constructor(message: string, readonly dbClosed: boolean) {
    super(message)
  }
}

/** 把 target 改名到 old（保底），再把 staged 改名到 target（同盘 rename，近乎原子） */
function swapInto(target: string, staged: string, old: string): void {
  fs.rmSync(old, { force: true })
  if (fs.existsSync(target)) fs.renameSync(target, old)
  fs.renameSync(staged, target)
}

/** 替换失败时把保底文件改回来（尽力而为，失败也不抛） */
function rollbackTo(target: string, old: string): void {
  try {
    if (!fs.existsSync(target) && fs.existsSync(old)) fs.renameSync(old, target)
  } catch { /* 忽略回滚失败，交给启动时的备份恢复兜底 */ }
}

/**
 * 导出：把 app.db（VACUUM INTO 一致性快照）+ images/ 打包成单个 .tar.gz。
 * 纯函数式：不做弹窗，方便单测；弹窗在 IPC 层。
 */
export async function exportData(db: DatabaseSync, dataDir: string, destFile: string): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lifeos-export-'))
  try {
    snapshotTo(db, path.join(tmp, EXPORT_DB))
    const imagesDir = path.join(dataDir, EXPORT_IMAGES)
    const hasImages = fs.existsSync(imagesDir)
    if (hasImages) fs.cpSync(imagesDir, path.join(tmp, EXPORT_IMAGES), { recursive: true })
    const entries = [EXPORT_DB, ...(hasImages ? [EXPORT_IMAGES] : [])]
    await tar.c({ gzip: true, file: destFile, cwd: tmp }, entries)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

/**
 * 导入：解压 .tar.gz → 校验库完整性 → 先备份当前库 → 预置新文件 → 关库后用 rename 替换。
 * - 关库之前的所有步骤（解压 / 校验 / 备份 / 预置）失败都抛 `ImportError(dbClosed=false)`，
 *   此时数据库仍打开、现有数据完好，应用可继续用。
 * - 关库之后的替换失败会先尽力回滚，再抛 `ImportError(dbClosed=true)`，由调用方重启恢复。
 */
export async function importData(db: DatabaseSync, dataDir: string, srcFile: string): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lifeos-import-'))
  const dbFile = path.join(dataDir, EXPORT_DB)
  const imagesDir = path.join(dataDir, EXPORT_IMAGES)
  const stagedDb = path.join(dataDir, '.import-app.db')
  const stagedImages = path.join(dataDir, '.import-images')
  const oldDb = `${dbFile}.pre-import`
  const oldImages = `${imagesDir}.pre-import`

  try {
    // 1) 解压（关库前，失败不影响现有数据）
    await tar.x({ gzip: true, file: srcFile, cwd: tmp })
    const importedDb = path.join(tmp, EXPORT_DB)
    if (!fs.existsSync(importedDb)) throw new ImportError('导入包缺少 app.db', false)

    // 2) 校验导入库（关库前）
    let healthy = false
    try {
      const probe = openDb(importedDb)
      healthy = isHealthy(probe)
      probe.close()
    } catch {
      healthy = false
    }
    if (!healthy) throw new ImportError('导入包中的数据库损坏或无法打开', false)

    // 3) 先给当前库做滚动备份（替换失败也能手动找回）
    createBackup(db, path.join(dataDir, 'backups'))

    // 4) 预置新文件到数据目录（关库前完成；失败则库仍开、应用完好）
    fs.copyFileSync(importedDb, stagedDb)
    fs.rmSync(stagedImages, { recursive: true, force: true })
    const importedImages = path.join(tmp, EXPORT_IMAGES)
    if (fs.existsSync(importedImages)) fs.cpSync(importedImages, stagedImages, { recursive: true })

    // 5) 关库后用 rename 替换（同盘 rename 近乎原子；失败则回滚）
    db.close()
    try {
      swapInto(dbFile, stagedDb, oldDb)
      fs.rmSync(`${dbFile}-wal`, { force: true })
      fs.rmSync(`${dbFile}-shm`, { force: true })

      fs.rmSync(oldImages, { recursive: true, force: true })
      if (fs.existsSync(imagesDir)) fs.renameSync(imagesDir, oldImages)
      if (fs.existsSync(stagedImages)) fs.renameSync(stagedImages, imagesDir)
      fs.mkdirSync(imagesDir, { recursive: true })
    } catch (err) {
      rollbackTo(dbFile, oldDb)
      rollbackTo(imagesDir, oldImages)
      throw new ImportError('导入文件替换失败，已回滚', true)
    }

    // 清理保底旧文件
    fs.rmSync(oldDb, { force: true })
    fs.rmSync(oldImages, { recursive: true, force: true })
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
    fs.rmSync(stagedDb, { force: true })
    fs.rmSync(stagedImages, { recursive: true, force: true })
  }
}
