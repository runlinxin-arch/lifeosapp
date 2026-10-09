// 性能验证用的大数据量播种脚本（直接写库，绕开 IPC，避免播种本身成为瓶颈）
//
// 用法: node scripts/dev/seed-perf-data.mjs [scale]
//   scale 默认 1；2 表示各项数量翻倍
//
// 播种内容：
//   项目与看板：20 个项目 × 25 张任务，外加 1 个"压力项目"含 300 张任务
//   灵感：1000 条（其中 200 条带图片文件、300 条带标签、150 条精选）
//   学习：300 个学习项 + 2000 条学习记录（跨越 400 天）
//   开发计时：800 条记录
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const scale = Math.max(1, Number(process.argv[2] ?? 1))
const n = (base) => Math.round(base * scale)

const dataDir = path.join(process.env.APPDATA, 'LifeOS')
const imagesDir = path.join(dataDir, 'images')
fs.mkdirSync(imagesDir, { recursive: true })

const db = new DatabaseSync(path.join(dataDir, 'app.db'))
db.exec('PRAGMA foreign_keys = ON')

// 清空业务表，保证测量基线一致
for (const t of [
  'tasks', 'long_tasks', 'events', 'learn_notes', 'learn_sessions', 'learn_items',
  'tech_notes', 'snippets', 'bugs', 'dev_sessions', 'dev_tasks', 'projects',
  'inspirations', 'inspiration_boards'
]) db.exec('DELETE FROM ' + t)

const today = new Date()
const dayStr = (offset) => {
  const d = new Date(today)
  d.setDate(d.getDate() + offset)
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const started = Date.now()

// ---------- 项目与看板 ----------
const PROJECTS = n(20)
const TASKS_PER_PROJECT = n(25)
const STRESS_TASKS = n(300)

const insProject = db.prepare("INSERT INTO projects (name, status, description, start_date, end_date) VALUES (?, ?, ?, ?, ?)")
const insTask = db.prepare(
  'INSERT INTO dev_tasks (project_id, title, column_name, position, priority, start_date, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)'
)
const COLUMNS = ['todo', 'doing', 'done']
const PRIORITIES = ['low', 'mid', 'high']

const projectIds = []
db.exec('BEGIN')
for (let p = 0; p < PROJECTS; p++) {
  const status = ['planned', 'in_progress', 'paused', 'done'][p % 4]
  const info = insProject.run(`性能项目 ${p + 1}`, status, `第 ${p + 1} 个用于性能验证的项目`, dayStr(-60), dayStr(60))
  const pid = Number(info.lastInsertRowid)
  projectIds.push(pid)

  const perCol = { todo: 0, doing: 0, done: 0 }
  for (let t = 0; t < TASKS_PER_PROJECT; t++) {
    const col = COLUMNS[t % 3]
    insTask.run(pid, `任务 ${p + 1}-${t + 1}`, col, perCol[col]++, PRIORITIES[t % 3], null, t % 5 === 0 ? dayStr(7) : null)
  }
}

// 压力项目：300 张任务集中在同一块看板上
const stressInfo = insProject.run('压力测试项目', 'in_progress', '单个项目 300 张卡片', dayStr(-30), dayStr(90))
const stressPid = Number(stressInfo.lastInsertRowid)
projectIds.push(stressPid)
const stressPerCol = { todo: 0, doing: 0, done: 0 }
for (let t = 0; t < STRESS_TASKS; t++) {
  const col = COLUMNS[t % 3]
  insTask.run(stressPid, `压力任务 ${t + 1}`, col, stressPerCol[col]++, PRIORITIES[t % 3], null, null)
}
db.exec('COMMIT')

// ---------- 开发计时 ----------
const taskIds = db.prepare('SELECT id FROM dev_tasks').all().map((r) => r.id)
const insDevSession = db.prepare('INSERT INTO dev_sessions (task_id, started_at, ended_at, minutes) VALUES (?, ?, ?, ?)')
db.exec('BEGIN')
for (let i = 0; i < n(800); i++) {
  const tid = taskIds[i % taskIds.length]
  const d = dayStr(-(i % 30))
  const hh = String(9 + (i % 8)).padStart(2, '0')
  insDevSession.run(tid, `${d} ${hh}:00`, `${d} ${hh}:30`, 30)
}
db.exec('COMMIT')

// ---------- 灵感 ----------
const IMAGE_COUNT = n(200)
const INSP_TOTAL = n(1000)

// 生成 IMAGE_COUNT 个真实 PNG 文件（1×1 透明 PNG，测的是文件数量与计数而非解码开销）
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)
const imageNames = []
for (let i = 0; i < IMAGE_COUNT; i++) {
  const name = `${randomUUID()}.png`
  fs.writeFileSync(path.join(imagesDir, name), PNG)
  imageNames.push(name)
}

