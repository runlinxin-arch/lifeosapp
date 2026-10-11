import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as tar from 'tar'
import { openDb } from '../src/main/db'
import { exportData, importData, defaultExportFileName } from '../src/main/dataTransfer'

const tmpDirs: string[] = []
function makeDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lifeos-dt-test-'))
  tmpDirs.push(d)
  return d
}
afterEach(() => { for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }) })

function ensureLayout(dir: string): void {
  fs.mkdirSync(path.join(dir, 'backups'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'images'), { recursive: true })
}

describe('dataTransfer', () => {
  it('导出再导入：任务、设置与图片完整还原', async () => {
    const srcDir = makeDir()
    ensureLayout(srcDir)
    const srcDb = openDb(path.join(srcDir, 'app.db'))
    srcDb.prepare('INSERT INTO tasks (title, date) VALUES (?, ?)').run('【验收】导出任务', '2026-10-11')
    srcDb.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run('theme.mode', '"light"')
    fs.writeFileSync(path.join(srcDir, 'images', 'pic.png'), 'fake-image-bytes')

    const dest = path.join(makeDir(), 'export.tar.gz')
    await exportData(srcDb, srcDir, dest)
    srcDb.close()

    const tgtDir = makeDir()
    ensureLayout(tgtDir)
    const tgtDb = openDb(path.join(tgtDir, 'app.db'))
    await importData(tgtDb, tgtDir, dest) // 内部关闭 tgtDb 并替换文件

    const reopened = openDb(path.join(tgtDir, 'app.db'))
    const task = reopened.prepare('SELECT title FROM tasks').get() as { title: string }
    expect(task.title).toBe('【验收】导出任务')
    const mode = reopened.prepare("SELECT value FROM settings WHERE key = 'theme.mode'").get() as { value: string }
    expect(mode.value).toBe('"light"')
    reopened.close()

    expect(fs.readFileSync(path.join(tgtDir, 'images', 'pic.png'), 'utf8')).toBe('fake-image-bytes')
  })

  it('缺 app.db 的包导入时报错，且不影响现有库', async () => {
    // 造一个只含 images 的假包
    const badDir = makeDir()
    fs.mkdirSync(path.join(badDir, 'images'), { recursive: true })
    fs.writeFileSync(path.join(badDir, 'images', 'x.png'), 'x')
    const badFile = path.join(makeDir(), 'bad.tar.gz')
    // 用 tar 打个只有 images 的包
    await tar.c({ gzip: true, file: badFile, cwd: badDir }, ['images'])

    const tgtDir = makeDir()
    ensureLayout(tgtDir)
    const tgtDb = openDb(path.join(tgtDir, 'app.db'))
    tgtDb.prepare('INSERT INTO tasks (title, date) VALUES (?, ?)').run('保留任务', '2026-10-11')

    await expect(importData(tgtDb, tgtDir, badFile)).rejects.toThrow('缺少 app.db')

    // 失败时现有库不受影响（仍打开且数据在）
    const task = tgtDb.prepare('SELECT title FROM tasks').get() as { title: string }
    expect(task.title).toBe('保留任务')
    tgtDb.close()
  })

  it('损坏的 app.db 导入时报错，且现有库不受影响（连接仍打开）', async () => {
    const badDir = makeDir()
    fs.writeFileSync(path.join(badDir, 'app.db'), 'not a sqlite database file')
    const badFile = path.join(makeDir(), 'corrupt.tar.gz')
    await tar.c({ gzip: true, file: badFile, cwd: badDir }, ['app.db'])

    const tgtDir = makeDir()
    ensureLayout(tgtDir)
    const tgtDb = openDb(path.join(tgtDir, 'app.db'))
    tgtDb.prepare('INSERT INTO tasks (title, date) VALUES (?, ?)').run('保留任务', '2026-10-11')

    await expect(importData(tgtDb, tgtDir, badFile)).rejects.toThrow('损坏')

    const task = tgtDb.prepare('SELECT title FROM tasks').get() as { title: string }
    expect(task.title).toBe('保留任务')
    tgtDb.close()
  })
})

describe('defaultExportFileName', () => {
  it('导出文件名为单段扩展名 .lifeos（避免多段扩展名过滤问题）', () => {
    const name = defaultExportFileName(new Date('2026-10-11T22:30:00'))
    expect(name).toBe('LifeOS-backup-20261011-223000.lifeos')
    expect(name.endsWith('.lifeos')).toBe(true)
  })
})
