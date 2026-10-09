// 人工验证用的固定夹具：一个进行中的项目 + 5 张分布在不同列的看板任务
// 直接写库（不经 IPC），因为目的是给手工操作准备素材，不是验证写入链路。
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dbPath = path.join(process.env.APPDATA, 'LifeOS', 'app.db')
const db = new DatabaseSync(dbPath)

db.exec('PRAGMA foreign_keys = ON')

const proj = db.prepare(
  "INSERT INTO projects (name, status, description) VALUES (?, 'in_progress', ?)"
).run('拖拽手感验证', '看看跨列拖动与列内排序顺不顺')

const pid = Number(proj.lastInsertRowid)

const tasks = [
  ['设计数据表结构', 'todo', 0, 'high', '2026-10-15'],
  ['实现 IPC 通道', 'todo', 1, 'mid', null],
  ['写单元测试', 'todo', 2, 'low', null],
  ['接入渲染端 store', 'doing', 0, 'high', null],
  ['页面骨架', 'done', 0, 'mid', null]
]

const ins = db.prepare(
  'INSERT INTO dev_tasks (project_id, title, column_name, position, priority, due_date) VALUES (?, ?, ?, ?, ?, ?)'
)
for (const t of tasks) ins.run(pid, ...t)

console.log(`已写入项目「拖拽手感验证」(id=${pid})，含 ${tasks.length} 张看板任务：`)
console.log('  待办 3 张（含高/中/低优先级与一个截止日）· 进行中 1 张 · 已完成 1 张')
console.log('')
const n = (t) => db.prepare('SELECT COUNT(*) c FROM ' + t).get().c
console.log(`当前库内：projects=${n('projects')} dev_tasks=${n('dev_tasks')} inspirations=${n('inspirations')}`)
db.close()
