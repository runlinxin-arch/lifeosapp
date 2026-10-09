/**
 * 清空演示/验收数据，让数据库回到干净状态。
 * 与 scripts/dev/reseed-demo.mts 配对使用。
 * 用法：npx vite-node -c vitest.config.ts scripts/dev/clear-demo.mts
 */
import fs from 'node:fs'
import path from 'node:path'
import { openDb } from '../../src/main/db'
import { createBackup } from '../../src/main/backup'

const dataDir = path.join(process.env.APPDATA as string, 'LifeOS')
const dbFile = path.join(dataDir, 'app.db')

if (!fs.existsSync(dbFile)) {
  console.log('数据库不存在，无需清理')
  process.exit(0)
}

const db = openDb(dbFile)

// 清理前先留一份备份，可反悔
const backup = createBackup(db, path.join(dataDir, 'backups'))
console.log('清理前已备份:', path.basename(backup))
console.log('')

const counts = () => ({
  tasks: (db.prepare('SELECT COUNT(*) c FROM tasks').get() as { c: number }).c,
  long_tasks: (db.prepare('SELECT COUNT(*) c FROM long_tasks').get() as { c: number }).c,
  events: (db.prepare('SELECT COUNT(*) c FROM events').get() as { c: number }).c,
  settings: (db.prepare('SELECT COUNT(*) c FROM settings').get() as { c: number }).c
})

const before = counts()

const t = db.prepare("DELETE FROM tasks WHERE title LIKE '【演示】%' OR title LIKE '【验收】%'").run()
const e = db.prepare("DELETE FROM events WHERE title LIKE '【演示】%' OR title LIKE '【验收】%'").run()
const l = db.prepare("DELETE FROM long_tasks WHERE title LIKE '【演示】%' OR title LIKE '【验收】%'").run()

// 事件已删除，清掉它们派生出的日程汇入行（来源事件已不存在）
const orphan = db.prepare(`
  DELETE FROM tasks
  WHERE source_module = 'event'
    AND (source_id IS NULL OR source_id NOT IN (SELECT id FROM events))
`).run()

// 验收期间被改动过的设置一并复位（这些键的值本就等于默认值）
const s = db.prepare(`
  DELETE FROM settings WHERE key IN ('timeline.rangeDays','timeline.showDone','remind.enabled','remind.leadMinutes')
`).run()

// 学习模块的验收数据（笔记与学习记录由外键级联删除）
const learn = db.prepare("DELETE FROM learn_items WHERE title LIKE '【演示】%' OR title LIKE '【验收】%'").run()

// 开发模块：项目（看板任务/Bug/计时由外键级联删除；技术笔记因 SET NULL 会保留，需单独清）
const projects = db.prepare("DELETE FROM projects WHERE name LIKE '【演示】%' OR name LIKE '【验收】%'").run()
const snippets = db.prepare("DELETE FROM snippets WHERE title LIKE '【演示】%' OR title LIKE '【验收】%'").run()
const techNotes = db.prepare("DELETE FROM tech_notes WHERE title LIKE '【演示】%' OR title LIKE '【验收】%'").run()
// 项目被删后技术笔记会解绑，把验收产生的孤儿笔记一并清掉
const orphanNotes = db.prepare(`
  DELETE FROM tech_notes
  WHERE project_id IS NULL AND (title LIKE '%验收%' OR title LIKE '%演示%')
`).run()

const after = counts()

console.log('删除明细:')
console.log(`  tasks      ${t.changes} 行（标记数据）`)
console.log(`  events     ${e.changes} 行`)
console.log(`  long_tasks ${l.changes} 行`)
console.log(`  日程汇入残留 ${orphan.changes} 行`)
console.log(`  learn_items ${learn.changes} 行`)
console.log(`  projects   ${projects.changes} 行`)
console.log(`  snippets   ${snippets.changes} 行`)
console.log(`  tech_notes ${techNotes.changes + orphanNotes.changes} 行`)
console.log(`  settings   ${s.changes} 行（复位为默认）`)
console.log('')
console.log('清理前:', JSON.stringify(before))
console.log('清理后:', JSON.stringify(after))
console.log('quick_check =', JSON.stringify((db.prepare('PRAGMA quick_check').get() as { quick_check: string }).quick_check))
db.close()
