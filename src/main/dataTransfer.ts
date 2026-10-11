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
 * 导入：解压 .tar.gz → 校验库完整性 → 先备份当前库 → 关闭连接、替换 app.db + images。
 * 校验或解压失败会抛错（此时当前库与数据目录保持原样）；替换成功后由调用方重启应用。
 */
export async function importData(db: DatabaseSync, dataDir: string, srcFile: string): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lifeos-import-'))
  try {
    await tar.x({ gzip: true, file: srcFile, cwd: tmp })

    const importedDb = path.join(tmp, EXPORT_DB)
    if (!fs.existsSync(importedDb)) throw new Error('导入包缺少 app.db')

    // 在临时目录打开导入库：跑迁移 + 完整性检查（坏库/缺表在此抛错，不影响现有数据）
    let healthy = false
    try {
      const probe = openDb(importedDb)
      healthy = isHealthy(probe)
      probe.close()
    } catch {
      healthy = false
    }
    if (!healthy) throw new Error('导入包中的数据库损坏或无法打开')

    // 先给当前库做一份滚动备份，替换失败也能手动找回
    createBackup(db, path.join(dataDir, 'backups'))

    // 关闭连接后才能安全替换磁盘文件
    db.close()
    const dbFile = path.join(dataDir, EXPORT_DB)
    fs.rmSync(dbFile, { force: true })
    fs.rmSync(`${dbFile}-wal`, { force: true })
    fs.rmSync(`${dbFile}-shm`, { force: true })
    fs.copyFileSync(importedDb, dbFile)

    const imagesDir = path.join(dataDir, EXPORT_IMAGES)
    fs.rmSync(imagesDir, { recursive: true, force: true })
    const importedImages = path.join(tmp, EXPORT_IMAGES)
    if (fs.existsSync(importedImages)) fs.cpSync(importedImages, imagesDir, { recursive: true })
    fs.mkdirSync(imagesDir, { recursive: true })
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}