const insBoard = db.prepare('INSERT INTO inspiration_boards (name) VALUES (?)')
const boardIds = []
for (let b = 0; b < n(12); b++) boardIds.push(Number(insBoard.run(`性能画板 ${b + 1}`).lastInsertRowid))

const insInsp = db.prepare(
  'INSERT INTO inspirations (board_id, text, image_path, source_url, starred, tags) VALUES (?, ?, ?, ?, ?, ?)'
)
const TAG_POOL = ['配色', '排版', '交互', '动效', '字体', '插画', '图标', '留白']
db.exec('BEGIN')
for (let i = 0; i < INSP_TOTAL; i++) {
  const hasImage = i < IMAGE_COUNT
  const starred = i % 7 === 0 ? 1 : 0
  const tags = i % 3 === 0 ? JSON.stringify([TAG_POOL[i % TAG_POOL.length], TAG_POOL[(i + 3) % TAG_POOL.length]]) : '[]'
  const board = i % 5 === 0 ? boardIds[i % boardIds.length] : null
  const url = i % 4 === 0 ? `https://example.com/shots/${i}` : null
  insInsp.run(board, hasImage ? `性能灵感 ${i + 1}（图片）` : `性能灵感 ${i + 1} 关于${TAG_POOL[i % TAG_POOL.length]}的思考`, hasImage ? imageNames[i] : null, url, starred, tags)
}
db.exec('COMMIT')

// ---------- 学习 ----------
const LEARN_ITEMS = n(300)
const LEARN_SESSIONS = n(2000)
const insLearn = db.prepare(
  "INSERT INTO learn_items (title, type, status, total_units, done_units, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?)"
)
const TYPES = ['book', 'course', 'skill']
const STATUSES = ['not_started', 'learning', 'done']
const learnIds = []
db.exec('BEGIN')
for (let i = 0; i < LEARN_ITEMS; i++) {
  const total = 10 + (i % 40)
  const done = i % 3 === 0 ? total : (i % total)
  learnIds.push(Number(
    insLearn.run(`性能学习项 ${i + 1}`, TYPES[i % 3], STATUSES[i % 3], total, done, dayStr(-100), dayStr(100)).lastInsertRowid
  ))
}
const insLearnSession = db.prepare('INSERT INTO learn_sessions (item_id, date, minutes) VALUES (?, ?, ?)')
for (let i = 0; i < LEARN_SESSIONS; i++) {
  insLearnSession.run(learnIds[i % learnIds.length], dayStr(-(i % 400)), 20 + (i % 60))
}
db.exec('COMMIT')

db.close()

const counts = {
  projects: PROJECTS + 1,
  dev_tasks: PROJECTS * TASKS_PER_PROJECT + STRESS_TASKS,
  dev_sessions: n(800),
  inspirations: INSP_TOTAL,
  inspiration_images: IMAGE_COUNT,
  inspiration_boards: n(12),
  learn_items: LEARN_ITEMS,
  learn_sessions: LEARN_SESSIONS
}

console.log(`播种完成（scale=${scale}，耗时 ${((Date.now() - started) / 1000).toFixed(1)}s）`)
for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(22)} ${v}`)
console.log(`  压力项目 id=${stressPid}（${STRESS_TASKS} 张卡片）`)
