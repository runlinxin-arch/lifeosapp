import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openDb } from '../src/main/db'
import {
  backupFileName, listBackups, pruneBackups, newestBackup,
  createBackup, isHealthy, startupOpen
} from '../src/main/backup'

let dir: string
let dbFile: string
let backupDir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lifeos-bak-'))
  dbFile = path.join(dir, 'app.db')
  backupDir = path.join(dir, 'backups')
  fs.mkdirSync(backupDir, { recursive: true })
})
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

function seeded(): ReturnType<typeof openDb> {
  const db = openDb(dbFile)
  db.prepare('INSERT INTO tasks (title, date) VALUES (?, ?)').run('种子', '2026-09-30')
  return db
}

// 破坏数据库文件头之后的一页，制造 quick_check 可检出的损坏
function corrupt(file: string): void {
  const fd = fs.openSync(file, 'r+')
  fs.writeSync(fd, Buffer.from('GARBAGE!GARBAGE!GARBAGE!'), 0, 24, 4096)
  fs.closeSync(fd)
}

describe('backupFileName', () => {
  it('按本地时间命名，字典序即时间序', () => {
    expect(backupFileName(new Date(2026, 8, 30, 9, 5, 3))).toBe('app-20260930-090503.db')
  })
})

describe('pruneBackups', () => {
  it('只保留最近 10 份，且不误删非备份文件', () => {
    const names = Array.from({ length: 12 }, (_, i) => `app-202609${String(i + 1).padStart(2, '0')}-120000.db`)
    for (const n of names) fs.writeFileSync(path.join(backupDir, n), 'x')
    fs.writeFileSync(path.join(backupDir, 'notes.txt'), 'x')

    const removed = pruneBackups(backupDir)
    expect(removed).toEqual(names.slice(0, 2))
    expect(listBackups(backupDir)).toEqual(names.slice(2))
    expect(fs.existsSync(path.join(backupDir, 'notes.txt'))).toBe(true)
  })

  it('newestBackup 取文件名最大的那份', () => {
    fs.writeFileSync(path.join(backupDir, 'app-20260901-120000.db'), 'x')
    fs.writeFileSync(path.join(backupDir, 'app-20260930-120000.db'), 'x')
    expect(newestBackup(backupDir)).toBe(path.join(backupDir, 'app-20260930-120000.db'))
    expect(newestBackup(path.join(dir, 'nope'))).toBeNull()
  })
})

describe('createBackup', () => {
  it('VACUUM INTO 出的备份可独立打开且含数据', () => {
    const db = seeded()
    const p = createBackup(db, backupDir, new Date(2026, 8, 30, 13, 0, 0))
    expect(path.basename(p)).toBe('app-20260930-130000.db')

    const copy = openDb(p)
    expect(copy.prepare('SELECT COUNT(*) c FROM tasks').get()).toEqual({ c: 1 })
    copy.close()
    db.close()
  })

  it('同一秒重复备份不报错（已存在则覆盖）', () => {
    const db = seeded()
    const at = new Date(2026, 8, 30, 13, 0, 0)
    createBackup(db, backupDir, at)
    createBackup(db, backupDir, at)
    expect(listBackups(backupDir)).toHaveLength(1)
    db.close()
  })

  it('备份数量超过 10 份后只保留最近 10 份', () => {
    const db = seeded()
    for (let i = 0; i < 13; i++) {
      createBackup(db, backupDir, new Date(2026, 8, 30, 13, 0, i))
    }
    expect(listBackups(backupDir)).toHaveLength(10)
    db.close()
  })
})

describe('isHealthy', () => {
  it('正常库为 true，损坏库为 false', () => {
    const db = seeded()
    expect(isHealthy(db)).toBe(true)
    db.close()

    // 已实测：这种损坏下 openDb 仍可打开，只是 quick_check 报错，
    // 所以这里必须走"打开后校验"这条路径，不做任何分支兜底
    corrupt(dbFile)
    const corrupted = openDb(dbFile)
    expect(isHealthy(corrupted)).toBe(false)
    corrupted.close()
  })
})

describe('startupOpen', () => {
  it('全新安装：建新库，无提示', () => {
    const { db, notice } = startupOpen(dbFile, backupDir)
    expect(notice).toBeNull()
    expect(db.prepare('SELECT COUNT(*) c FROM tasks').get()).toEqual({ c: 0 })
    db.close()
  })

  it('库文件缺失但有备份：自动恢复并给出提示', () => {
    const db = seeded()
    createBackup(db, backupDir, new Date(2026, 8, 30, 13, 0, 0))
    db.close()
    fs.rmSync(dbFile)

    const r = startupOpen(dbFile, backupDir)
    expect(r.notice).toContain('恢复')
    expect(r.db.prepare('SELECT COUNT(*) c FROM tasks').get()).toEqual({ c: 1 })
    r.db.close()
  })

  it('库损坏且有备份：隔离坏文件后恢复', () => {
    const db = seeded()
    createBackup(db, backupDir, new Date(2026, 8, 30, 13, 0, 0))
    db.close()
    corrupt(dbFile)

    const r = startupOpen(dbFile, backupDir)
    expect(r.notice).toContain('损坏')
    expect(r.db.prepare('SELECT COUNT(*) c FROM tasks').get()).toEqual({ c: 1 })
    r.db.close()
    const quarantined = fs.readdirSync(dir).filter((f) => f.includes('.corrupt-'))
    expect(quarantined).toHaveLength(1)
  })

  it('库损坏且无备份：新建空库并提示', () => {
    const db = seeded()
    db.close()
    corrupt(dbFile)

    const r = startupOpen(dbFile, backupDir)
    expect(r.notice).toContain('没有可用备份')
    r.db.close()
  })

  it('正常启动会顺手留一份备份', () => {
    const db = seeded()
    db.close()
    startupOpen(dbFile, backupDir).db.close()
    expect(listBackups(backupDir)).toHaveLength(1)
  })
})
