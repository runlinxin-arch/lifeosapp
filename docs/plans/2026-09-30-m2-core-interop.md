# M2 核心互通 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付日程模块与三向互通闭环：周/月视图日历、事件 CRUD 与重复事件、系统通知提醒、待办 ⇄ 日程双向转换、长期任务双通道上轴，并把数据安全（滚动备份 + 启动校验/自动恢复）补到位。

**Architecture:** 延续 M1 的 electron-vite 三入口结构。主进程独占 SQLite（`node:sqlite` 的 `DatabaseSync`，WAL），新增 `events` 表与 `user_version` 迁移机制；重复事件展开、周/月网格布局、提醒判定全部写成 `src/shared/` 下的纯函数（主进程与渲染进程共用、可单测），数据库层只负责读写与事务，渲染进程经 IPC 调用主进程，UI 保持 Zustand + React + Tailwind。

**Tech Stack:** Electron 44 + electron-vite + React 18 + TypeScript + Vite + Tailwind CSS + Zustand + `node:sqlite` + Vitest

## Global Constraints

- 数据目录：`%APPDATA%\LifeOS\`（`app.db` + `images/` + `backups/`），升级不丢数据
- 渲染进程禁止直接访问数据库；一切读写经 IPC 到主进程
- 多步写入必须包在 SQLite 事务中，失败回滚
- 深色色板：底色 `#1e1f24`、卡片 `#26272e`、描边 `#3a3b45`、强调 `#7c8cff`、正文 `#e4e4e7`、次要 `#8b8d98`
- 模块色：日程 `#7c8cff`、学习 `#4ade80`、开发 `#3498db`、灵感 `#e879c9`、健身 `#e74c3c`、饮食 `#f39c12`、娱乐 `#a06ee1`、独立 `#8b8d98`
- 日期格式统一 `YYYY-MM-DD`；日期时间格式统一 `YYYY-MM-DD HH:MM`（均为本地时区，字典序即时序）
- 每完成一个可独立验收的任务立即 commit
- **数据库驱动锁定为 `node:sqlite`**（Node v24.15.0 / Electron 44.4.5 内置，SQLite 3.51.3）。M1 计划中写的 better-sqlite3 实际未采用，**本里程碑不得引入 better-sqlite3 或任何原生编译依赖**
- 测试命令 `npm test`（vitest run），测试文件放 `tests/**/*.test.ts`；`@shared` 别名在 electron-vite 与 vitest 中均已配置；vitest 把 `node:sqlite` 别名到 `tests/shims/node-sqlite.ts`，**测试里不得直接 `import 'electron'`**
- 现有基线：`npm test` 4 个文件 14 个测试全绿；`src/main/db/index.ts` 目前只有 `CREATE TABLE IF NOT EXISTS`，无版本化迁移

## 文件结构

```
D:\LifeOSAPP\
├─ src/
│  ├─ shared/
│  │  ├─ types.ts            (改) 新增 Event/EventInput/EventPatch/Occurrence/RepeatType/Settings；LongTask 加 done
│  │  ├─ dates.ts            (新) 日期纯函数（由 renderer/lib/dates.ts 迁移而来 + 新增解析/月份助手）
│  │  ├─ recur.ts            (新) 重复事件展开引擎（纯函数）
│  │  ├─ layout.ts           (新) 周网格 / 月网格布局（纯函数）
│  │  └─ reminders.ts        (新) 提醒判定（纯函数）
│  ├─ main/
│  │  ├─ index.ts            (改) 启动顺序：备份 → 校验 → 打开/恢复 → IPC → 窗口 → 提醒
│  │  ├─ ipc.ts              (改) 新增 events / interop / settings / longTasks 通道
│  │  ├─ backup.ts           (新) 滚动备份、完整性校验、损坏隔离与恢复
│  │  ├─ reminders.ts        (新) 主进程轮询 + 系统通知
│  │  └─ db/
│  │     ├─ index.ts         (改) user_version 迁移机制
│  │     ├─ events.ts        (新) events CRUD + 区间展开
│  │     ├─ interop.ts       (新) 待办 ⇄ 日程互通（事务）
│  │     ├─ settings.ts      (新) settings 读写 + 默认值
│  │     ├─ longTasks.ts     (改) update / setDone / markFromSource / 校验
│  │     └─ tasks.ts         (改) createTask 支持 source_module / source_id
│  ├─ preload/
│  │  └─ index.ts            (改) 暴露新增 API
│  └─ renderer/src/
│     ├─ App.tsx             (改) 接入 SchedulePage
│     ├─ lib/
│     │  ├─ ipc.ts           (改) window.lifeos 类型 + 封装
│     │  └─ dates.ts         (改) 改为 re-export @shared/dates（保持旧导入路径可用）
│     ├─ stores/
│     │  ├─ eventsStore.ts   (新)
│     │  ├─ settingsStore.ts (新)
│     │  └─ longTasksStore.ts(改) 范围/显隐来自设置，新增 update/setDone
│     └─ components/
│        ├─ layout/
│        │  ├─ Sidebar.tsx   (改) 日程不再 disabled
│        │  └─ TimelineBar.tsx (改) 范围 7/30/90、已完成显隐、来源标记
│        ├─ schedule/
│        │  ├─ SchedulePage.tsx (新) 视图切换 + 事件编辑器宿主
│        │  ├─ WeekView.tsx     (新) 七列时间网格 + 待办拖入
│        │  ├─ MonthView.tsx    (新) 月历格 + 「+N」
│        │  ├─ EventDialog.tsx  (新) 事件新建/编辑/删除
│        │  └─ ConvertDialog.tsx(新) 待办转日程
│        └─ today/
│           ├─ TaskItem.tsx  (改) 事件来源行只读 + 来源标记
│           └─ TaskList.tsx  (改) 传递转日程入口
└─ tests/
   ├─ dates.test.ts          (改) 新增解析/月份助手用例
   ├─ layout.test.ts         (新)
   ├─ recur.test.ts          (新)
   ├─ migrate.test.ts        (新)
   ├─ events.test.ts         (新)
   ├─ interop.test.ts        (新)
   ├─ settings.test.ts       (新)
   ├─ reminders.test.ts      (新)
   ├─ backup.test.ts         (新)
   ├─ longTasks.test.ts      (改) 新增 update/setDone/markFromSource/校验用例
   └─ timeline.test.ts       (改) LongTask 夹具补 done 字段
```

---

### Task 1: 滚动备份 + 启动完整性校验与自动恢复

数据安全是 PRD 最高优先级（8.1），且本里程碑要改库结构，先把保险上到位。

**Files:**
- Create: `src/main/backup.ts`
- Modify: `src/main/index.ts:32-41`
- Test: `tests/backup.test.ts`

**Interfaces:**
- Consumes: `openDb(file: string): DatabaseSync`（`src/main/db/index.ts`）
- Produces:
  - `BACKUP_KEEP = 10`
  - `backupFileName(d: Date): string` → `app-YYYYMMDD-HHmmss.db`
  - `listBackups(dir: string): string[]`（仅备份文件，按文件名升序 = 时间升序）
  - `pruneBackups(dir: string, keep = BACKUP_KEEP): string[]`（返回被删文件名）
  - `newestBackup(dir: string): string | null`（返回绝对路径）
  - `createBackup(db: DatabaseSync, dir: string, now?: Date): string`（`VACUUM INTO`）
  - `isHealthy(db: DatabaseSync): boolean`
  - `startupOpen(dbFile: string, backupDir: string): { db: DatabaseSync; notice: string | null }`

- [ ] **Step 1: 写失败测试**

`tests/backup.test.ts`：

```ts
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
})

describe('isHealthy', () => {
  it('正常库为 true，损坏库为 false', () => {
    const db = seeded()
    expect(isHealthy(db)).toBe(true)
    db.close()
    corrupt(dbFile)
    const bad = openDb(dbFile)
    expect(isHealthy(bad)).toBe(false)
    bad.close()
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/backup.test.ts`
Expected: FAIL —— `Failed to resolve import "../src/main/backup"`

- [ ] **Step 3: 实现 `src/main/backup.ts`**

```ts
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

// VACUUM INTO 需要目标不存在，且必须用正斜杠路径写入 SQL 字面量
function vacuumInto(db: DatabaseSync, target: string): void {
  const literal = target.replace(/\\/g, '/').replace(/'/g, "''")
  db.exec(`VACUUM INTO '${literal}'`)
}

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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/backup.test.ts`
Expected: PASS（12 个用例）

- [ ] **Step 5: 接入启动流程**

`src/main/index.ts` 顶部 import 改为：

```ts
import { app, BrowserWindow, dialog, Notification, shell } from 'electron'
import path from 'node:path'
import { ensureDataDir } from './db'
import { startupOpen } from './backup'
import { registerIpc } from './ipc'
```

`app.whenReady()` 回调换成：

```ts
void app.whenReady().then(() => {
  const dataDir = app.getPath('userData')
  ensureDataDir(dataDir)
  const { db, notice } = startupOpen(path.join(dataDir, 'app.db'), path.join(dataDir, 'backups'))
  registerIpc(db)
  createWindow()
  if (notice) {
    void dialog.showMessageBox({ type: 'warning', title: 'LifeOS 数据恢复', message: notice })
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})
```

（`Notification` 在 Task 12 才会用到，本步先不 import，保持 lint 干净：写成 `import { app, BrowserWindow, dialog, shell } from 'electron'`。）

- [ ] **Step 6: 手动验收数据安全（PRD 8.1.3）**

Run: `npm run dev`
Expected:
1. 启动后 `%APPDATA%\LifeOS\backups\` 出现 `app-*.db`
2. 关闭应用，删除 `%APPDATA%\LifeOS\app.db`，重新 `npm run dev` → 数据仍在，并弹出"已从备份恢复"提示
3. 关闭应用，用十六进制编辑器把 `app.db` 第 4096 字节起改成垃圾，重新启动 → 弹出"数据库损坏，已从备份恢复"，`app.db.corrupt-*` 被保留

- [ ] **Step 7: Commit**

```bash
git add src/main/backup.ts src/main/index.ts tests/backup.test.ts
git commit -m "feat: 滚动备份 + 启动完整性校验与自动恢复（TDD）"
```

---

### Task 2: 迁移机制（user_version）+ events 表 + long_tasks.done

**Files:**
- Modify: `src/main/db/index.ts:22-53`
- Modify: `src/shared/types.ts:20-30`（LongTask 加 `done`）
- Modify: `tests/timeline.test.ts:5-8`（夹具补 `done`）
- Test: `tests/migrate.test.ts`

**Interfaces:**
- Consumes: `DatabaseSync`
- Produces:
  - `interface Migration { version: number; up: (db: DatabaseSync) => void }`
  - `runMigrations(db: DatabaseSync, migrations: Migration[]): void`（导出供测试注入假迁移）
  - `LATEST_VERSION: number`
  - `openDb(file: string): DatabaseSync`（签名不变，内部改为跑版本化迁移）
  - `events` 表：`id, title, start_at, end_at, all_day, location, note, repeat_type, repeat_interval, repeat_until, remind_minutes, created_at, updated_at`
  - `long_tasks.done INTEGER NOT NULL DEFAULT 0`
  - `LongTask.done: boolean`

- [ ] **Step 1: 写失败测试**

`tests/migrate.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openDb, runMigrations, LATEST_VERSION, type Migration } from '../src/main/db'

let dir: string
let dbFile: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lifeos-mig-')); dbFile = path.join(dir, 'app.db') })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

const columns = (db: ReturnType<typeof openDb>, table: string): string[] =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name)

const version = (db: ReturnType<typeof openDb>): number =>
  (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version

describe('migrate', () => {
  it('新库迁移到最新版本，events 表与 long_tasks.done 就位', () => {
    const db = openDb(dbFile)
    expect(version(db)).toBe(LATEST_VERSION)
    expect(columns(db, 'events')).toContain('repeat_type')
    expect(columns(db, 'events')).toContain('remind_minutes')
    expect(columns(db, 'long_tasks')).toContain('done')
    db.close()
  })

  it('M1 老库（user_version=0 且 long_tasks 无 done）能平滑升级且数据保留', () => {
    // 手工造一个 M1 形态的库：没有 user_version、long_tasks 无 done 列
    const raw = openDb(dbFile)
    raw.exec('DROP TABLE long_tasks')
    raw.exec(`CREATE TABLE long_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL,
      start_date TEXT NOT NULL, end_date TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#8b8d98',
      source_module TEXT, source_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')))`)
    raw.exec('PRAGMA user_version = 0')
    raw.prepare("INSERT INTO long_tasks (title, start_date, end_date) VALUES ('备考', '2026-10-01', '2026-12-01')").run()
    raw.close()

    const db = openDb(dbFile)
    expect(version(db)).toBe(LATEST_VERSION)
    expect(columns(db, 'long_tasks')).toContain('done')
    expect(db.prepare('SELECT title, done FROM long_tasks').get()).toEqual({ title: '备考', done: 0 })
    db.close()
  })

  it('重复打开是幂等的', () => {
    openDb(dbFile).close()
    const db = openDb(dbFile)
    expect(version(db)).toBe(LATEST_VERSION)
    expect(columns(db, 'long_tasks').filter((c) => c === 'done')).toHaveLength(1)
    db.close()
  })

  it('某个迁移抛错时整批回滚，版本号不前进', () => {
    const db = openDb(dbFile)
    const before = version(db)
    const bad: Migration[] = [
      { version: before + 1, up: (d) => { d.exec('CREATE TABLE tmp_ok (id INTEGER)') } },
      { version: before + 2, up: () => { throw new Error('boom') } }
    ]
    expect(() => runMigrations(db, bad)).toThrow('boom')
    expect(version(db)).toBe(before)
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((t) => t.name)
    expect(tables).not.toContain('tmp_ok')
    db.close()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/migrate.test.ts`
Expected: FAIL —— `does not provide an export named 'runMigrations'`

- [ ] **Step 3: 改写 `src/main/db/index.ts`**

```ts
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'

export interface Migration {
  version: number
  up: (db: DatabaseSync) => void
}

function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return rows.some((r) => r.name === column)
}

function addColumnIfMissing(db: DatabaseSync, table: string, column: string, ddl: string): void {
  if (!hasColumn(db, table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`)
}

export const MIGRATIONS: Migration[] = [
  {
    // v1 —— M1 基线（IF NOT EXISTS，对已存在的 M1 库同样安全）
    version: 1,
    up: (db) => db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        done INTEGER NOT NULL DEFAULT 0,
        priority TEXT NOT NULL DEFAULT 'mid' CHECK (priority IN ('low','mid','high')),
        done_at TEXT,
        date TEXT NOT NULL,
        source_module TEXT,
        source_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(date);
      CREATE TABLE IF NOT EXISTS long_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#8b8d98',
        source_module TEXT,
        source_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );
      CREATE INDEX IF NOT EXISTS idx_long_tasks_range ON long_tasks(start_date, end_date);
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `)
  },
  {
    // v2 —— M2：日程事件表 + 长期任务完成标记
    version: 2,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          start_at TEXT NOT NULL,
          end_at TEXT NOT NULL,
          all_day INTEGER NOT NULL DEFAULT 0,
          location TEXT,
          note TEXT,
          repeat_type TEXT NOT NULL DEFAULT 'none' CHECK (repeat_type IN ('none','daily','weekly','monthly')),
          repeat_interval INTEGER NOT NULL DEFAULT 1,
          repeat_until TEXT,
          remind_minutes INTEGER NOT NULL DEFAULT 15,
          created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_at);
      `)
      addColumnIfMissing(db, 'long_tasks', 'done', 'INTEGER NOT NULL DEFAULT 0')
    }
  }
]

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version

export function runMigrations(db: DatabaseSync, migrations: Migration[]): void {
  const current = Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)
  for (const m of migrations) {
    if (m.version <= current) continue
    db.exec('BEGIN')
    try {
      m.up(db)
      db.exec(`PRAGMA user_version = ${m.version}`)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }
}

export function openDb(file: string): DatabaseSync {
  if (file !== ':memory:') {
    const idx = Math.max(file.lastIndexOf('\\'), file.lastIndexOf('/'))
    if (idx > 0) fs.mkdirSync(file.substring(0, idx), { recursive: true })
  }
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  runMigrations(db, MIGRATIONS)
  return db
}

export function ensureDataDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
  fs.mkdirSync(`${dir}\\backups`, { recursive: true })
  fs.mkdirSync(`${dir}\\images`, { recursive: true })
}
```

- [ ] **Step 4: `LongTask` 加 `done`，同步既有夹具**

`src/shared/types.ts` 的 `LongTask` 接口加一行（放在 `color` 之后）：

```ts
  done: boolean
```

`tests/timeline.test.ts` 的 `lt()` 夹具补字段：

```ts
const lt = (id: number, s: string, e: string): LongTask => ({
  id, title: `T${id}`, start_date: s, end_date: e, color: '#fff', done: false,
  source_module: null, source_id: null, created_at: '', updated_at: ''
})
```

- [ ] **Step 5: 运行测试确认通过（含 M1 回归）**

Run: `npm test`
Expected: PASS —— 全部文件通过，其中 `tests/migrate.test.ts` 4 个用例通过

- [ ] **Step 6: Commit**

```bash
git add src/main/db/index.ts src/shared/types.ts tests/migrate.test.ts tests/timeline.test.ts
git commit -m "feat: user_version 迁移机制 + events 表 + long_tasks.done"
```

---

### Task 3: 共享日期工具 + 重复事件展开引擎（纯函数 TDD）

**Files:**
- Create: `src/shared/dates.ts`
- Create: `src/shared/recur.ts`
- Modify: `src/renderer/src/lib/dates.ts`（改为 re-export）
- Modify: `src/shared/types.ts`（追加事件相关类型）
- Modify: `tests/dates.test.ts`（追加新助手用例）
- Test: `tests/recur.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `src/shared/dates.ts`：`pad2(n): string`、`toDateStr(d: Date): string`、`todayStr(): string`、`addDays(dateStr: string, n: number): string`、`diffDays(a: string, b: string): number`、`formatCn(dateStr: string): string`、`parseLocal(s: string): Date`、`formatLocal(d: Date): string`、`datePart(s: string): string`、`timePart(s: string): string`、`timeToMinutes(t: string): number`、`monthIndex(dateStr: string): number`、`addMonthsClamped(dateStr: string, n: number): string`
  - `src/shared/recur.ts`：`expandEvent(ev: Event, from: string, to: string): Occurrence[]`、`expandEvents(events: Event[], from: string, to: string): Occurrence[]`、`occurrenceKey(o: Occurrence): string`
  - `src/shared/types.ts`：`RepeatType`、`Event`、`EventInput`、`EventPatch`、`Occurrence`

- [ ] **Step 1: 写失败测试（日期助手）**

在 `tests/dates.test.ts` 末尾追加（保留原有 4 个用例）：

```ts
import { parseLocal, formatLocal, datePart, timePart, timeToMinutes, monthIndex, addMonthsClamped } from '../src/renderer/src/lib/dates'

describe('日期时间助手', () => {
  it('datePart / timePart 切分 YYYY-MM-DD HH:MM', () => {
    expect(datePart('2026-09-30 09:05')).toBe('2026-09-30')
    expect(timePart('2026-09-30 09:05')).toBe('09:05')
  })
  it('parseLocal 与 formatLocal 互逆（本地时区）', () => {
    const s = '2026-09-30 09:05'
    expect(formatLocal(parseLocal(s))).toBe(s)
    expect(parseLocal(s).getHours()).toBe(9)
  })
  it('timeToMinutes 换算', () => {
    expect(timeToMinutes('00:00')).toBe(0)
    expect(timeToMinutes('09:05')).toBe(545)
    expect(timeToMinutes('23:59')).toBe(1439)
  })
  it('monthIndex 跨年连续', () => {
    expect(monthIndex('2026-12-01') - monthIndex('2026-01-01')).toBe(11)
  })
  it('addMonthsClamped 把 31 号夹到短月月末，且不累积漂移', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31')
    expect(addMonthsClamped('2026-01-31', 3)).toBe('2026-04-30')
  })
})
```

> 注意：`import` 语句要合并到文件顶部已有 import 之后，不要重复 import 同一模块的默认导出。

- [ ] **Step 2: 写失败测试（重复展开）**

`tests/recur.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { expandEvent, expandEvents, occurrenceKey } from '../src/shared/recur'
import type { Event } from '../src/shared/types'

const ev = (p: Partial<Event>): Event => ({
  id: 1, title: '事件', start_at: '2026-09-30 09:00', end_at: '2026-09-30 10:00',
  all_day: false, location: null, note: null, repeat_type: 'none',
  repeat_interval: 1, repeat_until: null, remind_minutes: 15,
  created_at: '', updated_at: '', ...p
})

describe('expandEvent', () => {
  it('单次事件只落在自己那天', () => {
    const e = ev({})
    expect(expandEvent(e, '2026-09-01', '2026-09-30').map((o) => o.date)).toEqual(['2026-09-30'])
    expect(expandEvent(e, '2026-10-01', '2026-10-31')).toEqual([])
  })

  it('每天重复：区间内逐日展开且保留时分', () => {
    const e = ev({ repeat_type: 'daily', start_at: '2026-09-28 07:30', end_at: '2026-09-28 08:00' })
    const dates = expandEvent(e, '2026-09-30', '2026-10-02').map((o) => o.date)
    expect(dates).toEqual(['2026-09-30', '2026-10-01', '2026-10-02'])
    expect(expandEvent(e, '2026-09-30', '2026-09-30')[0].startAt).toBe('2026-09-30 07:30')
  })

  it('每 3 天重复：从起点对齐，而不是从区间起点重新计数', () => {
    const e = ev({ repeat_type: 'daily', repeat_interval: 3, start_at: '2026-09-28 09:00', end_at: '2026-09-28 10:00' })
    expect(expandEvent(e, '2026-09-29', '2026-10-05').map((o) => o.date))
      .toEqual(['2026-10-01', '2026-10-04'])
  })

  it('每周重复：跨周命中', () => {
    const e = ev({ repeat_type: 'weekly', start_at: '2026-09-07 20:00', end_at: '2026-09-07 21:00' })
    expect(expandEvent(e, '2026-09-28', '2026-10-12').map((o) => o.date))
      .toEqual(['2026-09-28', '2026-10-05', '2026-10-12'])
  })

  it('每两周重复', () => {
    const e = ev({ repeat_type: 'weekly', repeat_interval: 2, start_at: '2026-09-07 20:00', end_at: '2026-09-07 21:00' })
    expect(expandEvent(e, '2026-09-01', '2026-10-05').map((o) => o.date))
      .toEqual(['2026-09-07', '2026-09-21', '2026-10-05'])
  })

  it('每月重复：31 号在短月夹到月末，长月回到 31 号（不漂移）', () => {
    const e = ev({ repeat_type: 'monthly', start_at: '2026-01-31 10:00', end_at: '2026-01-31 11:00' })
    expect(expandEvent(e, '2026-02-01', '2026-05-31').map((o) => o.date))
      .toEqual(['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'])
  })

  it('repeat_until 之后不再发生', () => {
    const e = ev({ repeat_type: 'daily', repeat_until: '2026-10-01' })
    expect(expandEvent(e, '2026-09-28', '2026-10-05').map((o) => o.date))
      .toEqual(['2026-09-30', '2026-10-01'])
  })

  it('全天事件透传 all_day，地点备注提醒分钟一并带出', () => {
    const e = ev({ all_day: true, location: '家', note: '备注', remind_minutes: 60, start_at: '2026-09-30 00:00', end_at: '2026-09-30 00:00' })
    const o = expandEvent(e, '2026-09-30', '2026-09-30')[0]
    expect(o).toMatchObject({ allDay: true, location: '家', note: '备注', remindMinutes: 60 })
    expect(occurrenceKey(o)).toBe('1@2026-09-30')
  })
})

describe('expandEvents', () => {
  it('多事件合并后按开始时间排序', () => {
    const list = [
      ev({ id: 1, title: '早', start_at: '2026-09-30 09:00', end_at: '2026-09-30 10:00' }),
      ev({ id: 2, title: '更早', start_at: '2026-09-30 07:00', end_at: '2026-09-30 08:00' })
    ]
    expect(expandEvents(list, '2026-09-30', '2026-09-30').map((o) => o.title)).toEqual(['更早', '早'])
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm test -- tests/recur.test.ts tests/dates.test.ts`
Expected: FAIL —— `Failed to resolve import "../src/shared/recur"`

- [ ] **Step 4: 创建 `src/shared/dates.ts`（内容为 M1 `renderer/lib/dates.ts` 原样搬迁 + 新增助手）**

```ts
export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function todayStr(): string {
  return toDateStr(new Date())
}

export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

export function diffDays(a: string, b: string): number {
  const ms = new Date(a + 'T00:00:00').getTime() - new Date(b + 'T00:00:00').getTime()
  return Math.round(ms / 86400000)
}

export function formatCn(dateStr: string): string {
  const [, m, d] = dateStr.split('-')
  return `${Number(m)}/${Number(d)}`
}

/** 'YYYY-MM-DD HH:MM' → Date（本地时区） */
export function parseLocal(s: string): Date {
  return new Date(`${s.slice(0, 10)}T${s.slice(11, 16)}:00`)
}

/** Date → 'YYYY-MM-DD HH:MM'（本地时区） */
export function formatLocal(d: Date): string {
  return `${toDateStr(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** 'YYYY-MM-DD HH:MM' → 'YYYY-MM-DD' */
export function datePart(s: string): string {
  return s.slice(0, 10)
}

/** 'YYYY-MM-DD HH:MM' → 'HH:MM' */
export function timePart(s: string): string {
  return s.slice(11, 16)
}

/** 'HH:MM' → 自 0 点起的分钟数 */
export function timeToMinutes(t: string): number {
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
}

/** 月份序号：2026-01 → 24312（跨年可比） */
export function monthIndex(dateStr: string): number {
  return Number(dateStr.slice(0, 4)) * 12 + (Number(dateStr.slice(5, 7)) - 1)
}

/** 加 n 个月；日超出目标月天数时夹到月末（始终以原日为准，不累积漂移） */
export function addMonthsClamped(dateStr: string, n: number): string {
  const mi = monthIndex(dateStr) + n
  const y = Math.floor(mi / 12)
  const m = (mi % 12) + 1
  const day = Number(dateStr.slice(8, 10))
  const last = new Date(y, m, 0).getDate()
  return `${y}-${pad2(m)}-${pad2(Math.min(day, last))}`
}
```

- [ ] **Step 5: 把 `src/renderer/src/lib/dates.ts` 改为 re-export（保持 M1 导入路径与测试不变）**

```ts
export * from '@shared/dates'
```

- [ ] **Step 6: `src/shared/types.ts` 追加事件类型**

在文件末尾追加（`LongTask` 已在 Task 2 加过 `done`）：

```ts
export type RepeatType = 'none' | 'daily' | 'weekly' | 'monthly'

export interface Event {
  id: number
  title: string
  start_at: string          // 'YYYY-MM-DD HH:MM'
  end_at: string            // 'YYYY-MM-DD HH:MM'
  all_day: boolean
  location: string | null
  note: string | null
  repeat_type: RepeatType
  repeat_interval: number
  repeat_until: string | null   // 'YYYY-MM-DD'
  remind_minutes: number
  created_at: string
  updated_at: string
}

export interface EventInput {
  title: string
  startAt: string
  endAt: string
  allDay?: boolean
  location?: string | null
  note?: string | null
  repeatType?: RepeatType
  repeatInterval?: number
  repeatUntil?: string | null
  remindMinutes?: number
}

export type EventPatch = Partial<EventInput>

/** 事件在某个具体日期的发生项（重复事件展开后的结果） */
export interface Occurrence {
  eventId: number
  title: string
  date: string          // 'YYYY-MM-DD'
  startAt: string       // 'YYYY-MM-DD HH:MM'
  endAt: string
  allDay: boolean
  location: string | null
  note: string | null
  remindMinutes: number
}
```

- [ ] **Step 7: 创建 `src/shared/recur.ts`**

```ts
import type { Event, Occurrence } from './types'
import { addDays, addMonthsClamped, datePart, diffDays, monthIndex, timePart } from './dates'

function occurrenceOf(ev: Event, date: string): Occurrence {
  return {
    eventId: ev.id,
    title: ev.title,
    date,
    startAt: `${date} ${timePart(ev.start_at)}`,
    endAt: `${date} ${timePart(ev.end_at)}`,
    allDay: ev.all_day,
    location: ev.location,
    note: ev.note,
    remindMinutes: ev.remind_minutes
  }
}

/** 单个事件在 [from, to]（含端点）内的所有发生项 */
export function expandEvent(ev: Event, from: string, to: string): Occurrence[] {
  const first = datePart(ev.start_at)
  const stop = ev.repeat_until && ev.repeat_until < to ? ev.repeat_until : to
  if (stop < from) return []

  if (ev.repeat_type === 'none') {
    return first >= from && first <= stop ? [occurrenceOf(ev, first)] : []
  }

  const interval = Math.max(1, ev.repeat_interval)
  const out: Occurrence[] = []

  if (ev.repeat_type === 'monthly') {
    const startMonth = monthIndex(first)
    const fromMonth = monthIndex(from)
    let k = fromMonth > startMonth ? Math.ceil((fromMonth - startMonth) / interval) : 0
    for (;;) {
      const d = addMonthsClamped(first, k * interval)
      if (d > stop) break
      if (d >= first && d >= from) out.push(occurrenceOf(ev, d))
      k++
    }
    return out
  }

  const stepDays = ev.repeat_type === 'weekly' ? interval * 7 : interval
  let d = first
  if (d < from) d = addDays(first, Math.ceil(diffDays(from, first) / stepDays) * stepDays)
  while (d <= stop) {
    out.push(occurrenceOf(ev, d))
    d = addDays(d, stepDays)
  }
  return out
}

/** 多事件展开并按开始时间排序 */
export function expandEvents(events: Event[], from: string, to: string): Occurrence[] {
  const out: Occurrence[] = []
  for (const ev of events) out.push(...expandEvent(ev, from, to))
  return out.sort((a, b) => a.startAt.localeCompare(b.startAt) || a.eventId - b.eventId)
}

/** 同一事件的同一天只算一次，用于提醒去重与待办同步 */
export function occurrenceKey(o: Occurrence): string {
  return `${o.eventId}@${o.date}`
}
```

- [ ] **Step 8: 运行测试确认通过**

Run: `npm test`
Expected: PASS —— 新增 `tests/recur.test.ts`（10 个用例）与 `tests/dates.test.ts`（9 个用例），M1 的 14 个用例不回归

- [ ] **Step 9: Commit**

```bash
git add src/shared/dates.ts src/shared/recur.ts src/shared/types.ts src/renderer/src/lib/dates.ts tests/dates.test.ts tests/recur.test.ts
git commit -m "feat: 共享日期工具 + 重复事件展开引擎（TDD）"
```

---

### Task 4: events 数据层（CRUD + 区间展开，TDD）

**Files:**
- Create: `src/main/db/events.ts`
- Test: `tests/events.test.ts`

**Interfaces:**
- Consumes: `DatabaseSync`、`Event`、`EventInput`、`EventPatch`、`Occurrence`、`expandEvents`
- Produces:
  - `listEvents(db, from: string, to: string): Event[]` —— 与 `[from, to]` 有交集的事件原始行（含起始日早于 from 的重复事件）
  - `getEvent(db, id: number): Event | null`
  - `createEvent(db, input: EventInput): Event`
  - `updateEvent(db, id: number, patch: EventPatch): Event`
  - `deleteEvent(db, id: number): void`
  - `listOccurrences(db, from: string, to: string): Occurrence[]`

- [ ] **Step 1: 写失败测试**

`tests/events.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { openDb } from '../src/main/db'
import { createEvent, deleteEvent, getEvent, listEvents, listOccurrences, updateEvent } from '../src/main/db/events'

let db: ReturnType<typeof openDb>
beforeEach(() => { db = openDb(':memory:') })

const base = { title: '需求评审', startAt: '2026-09-30 14:00', endAt: '2026-09-30 15:30' }

describe('events CRUD', () => {
  it('创建后可读回，默认值正确', () => {
    const e = createEvent(db, base)
    expect(e).toMatchObject({
      title: '需求评审', start_at: '2026-09-30 14:00', end_at: '2026-09-30 15:30',
      all_day: false, repeat_type: 'none', repeat_interval: 1, repeat_until: null, remind_minutes: 15
    })
    expect(getEvent(db, e.id)?.title).toBe('需求评审')
  })

  it('地点、备注、重复规则、提醒分钟可写入', () => {
    const e = createEvent(db, {
      ...base, location: '会议室', note: '带电脑', repeatType: 'weekly',
      repeatInterval: 2, repeatUntil: '2026-12-31', remindMinutes: 30
    })
    expect(e).toMatchObject({ location: '会议室', note: '带电脑', repeat_type: 'weekly', repeat_interval: 2, repeat_until: '2026-12-31', remind_minutes: 30 })
  })

  it('标题为空、结束早于开始、间隔小于 1、截止早于起始日均报错', () => {
    expect(() => createEvent(db, { ...base, title: '  ' })).toThrow('标题')
    expect(() => createEvent(db, { ...base, endAt: '2026-09-30 13:00' })).toThrow('结束时间')
    expect(() => createEvent(db, { ...base, repeatType: 'daily', repeatInterval: 0 })).toThrow('重复间隔')
    expect(() => createEvent(db, { ...base, repeatType: 'daily', repeatUntil: '2026-09-29' })).toThrow('重复截止')
  })

  it('更新是合并语义，未传字段保持不变', () => {
    const e = createEvent(db, { ...base, location: '会议室' })
    const u = updateEvent(db, e.id, { title: '评审（改）' })
    expect(u.title).toBe('评审（改）')
    expect(u.location).toBe('会议室')
    expect(u.start_at).toBe('2026-09-30 14:00')
  })

  it('删除后查不到', () => {
    const e = createEvent(db, base)
    deleteEvent(db, e.id)
    expect(getEvent(db, e.id)).toBeNull()
    expect(listEvents(db, '2026-09-01', '2026-09-30')).toHaveLength(0)
  })
})

describe('listEvents 区间查询', () => {
  it('按开始日过滤单次事件', () => {
    createEvent(db, base)
    createEvent(db, { title: '十月', startAt: '2026-10-05 09:00', endAt: '2026-10-05 10:00' })
    expect(listEvents(db, '2026-09-01', '2026-09-30').map((e) => e.title)).toEqual(['需求评审'])
  })

  it('起始日远早于区间但仍在重复的事件也要取到', () => {
    createEvent(db, { title: '每周站会', startAt: '2026-01-05 10:00', endAt: '2026-01-05 10:30', repeatType: 'weekly' })
    expect(listEvents(db, '2026-09-28', '2026-10-04').map((e) => e.title)).toEqual(['每周站会'])
  })

  it('repeat_until 早于区间的事件不再取到', () => {
    createEvent(db, { title: '已结束', startAt: '2026-01-05 10:00', endAt: '2026-01-05 10:30', repeatType: 'weekly', repeatUntil: '2026-03-01' })
    expect(listEvents(db, '2026-09-28', '2026-10-04')).toHaveLength(0)
  })
})

describe('listOccurrences', () => {
  it('把重复事件展开到区间内的每一天', () => {
    createEvent(db, { title: '晨跑', startAt: '2026-09-28 07:00', endAt: '2026-09-28 07:40', repeatType: 'daily' })
    const occ = listOccurrences(db, '2026-09-30', '2026-10-02')
    expect(occ.map((o) => o.date)).toEqual(['2026-09-30', '2026-10-01', '2026-10-02'])
    expect(occ[0].startAt).toBe('2026-09-30 07:00')
  })

  it('区间内没有事件时返回空数组', () => {
    expect(listOccurrences(db, '2026-09-30', '2026-09-30')).toEqual([])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/events.test.ts`
Expected: FAIL —— `Failed to resolve import "../src/main/db/events"`

- [ ] **Step 3: 实现 `src/main/db/events.ts`**

```ts
import type { DatabaseSync } from 'node:sqlite'
import type { Event, EventInput, EventPatch, Occurrence } from '@shared/types'
import { expandEvents } from '@shared/recur'
import { datePart } from '@shared/dates'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToEvent = (r: any): Event => ({ ...r, all_day: !!r.all_day })

function assertValid(input: EventInput): void {
  if (!input.title || !input.title.trim()) throw new Error('事件标题不能为空')
  if (input.endAt < input.startAt) throw new Error('结束时间不能早于开始时间')
  const interval = input.repeatInterval ?? 1
  if (!Number.isInteger(interval) || interval < 1) throw new Error('重复间隔必须是不小于 1 的整数')
  if (input.repeatUntil && input.repeatUntil < datePart(input.startAt)) {
    throw new Error('重复截止日期不能早于事件起始日')
  }
}

export function getEvent(db: DatabaseSync, id: number): Event | null {
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(id)
  return row ? rowToEvent(row) : null
}

/** 与 [from, to] 有交集的事件行；重复事件即使起始日早于 from 也会返回 */
export function listEvents(db: DatabaseSync, from: string, to: string): Event[] {
  return db.prepare(`
    SELECT * FROM events
    WHERE date(start_at) <= ?
      AND (repeat_type <> 'none' OR date(end_at) >= ?)
      AND (repeat_until IS NULL OR repeat_until >= ?)
    ORDER BY start_at ASC, id ASC
  `).all(to, from, from).map(rowToEvent)
}

export function createEvent(db: DatabaseSync, input: EventInput): Event {
  assertValid(input)
  const info = db.prepare(`
    INSERT INTO events (title, start_at, end_at, all_day, location, note,
                        repeat_type, repeat_interval, repeat_until, remind_minutes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.title.trim(),
    input.startAt,
    input.endAt,
    input.allDay ? 1 : 0,
    input.location ?? null,
    input.note ?? null,
    input.repeatType ?? 'none',
    input.repeatInterval ?? 1,
    input.repeatUntil ?? null,
    input.remindMinutes ?? 15
  )
  return getEvent(db, Number(info.lastInsertRowid))!
}

export function updateEvent(db: DatabaseSync, id: number, patch: EventPatch): Event {
  const cur = getEvent(db, id)
  if (!cur) throw new Error(`event ${id} not found`)
  const merged: EventInput = {
    title: patch.title ?? cur.title,
    startAt: patch.startAt ?? cur.start_at,
    endAt: patch.endAt ?? cur.end_at,
    allDay: patch.allDay ?? cur.all_day,
    location: patch.location !== undefined ? patch.location : cur.location,
    note: patch.note !== undefined ? patch.note : cur.note,
    repeatType: patch.repeatType ?? cur.repeat_type,
    repeatInterval: patch.repeatInterval ?? cur.repeat_interval,
    repeatUntil: patch.repeatUntil !== undefined ? patch.repeatUntil : cur.repeat_until,
    remindMinutes: patch.remindMinutes ?? cur.remind_minutes
  }
  assertValid(merged)
  db.prepare(`
    UPDATE events SET title=?, start_at=?, end_at=?, all_day=?, location=?, note=?,
      repeat_type=?, repeat_interval=?, repeat_until=?, remind_minutes=?,
      updated_at=datetime('now','localtime')
    WHERE id=?
  `).run(
    merged.title!.trim(), merged.startAt, merged.endAt, merged.allDay ? 1 : 0,
    merged.location ?? null, merged.note ?? null, merged.repeatType ?? 'none',
    merged.repeatInterval ?? 1, merged.repeatUntil ?? null, merged.remindMinutes ?? 15, id
  )
  return getEvent(db, id)!
}

export function deleteEvent(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM events WHERE id = ?').run(id)
}

/** 区间内的所有发生项（重复事件已展开、已排序） */
export function listOccurrences(db: DatabaseSync, from: string, to: string): Occurrence[] {
  return expandEvents(listEvents(db, from, to), from, to)
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/events.test.ts`
Expected: PASS（10 个用例）

- [ ] **Step 5: Commit**

```bash
git add src/main/db/events.ts tests/events.test.ts
git commit -m "feat: events 数据层 CRUD 与区间展开（TDD）"
```

---

### Task 5: 待办 ⇄ 日程互通（事务 + 幂等同步，TDD）

**Files:**
- Create: `src/main/db/interop.ts`
- Modify: `src/main/db/tasks.ts:4-8, 24-29`（`TaskInput` 支持来源字段）
- Test: `tests/interop.test.ts`

**Interfaces:**
- Consumes: `listOccurrences`、`createEvent`、`getTask`、`Task`、`Occurrence`
- Produces:
  - `TaskInput` 追加 `source_module?: ModuleKey | null`、`source_id?: number | null`
  - `syncEventTasks(db, date: string): void` —— 把 `date` 当天的日程发生项同步成 `source_module='event'` 的待办行（幂等）
  - `convertTaskToEvent(db, taskId: number, input: ConvertInput): Event`，其中 `ConvertInput = { startAt: string; endAt: string; location?: string | null; note?: string | null; remindMinutes?: number; repeatType?: RepeatType; repeatInterval?: number; repeatUntil?: string | null }`

**锁定的行为契约（本任务实现，UI 与验收都以此为准）：**

1. 事件 → 待办：某天 `tasks` 中 `source_module='event'` 的行与该天日程发生项一一对应（按 `source_id` 对齐）。新增缺失行、标题跟随事件、**保留用户已勾选的 `done` 状态**、删除来源事件已不在当天的行。
2. 事件来源的待办**不被同步覆盖的字段**：`done`、`priority`、`date`。
3. 待办 → 日程：在**一个事务**里创建事件并删除原待办；转换后的日程会在当天待办里以「日程来源」形态重新出现；失败整体回滚。
4. 已经是事件来源的待办不能再转（抛 `已经来自日程`）。

- [ ] **Step 1: 写失败测试**

`tests/interop.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { openDb } from '../src/main/db'
import { createEvent, deleteEvent, updateEvent } from '../src/main/db/events'
import { convertTaskToEvent, syncEventTasks } from '../src/main/db/interop'
import { createTask, listTasksByDate, updateTask } from '../src/main/db/tasks'

let db: ReturnType<typeof openDb>
beforeEach(() => { db = openDb(':memory:') })

const eventOn = (date: string, title = '站会') =>
  createEvent(db, { title, startAt: `${date} 10:00`, endAt: `${date} 10:30` })

describe('syncEventTasks', () => {
  it('当日事件汇入待办并带来源标记', () => {
    const e = eventOn('2026-09-30')
    syncEventTasks(db, '2026-09-30')
    const list = listTasksByDate(db, '2026-09-30')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ title: '站会', source_module: 'event', source_id: e.id, priority: 'mid', done: false })
  })

  it('重复执行不会重复插入（幂等）', () => {
    eventOn('2026-09-30')
    syncEventTasks(db, '2026-09-30')
    syncEventTasks(db, '2026-09-30')
    syncEventTasks(db, '2026-09-30')
    expect(listTasksByDate(db, '2026-09-30')).toHaveLength(1)
  })

  it('勾选完成后再同步，done 状态保留', () => {
    eventOn('2026-09-30')
    syncEventTasks(db, '2026-09-30')
    const t = listTasksByDate(db, '2026-09-30')[0]
    updateTask(db, t.id, { done: true })
    syncEventTasks(db, '2026-09-30')
    expect(listTasksByDate(db, '2026-09-30')[0].done).toBe(true)
  })

  it('事件改标题后同步，待办标题跟随', () => {
    const e = eventOn('2026-09-30')
    syncEventTasks(db, '2026-09-30')
    updateEvent(db, e.id, { title: '站会（改）' })
    syncEventTasks(db, '2026-09-30')
    const list = listTasksByDate(db, '2026-09-30')
    expect(list).toHaveLength(1)
    expect(list[0].title).toBe('站会（改）')
  })

  it('事件被删除后同步，对应待办行消失', () => {
    const e = eventOn('2026-09-30')
    syncEventTasks(db, '2026-09-30')
    deleteEvent(db, e.id)
    syncEventTasks(db, '2026-09-30')
    expect(listTasksByDate(db, '2026-09-30')).toHaveLength(0)
  })

  it('重复事件的每一天各自汇入', () => {
    createEvent(db, { title: '晨跑', startAt: '2026-09-28 07:00', endAt: '2026-09-28 07:40', repeatType: 'daily' })
    syncEventTasks(db, '2026-09-30')
    syncEventTasks(db, '2026-10-01')
    expect(listTasksByDate(db, '2026-09-30').map((t) => t.title)).toEqual(['晨跑'])
    expect(listTasksByDate(db, '2026-10-01').map((t) => t.title)).toEqual(['晨跑'])
  })

  it('手工待办不受同步影响，也不会被误删', () => {
    createTask(db, { title: '手写一条', date: '2026-09-30' })
    syncEventTasks(db, '2026-09-30')
    expect(listTasksByDate(db, '2026-09-30').map((t) => t.title)).toEqual(['手写一条'])
  })
})

describe('convertTaskToEvent', () => {
  it('一个事务里建事件、删原待办，且当天待办改由日程汇入', () => {
    const t = createTask(db, { title: '买咖啡豆', priority: 'high', date: '2026-09-30' })
    const e = convertTaskToEvent(db, t.id, { startAt: '2026-09-30 18:00', endAt: '2026-09-30 18:30' })

    expect(e.title).toBe('买咖啡豆')
    syncEventTasks(db, '2026-09-30')
    const list = listTasksByDate(db, '2026-09-30')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ title: '买咖啡豆', source_module: 'event', source_id: e.id })
  })

  it('参数非法时整体回滚，原待办仍在', () => {
    const t = createTask(db, { title: '买咖啡豆', date: '2026-09-30' })
    expect(() => convertTaskToEvent(db, t.id, { startAt: '2026-09-30 18:00', endAt: '2026-09-30 17:00' })).toThrow('结束时间')
    expect(listTasksByDate(db, '2026-09-30')).toHaveLength(1)
  })

  it('事件来源的待办不能再转', () => {
    const e = eventOn('2026-09-30')
    syncEventTasks(db, '2026-09-30')
    const t = listTasksByDate(db, '2026-09-30')[0]
    expect(() => convertTaskToEvent(db, t.id, { startAt: '2026-09-30 18:00', endAt: '2026-09-30 18:30' })).toThrow('已经来自日程')
    expect(listTasksByDate(db, '2026-09-30')).toHaveLength(1)
    expect(e.id).toBe(t.source_id)
  })

  it('待办不存在时报错', () => {
    expect(() => convertTaskToEvent(db, 999, { startAt: '2026-09-30 18:00', endAt: '2026-09-30 18:30' })).toThrow('not found')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/interop.test.ts`
Expected: FAIL —— `Failed to resolve import "../src/main/db/interop"`

- [ ] **Step 3: `src/main/db/tasks.ts` 支持来源字段**

`TaskInput` 换成：

```ts
export interface TaskInput {
  title: string
  priority?: Priority
  date: string
  source_module?: ModuleKey | null
  source_id?: number | null
}
```

顶部类型 import 换成：

```ts
import type { ModuleKey, Priority, Task } from '@shared/types'
```

`createTask` 换成：

```ts
export function createTask(db: DatabaseSync, input: TaskInput): Task {
  const info = db.prepare(`
    INSERT INTO tasks (title, priority, date, source_module, source_id) VALUES (?, ?, ?, ?, ?)
  `).run(
    input.title,
    input.priority ?? 'mid',
    input.date,
    input.source_module ?? null,
    input.source_id ?? null
  )
  return getTask(db, Number(info.lastInsertRowid))!
}
```

- [ ] **Step 4: 实现 `src/main/db/interop.ts`**

```ts
import type { DatabaseSync } from 'node:sqlite'
import type { Event, Occurrence, RepeatType } from '@shared/types'
import { createEvent, listOccurrences } from './events'
import { getTask } from './tasks'

export interface ConvertInput {
  startAt: string
  endAt: string
  location?: string | null
  note?: string | null
  remindMinutes?: number
  repeatType?: RepeatType
  repeatInterval?: number
  repeatUntil?: string | null
}

interface EventTaskRow {
  id: number
  source_id: number | null
  title: string
}

/**
 * 把 date 当天的日程发生项同步为待办行：
 * 新增缺失、标题跟随事件、保留 done、清理来源已不在当天的行。整体一个事务。
 */
export function syncEventTasks(db: DatabaseSync, date: string): void {
  const wanted = new Map<number, Occurrence>()
  for (const o of listOccurrences(db, date, date)) wanted.set(o.eventId, o)

  db.exec('BEGIN')
  try {
    const rows = db.prepare(
      "SELECT id, source_id, title FROM tasks WHERE date = ? AND source_module = 'event'"
    ).all(date) as unknown as EventTaskRow[]

    for (const r of rows) {
      if (r.source_id === null || !wanted.has(r.source_id)) {
        db.prepare('DELETE FROM tasks WHERE id = ?').run(r.id)
      }
    }

    const live = new Map<number, EventTaskRow>()
    for (const r of rows) if (r.source_id !== null && wanted.has(r.source_id)) live.set(r.source_id, r)

    for (const [eventId, o] of wanted) {
      const existing = live.get(eventId)
      if (!existing) {
        db.prepare(`
          INSERT INTO tasks (title, priority, date, source_module, source_id) VALUES (?, 'mid', ?, 'event', ?)
        `).run(o.title, date, eventId)
      } else if (existing.title !== o.title) {
        db.prepare("UPDATE tasks SET title = ?, updated_at = datetime('now','localtime') WHERE id = ?")
          .run(o.title, existing.id)
      }
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

/** 待办转日程：同一事务内创建事件并删除原待办 */
export function convertTaskToEvent(db: DatabaseSync, taskId: number, input: ConvertInput): Event {
  const task = getTask(db, taskId)
  if (!task) throw new Error(`task ${taskId} not found`)
  if (task.source_module === 'event') throw new Error('该待办已经来自日程，不能再次转换')

  db.exec('BEGIN')
  try {
    const ev = createEvent(db, {
      title: task.title,
      startAt: input.startAt,
      endAt: input.endAt,
      location: input.location ?? null,
      note: input.note ?? null,
      remindMinutes: input.remindMinutes ?? 15,
      repeatType: input.repeatType ?? 'none',
      repeatInterval: input.repeatInterval ?? 1,
      repeatUntil: input.repeatUntil ?? null
    })
    db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId)
    db.exec('COMMIT')
    return ev
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test -- tests/interop.test.ts`
Expected: PASS（11 个用例）；随后跑 `npm test` 确认 `tests/tasks.test.ts` 不回归

- [ ] **Step 6: Commit**

```bash
git add src/main/db/interop.ts src/main/db/tasks.ts tests/interop.test.ts
git commit -m "feat: 待办⇄日程互通（幂等同步 + 事务转换，TDD）"
```

---

### Task 6: settings 数据层 + IPC 契约扩展（events / interop / settings）

**Files:**
- Create: `src/main/db/settings.ts`
- Modify: `src/main/ipc.ts`（整文件）
- Modify: `src/preload/index.ts`（整文件）
- Modify: `src/renderer/src/lib/ipc.ts`（整文件）
- Test: `tests/settings.test.ts`

**Interfaces:**
- Consumes: `listEvents`、`listOccurrences`、`createEvent`、`updateEvent`、`deleteEvent`、`syncEventTasks`、`convertTaskToEvent`
- Produces:
  - `DEFAULT_SETTINGS = { 'timeline.rangeDays': 30, 'timeline.showDone': false, 'remind.enabled': true, 'remind.leadMinutes': 15 }`
  - `type SettingsKey = keyof typeof DEFAULT_SETTINGS`、`type Settings = { [K in SettingsKey]: (typeof DEFAULT_SETTINGS)[K] }`
  - `getAllSettings(db): Settings`、`setSetting(db, key: SettingsKey, value: Settings[SettingsKey]): Settings`
  - IPC 通道（9 个新增）：
    `events:listInRange`、`events:listOccurrences`、`events:create`、`events:update`、`events:delete`、`interop:syncDates`、`interop:convertTask`、`settings:getAll`、`settings:set`
  - `window.lifeos` 新增 `events`、`interop`、`settings` 三个命名空间

- [ ] **Step 1: 写失败测试**

`tests/settings.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { openDb } from '../src/main/db'
import { DEFAULT_SETTINGS, getAllSettings, setSetting } from '../src/main/db/settings'

let db: ReturnType<typeof openDb>
beforeEach(() => { db = openDb(':memory:') })

describe('settings', () => {
  it('空库返回全部默认值', () => {
    expect(getAllSettings(db)).toEqual(DEFAULT_SETTINGS)
  })

  it('写入后可读回，未设置的键仍是默认值', () => {
    setSetting(db, 'timeline.rangeDays', 90)
    const s = getAllSettings(db)
    expect(s['timeline.rangeDays']).toBe(90)
    expect(s['timeline.showDone']).toBe(false)
    expect(s['remind.leadMinutes']).toBe(15)
  })

  it('重复写同一个键是覆盖而不是追加', () => {
    setSetting(db, 'timeline.showDone', true)
    setSetting(db, 'timeline.showDone', false)
    expect(getAllSettings(db)['timeline.showDone']).toBe(false)
    expect((db.prepare('SELECT COUNT(*) c FROM settings').get() as { c: number }).c).toBe(1)
  })

  it('非法取值报错且不落库', () => {
    expect(() => setSetting(db, 'timeline.rangeDays', 45 as never)).toThrow('7 / 30 / 90')
    expect(() => setSetting(db, 'remind.leadMinutes', -1)).toThrow('提前提醒')
    expect((db.prepare('SELECT COUNT(*) c FROM settings').get() as { c: number }).c).toBe(0)
    expect(getAllSettings(db)['timeline.rangeDays']).toBe(30)
  })

  it('落库的是 JSON，能区分布尔与字符串', () => {
    setSetting(db, 'remind.enabled', false)
    const raw = db.prepare("SELECT value FROM settings WHERE key = 'remind.enabled'").get() as { value: string }
    expect(raw.value).toBe('false')
    expect(getAllSettings(db)['remind.enabled']).toBe(false)
  })

  it('坏数据回退到默认值而不抛错', () => {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('timeline.rangeDays', 'not-json')
    expect(getAllSettings(db)['timeline.rangeDays']).toBe(30)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/settings.test.ts`
Expected: FAIL —— `Failed to resolve import "../src/main/db/settings"`

- [ ] **Step 3: 实现 `src/main/db/settings.ts`**

```ts
import type { DatabaseSync } from 'node:sqlite'

export const DEFAULT_SETTINGS = {
  'timeline.rangeDays': 30,
  'timeline.showDone': false,
  'remind.enabled': true,
  'remind.leadMinutes': 15
} as const

export type SettingsKey = keyof typeof DEFAULT_SETTINGS
export type Settings = { [K in SettingsKey]: (typeof DEFAULT_SETTINGS)[K] }

const KEYS = Object.keys(DEFAULT_SETTINGS) as SettingsKey[]

function validate(key: SettingsKey, value: unknown): void {
  if (key === 'timeline.rangeDays' && ![7, 30, 90].includes(value as number)) {
    throw new Error('时间轴显示范围只能是 7 / 30 / 90 天')
  }
  if (key === 'timeline.showDone' && typeof value !== 'boolean') throw new Error('showDone 必须是布尔值')
  if (key === 'remind.enabled' && typeof value !== 'boolean') throw new Error('remind.enabled 必须是布尔值')
  if (key === 'remind.leadMinutes') {
    if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 1440) {
      throw new Error('提前提醒分钟数必须是 0–1440 的整数')
    }
  }
}

export function getAllSettings(db: DatabaseSync): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as unknown as { key: string; value: string }[]
  const out = { ...DEFAULT_SETTINGS } as Settings
  for (const r of rows) {
    if (!KEYS.includes(r.key as SettingsKey)) continue
    try {
      const parsed = JSON.parse(r.value) as Settings[SettingsKey]
      validate(r.key as SettingsKey, parsed)
      ;(out as Record<string, unknown>)[r.key] = parsed
    } catch {
      // 坏数据一律回退默认值，不让设置读取阻塞启动
    }
  }
  return out
}

export function setSetting<K extends SettingsKey>(db: DatabaseSync, key: K, value: Settings[K]): Settings {
  validate(key, value)
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, JSON.stringify(value))
  return getAllSettings(db)
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/settings.test.ts`
Expected: PASS（6 个用例）

- [ ] **Step 5: 扩展 `src/main/ipc.ts`**

```ts
import { ipcMain } from 'electron'
import type { DatabaseSync } from 'node:sqlite'
import * as tasks from './db/tasks'
import * as longTasks from './db/longTasks'
import * as events from './db/events'
import * as interop from './db/interop'
import { getAllSettings, setSetting, type SettingsKey } from './db/settings'

export function registerIpc(db: DatabaseSync): void {
  ipcMain.handle('tasks:list', (_e, date: string) => {
    interop.syncEventTasks(db, date)
    return tasks.listTasksByDate(db, date)
  })
  ipcMain.handle('tasks:create', (_e, input: tasks.TaskInput) => tasks.createTask(db, input))
  ipcMain.handle('tasks:update', (_e, id: number, patch: tasks.TaskPatch) => tasks.updateTask(db, id, patch))
  ipcMain.handle('tasks:delete', (_e, id: number) => tasks.deleteTask(db, id))

  ipcMain.handle('longTasks:listRange', (_e, from: string, to: string) => longTasks.listRange(db, from, to))
  ipcMain.handle('longTasks:create', (_e, input: longTasks.LongTaskInput) => longTasks.createLongTask(db, input))
  ipcMain.handle('longTasks:delete', (_e, id: number) => longTasks.deleteLongTask(db, id))

  ipcMain.handle('events:listInRange', (_e, from: string, to: string) => events.listEvents(db, from, to))
  ipcMain.handle('events:listOccurrences', (_e, from: string, to: string) => events.listOccurrences(db, from, to))
  ipcMain.handle('events:create', (_e, input: events.EventInput) => events.createEvent(db, input))
  ipcMain.handle('events:update', (_e, id: number, patch: events.EventPatch) => events.updateEvent(db, id, patch))
  ipcMain.handle('events:delete', (_e, id: number) => events.deleteEvent(db, id))

  ipcMain.handle('interop:syncDates', (_e, dates: string[]) => {
    for (const d of dates) interop.syncEventTasks(db, d)
  })
  ipcMain.handle('interop:convertTask', (_e, taskId: number, input: interop.ConvertInput) =>
    interop.convertTaskToEvent(db, taskId, input))

  ipcMain.handle('settings:getAll', () => getAllSettings(db))
  ipcMain.handle('settings:set', (_e, key: SettingsKey, value: unknown) => setSetting(db, key, value as never))
}
```

> `events.ts` 需要导出类型：把 `EventInput`、`EventPatch` 一起 re-export，即在 `src/main/db/events.ts` 末尾追加
> `export type { EventInput, EventPatch } from '@shared/types'`，这样 `events.EventInput` 可用。

- [ ] **Step 6: 扩展 `src/preload/index.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron'

const api = {
  tasks: {
    list: (date: string): Promise<unknown> => ipcRenderer.invoke('tasks:list', date),
    create: (input: unknown): Promise<unknown> => ipcRenderer.invoke('tasks:create', input),
    update: (id: number, patch: unknown): Promise<unknown> => ipcRenderer.invoke('tasks:update', id, patch),
    remove: (id: number): Promise<unknown> => ipcRenderer.invoke('tasks:delete', id)
  },
  longTasks: {
    listRange: (from: string, to: string): Promise<unknown> => ipcRenderer.invoke('longTasks:listRange', from, to),
    create: (input: unknown): Promise<unknown> => ipcRenderer.invoke('longTasks:create', input),
    remove: (id: number): Promise<unknown> => ipcRenderer.invoke('longTasks:delete', id)
  },
  events: {
    listInRange: (from: string, to: string): Promise<unknown> => ipcRenderer.invoke('events:listInRange', from, to),
    listOccurrences: (from: string, to: string): Promise<unknown> => ipcRenderer.invoke('events:listOccurrences', from, to),
    create: (input: unknown): Promise<unknown> => ipcRenderer.invoke('events:create', input),
    update: (id: number, patch: unknown): Promise<unknown> => ipcRenderer.invoke('events:update', id, patch),
    remove: (id: number): Promise<unknown> => ipcRenderer.invoke('events:delete', id)
  },
  interop: {
    syncDates: (dates: string[]): Promise<unknown> => ipcRenderer.invoke('interop:syncDates', dates),
    convertTask: (taskId: number, input: unknown): Promise<unknown> => ipcRenderer.invoke('interop:convertTask', taskId, input)
  },
  settings: {
    getAll: (): Promise<unknown> => ipcRenderer.invoke('settings:getAll'),
    set: (key: string, value: unknown): Promise<unknown> => ipcRenderer.invoke('settings:set', key, value)
  }
}

contextBridge.exposeInMainWorld('lifeos', api)
```

- [ ] **Step 7: 扩展 `src/renderer/src/lib/ipc.ts`（类型契约，渲染端唯一入口）**

```ts
import type {
  Event, EventInput, EventPatch, LongTask, Occurrence, Priority, Task
} from '@shared/types'
import type { Settings, SettingsKey } from '@shared/settings'

export interface TaskPatch { title?: string; done?: boolean; priority?: Priority }
export interface TaskInput { title: string; priority?: Priority; date: string }
export interface LongTaskInput { title: string; startDate: string; endDate: string; color?: string }
export interface ConvertTaskInput {
  startAt: string
  endAt: string
  location?: string | null
  note?: string | null
  remindMinutes?: number
}

interface LifeosApi {
  tasks: {
    list(date: string): Promise<Task[]>
    create(input: TaskInput): Promise<Task>
    update(id: number, patch: TaskPatch): Promise<Task>
    remove(id: number): Promise<void>
  }
  longTasks: {
    listRange(from: string, to: string): Promise<LongTask[]>
    create(input: LongTaskInput): Promise<LongTask>
    remove(id: number): Promise<void>
  }
  events: {
    listInRange(from: string, to: string): Promise<Event[]>
    listOccurrences(from: string, to: string): Promise<Occurrence[]>
    create(input: EventInput): Promise<Event>
    update(id: number, patch: EventPatch): Promise<Event>
    remove(id: number): Promise<void>
  }
  interop: {
    syncDates(dates: string[]): Promise<void>
    convertTask(taskId: number, input: ConvertTaskInput): Promise<Event>
  }
  settings: {
    getAll(): Promise<Settings>
    set<K extends SettingsKey>(key: K, value: Settings[K]): Promise<Settings>
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface Window { lifeos: LifeosApi }
}

export const api: LifeosApi = window.lifeos
```

> 为了让主进程与渲染进程共用设置类型定义，把 `DEFAULT_SETTINGS / SettingsKey / Settings` 从 `src/main/db/settings.ts` 抽到 `src/shared/settings.ts`，`src/main/db/settings.ts` 改为 `import { DEFAULT_SETTINGS, type Settings, type SettingsKey } from '@shared/settings'` 并 re-export（`export * from '@shared/settings'`），`tests/settings.test.ts` 的导入路径保持不变。

`src/shared/settings.ts`：

```ts
export const DEFAULT_SETTINGS = {
  'timeline.rangeDays': 30,
  'timeline.showDone': false,
  'remind.enabled': true,
  'remind.leadMinutes': 15
} as const

export type SettingsKey = keyof typeof DEFAULT_SETTINGS
export type Settings = { [K in SettingsKey]: (typeof DEFAULT_SETTINGS)[K] }
```

- [ ] **Step 8: 运行全量测试 + 类型检查**

Run: `npm test`
Expected: PASS（全部用例）

Run: `npm run typecheck`
Expected: 无输出（无类型错误）

- [ ] **Step 9: 手动验收 IPC 连通**

Run: `npm run dev`
Expected: 应用正常启动，「今天」页待办列表可用（`tasks:list` 现在会先跑一次 `syncEventTasks`，空库下行为不变）

- [ ] **Step 10: Commit**

```bash
git add src/main/db/settings.ts src/shared/settings.ts src/main/ipc.ts src/preload/index.ts src/renderer/src/lib/ipc.ts tests/settings.test.ts
git commit -m "feat: settings 数据层 + IPC 契约扩展（events/interop/settings）"
```

---

### Task 7: 日程页框架 + 事件编辑器

**Files:**
- Create: `src/renderer/src/stores/eventsStore.ts`
- Create: `src/renderer/src/components/schedule/SchedulePage.tsx`
- Create: `src/renderer/src/components/schedule/EventDialog.tsx`
- Modify: `src/renderer/src/App.tsx:14-16`
- Modify: `src/renderer/src/components/layout/Sidebar.tsx:9`

**Interfaces:**
- Consumes: `api.events.*`、`api.interop.syncDates`、`@shared/dates`、`@shared/types`
- Produces:
  - `useEventsStore`：`{ view: 'week' | 'month'; anchor: string; events: Event[]; occurrences: Occurrence[]; loading: boolean; setView(v); setAnchor(d); reload(): Promise<void>; create(input): Promise<void>; update(id, patch): Promise<void>; remove(id): Promise<void> }`
  - `SchedulePage`、`EventDialog` 组件

- [ ] **Step 1: 实现 `src/renderer/src/stores/eventsStore.ts`**

```ts
import { create } from 'zustand'
import type { Event, EventInput, EventPatch, Occurrence } from '@shared/types'
import { api } from '../lib/ipc'
import { addDays, datePart, todayStr } from '@shared/dates'
import { monthMatrix, weekStart } from '@shared/layout'

export type ViewMode = 'week' | 'month'

interface EventsState {
  view: ViewMode
  anchor: string
  events: Event[]
  occurrences: Occurrence[]
  loading: boolean
  setView: (v: ViewMode) => void
  setAnchor: (d: string) => void
  reload: () => Promise<void>
  create: (input: EventInput) => Promise<void>
  update: (id: number, patch: EventPatch) => Promise<void>
  remove: (id: number) => Promise<void>
}

function visibleRange(view: ViewMode, anchor: string): { from: string; to: string } {
  if (view === 'week') {
    const from = weekStart(anchor)
    return { from, to: addDays(from, 6) }
  }
  const grid = monthMatrix(anchor)
  return { from: grid[0], to: grid[grid.length - 1] }
}

export const useEventsStore = create<EventsState>((set, get) => ({
  view: 'week',
  anchor: todayStr(),
  events: [],
  occurrences: [],
  loading: false,
  setView: (view) => { set({ view }); void get().reload() },
  setAnchor: (anchor) => { set({ anchor }); void get().reload() },
  reload: async () => {
    const { view, anchor } = get()
    const { from, to } = visibleRange(view, anchor)
    set({ loading: true })
    const [events, occurrences] = await Promise.all([
      api.events.listInRange(from, to),
      api.events.listOccurrences(from, to)
    ])
    set({ events, occurrences, loading: false })
  },
  create: async (input) => {
    const ev = await api.events.create(input)
    await api.interop.syncDates([datePart(ev.start_at)])
    await get().reload()
  },
  update: async (id, patch) => {
    const before = get().events.find((e) => e.id === id)
    const after = await api.events.update(id, patch)
    const dates = new Set<string>()
    if (before) dates.add(datePart(before.start_at))
    dates.add(datePart(after.start_at))
    await api.interop.syncDates([...dates])
    await get().reload()
  },
  remove: async (id) => {
    const before = get().events.find((e) => e.id === id)
    await api.events.remove(id)
    if (before) await api.interop.syncDates([datePart(before.start_at)])
    await get().reload()
  }
}))
```

- [ ] **Step 2: 实现 `src/renderer/src/components/schedule/EventDialog.tsx`**

```tsx
import { useEffect, useState } from 'react'
import type { Event, EventInput, RepeatType } from '@shared/types'
import { datePart, timePart } from '@shared/dates'

interface Props {
  open: boolean
  initial: Event | null
  defaultStart?: string
  onClose: () => void
  onSubmit: (input: EventInput) => Promise<void>
  onDelete?: (id: number) => Promise<void>
}

const REPEAT_LABEL: Record<RepeatType, string> = { none: '不重复', daily: '每天', weekly: '每周', monthly: '每月' }

const inputCls = 'w-full bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 text-sm outline-none focus:border-[var(--accent)]'
const labelCls = 'text-xs text-[var(--muted)] mb-1'

export function EventDialog({ open, initial, defaultStart, onClose, onSubmit, onDelete }: Props): JSX.Element | null {
  const [title, setTitle] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [location, setLocation] = useState('')
  const [note, setNote] = useState('')
  const [repeatType, setRepeatType] = useState<RepeatType>('none')
  const [repeatInterval, setRepeatInterval] = useState(1)
  const [repeatUntil, setRepeatUntil] = useState('')
  const [remindMinutes, setRemindMinutes] = useState(15)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    if (initial) {
      setTitle(initial.title)
      setStart(`${datePart(initial.start_at)}T${timePart(initial.start_at)}`)
      setEnd(`${datePart(initial.end_at)}T${timePart(initial.end_at)}`)
      setAllDay(initial.all_day)
      setLocation(initial.location ?? '')
      setNote(initial.note ?? '')
      setRepeatType(initial.repeat_type)
      setRepeatInterval(initial.repeat_interval)
      setRepeatUntil(initial.repeat_until ?? '')
      setRemindMinutes(initial.remind_minutes)
    } else {
      const s = defaultStart ?? `${datePart(new Date().toISOString())}`
      setTitle('')
      setStart(s.includes('T') ? s : `${s}T09:00`)
      setEnd(s.includes('T') ? s.replace(/T(\d{2}):(\d{2})/, (_m, h, mi) => `T${String(Number(h) + 1).padStart(2, '0')}:${mi}`) : `${s}T10:00`)
      setAllDay(false)
      setLocation('')
      setNote('')
      setRepeatType('none')
      setRepeatInterval(1)
      setRepeatUntil('')
      setRemindMinutes(15)
    }
  }, [open, initial, defaultStart])

  if (!open) return null

  const submit = async (): Promise<void> => {
    const startAt = allDay ? `${start.slice(0, 10)} 00:00` : start.replace('T', ' ')
    const endAt = allDay ? `${end.slice(0, 10)} 00:00` : end.replace('T', ' ')
    try {
      await onSubmit({
        title, startAt, endAt, allDay, location: location || null, note: note || null,
        repeatType, repeatInterval, repeatUntil: repeatUntil || null, remindMinutes
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4 w-[420px]" onClick={(e) => e.stopPropagation()}>
        <div className="font-bold text-sm mb-3">{initial ? '编辑事件' : '新建事件'}</div>

        <div className="mb-2">
          <div className={labelCls}>标题</div>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="事件标题" />
        </div>

        <label className="flex items-center gap-2 text-xs text-[var(--muted)] mb-2">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="accent-[#7c8cff]" />
          全天事件
        </label>

        <div className="flex gap-2 mb-2">
          <div className="flex-1">
            <div className={labelCls}>开始</div>
            <input type={allDay ? 'date' : 'datetime-local'} value={allDay ? start.slice(0, 10) : start}
              onChange={(e) => setStart(e.target.value)} className={inputCls} />
          </div>
          <div className="flex-1">
            <div className={labelCls}>结束</div>
            <input type={allDay ? 'date' : 'datetime-local'} value={allDay ? end.slice(0, 10) : end}
              onChange={(e) => setEnd(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div className="mb-2">
          <div className={labelCls}>地点</div>
          <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputCls} />
        </div>

        <div className="mb-2">
          <div className={labelCls}>备注</div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inputCls} />
        </div>

        <div className="flex gap-2 mb-2">
          <div className="flex-1">
            <div className={labelCls}>重复</div>
            <select value={repeatType} onChange={(e) => setRepeatType(e.target.value as RepeatType)} className={inputCls}>
              {(Object.keys(REPEAT_LABEL) as RepeatType[]).map((k) => <option key={k} value={k}>{REPEAT_LABEL[k]}</option>)}
            </select>
          </div>
          <div className="w-20">
            <div className={labelCls}>间隔</div>
            <input type="number" min={1} value={repeatInterval} disabled={repeatType === 'none'}
              onChange={(e) => setRepeatInterval(Number(e.target.value))} className={inputCls} />
          </div>
          <div className="w-28">
            <div className={labelCls}>提前提醒</div>
            <input type="number" min={0} value={remindMinutes} onChange={(e) => setRemindMinutes(Number(e.target.value))} className={inputCls} />
          </div>
        </div>

        {repeatType !== 'none' && (
          <div className="mb-2">
            <div className={labelCls}>重复截止（可空）</div>
            <input type="date" value={repeatUntil} onChange={(e) => setRepeatUntil(e.target.value)} className={inputCls} />
          </div>
        )}

        {error && <div className="text-xs text-red-400 mb-2">{error}</div>}

        <div className="flex gap-2 justify-end mt-3">
          {initial && onDelete && (
            <button onClick={() => { void onDelete(initial.id).then(onClose) }}
              className="text-xs px-3 py-1.5 rounded bg-red-500/20 text-red-300 mr-auto">删除</button>
          )}
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded bg-[var(--border)]">取消</button>
          <button onClick={() => void submit()} className="text-xs px-3 py-1.5 rounded bg-[var(--accent)] text-white">保存</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 实现 `src/renderer/src/components/schedule/SchedulePage.tsx`**

```tsx
import { useEffect, useState } from 'react'
import type { Event } from '@shared/types'
import { useEventsStore } from '../../stores/eventsStore'
import { EventDialog } from './EventDialog'
import { WeekView } from './WeekView'
import { MonthView } from './MonthView'
import { addDays, addMonthsClamped, formatCn, todayStr, weekStart } from '@shared/dates'

export function SchedulePage(): JSX.Element {
  const { view, anchor, events, occurrences, setView, setAnchor, reload, create, update, remove } = useEventsStore()
  const [editing, setEditing] = useState<Event | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [defaultStart, setDefaultStart] = useState<string | undefined>(undefined)

  useEffect(() => { void reload() }, [reload])

  const step = (dir: -1 | 1): void => {
    if (view === 'week') setAnchor(addDays(weekStart(anchor), dir * 7))
    else setAnchor(addMonthsClamped(`${anchor.slice(0, 7)}-01`, dir))
  }

  const openCreate = (start?: string): void => {
    setEditing(null)
    setDefaultStart(start)
    setDialogOpen(true)
  }

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
        <div className="flex rounded overflow-hidden border border-[var(--border)]">
          <button onClick={() => setView('week')} className={`text-xs px-3 py-1 ${view === 'week' ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)]'}`}>周</button>
          <button onClick={() => setView('month')} className={`text-xs px-3 py-1 ${view === 'month' ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)]'}`}>月</button>
        </div>
        <button onClick={() => step(-1)} className="text-xs px-2 py-1 rounded bg-[var(--border)]">‹</button>
        <button onClick={() => setAnchor(todayStr())} className="text-xs px-2 py-1 rounded bg-[var(--border)]">今天</button>
        <button onClick={() => step(1)} className="text-xs px-2 py-1 rounded bg-[var(--border)]">›</button>
        <span className="text-sm font-bold ml-2">{view === 'week' ? `${formatCn(weekStart(anchor))} 那周` : `${anchor.slice(0, 7)}`}</span>
        <button onClick={() => openCreate()} className="ml-auto text-xs px-3 py-1.5 rounded bg-[var(--accent)] text-white">＋新建事件</button>
      </header>

      <div className="flex-1 min-h-0 overflow-auto">
        {view === 'week'
          ? <WeekView occurrences={occurrences} anchor={anchor} onCreateAt={openCreate} onEdit={(ev) => { setEditing(ev); setDialogOpen(true) }} events={events} />
          : <MonthView occurrences={occurrences} anchor={anchor} onPickDay={(d) => { setAnchor(d); setView('week') }} onOpenEvent={(ev) => { setEditing(ev); setDialogOpen(true) }} events={events} />}
      </div>

      <EventDialog
        open={dialogOpen}
        initial={editing}
        defaultStart={defaultStart}
        onClose={() => setDialogOpen(false)}
        onSubmit={async (input) => { editing ? await update(editing.id, input) : await create(input) }}
        onDelete={async (id) => { await remove(id) }}
      />
    </div>
  )
}
```

> `WeekView` 与 `MonthView` 在 Task 8 / Task 9 实现。本任务为了让页面可编译，先各放一个最小占位实现，Task 8 / Task 9 再整体替换：
>
> `src/renderer/src/components/schedule/WeekView.tsx` 占位：
> ```tsx
> import type { Event, Occurrence } from '@shared/types'
> export function WeekView(_props: { occurrences: Occurrence[]; anchor: string; events: Event[]; onCreateAt: (s?: string) => void; onEdit: (e: Event) => void }): JSX.Element {
>   return <div className="p-4 text-xs text-[var(--muted)]">周视图将在 Task 8 实现</div>
> }
> ```
> `src/renderer/src/components/schedule/MonthView.tsx` 占位：
> ```tsx
> import type { Event, Occurrence } from '@shared/types'
> export function MonthView(_props: { occurrences: Occurrence[]; anchor: string; events: Event[]; onPickDay: (d: string) => void; onOpenEvent: (e: Event) => void }): JSX.Element {
>   return <div className="p-4 text-xs text-[var(--muted)]">月视图将在 Task 9 实现</div>
> }
> ```

- [ ] **Step 4: 接线导航**

`src/renderer/src/App.tsx`：

```tsx
import { useState } from 'react'
import { AppShell } from './components/layout/AppShell'
import { Sidebar, type PageKey } from './components/layout/Sidebar'
import { TimelineBar } from './components/layout/TimelineBar'
import { TodayPage } from './components/today/TodayPage'
import { SchedulePage } from './components/schedule/SchedulePage'

export default function App(): JSX.Element {
  const [page, setPage] = useState<PageKey>('today')
  return (
    <AppShell
      sidebar={<Sidebar active={page} onNavigate={setPage} />}
      timeline={<TimelineBar />}
    >
      {page === 'today'
        ? <TodayPage />
        : page === 'schedule'
          ? <SchedulePage />
          : <div className="p-4 text-[var(--muted)]">该模块将在后续里程碑开放</div>}
    </AppShell>
  )
}
```

`src/renderer/src/components/layout/Sidebar.tsx` 第 9 行去掉 `disabled`：

```ts
  { label: '', items: [{ key: 'schedule', icon: '📅', label: '日程' }] },
```

- [ ] **Step 5: 手动验收（PRD 8.4.2）**

Run: `npm run dev`
Expected:
1. 侧边栏「日程」可点击，进入日程页，顶部有周/月切换、‹ / 今天 / ›、＋新建事件
2. 新建事件（标题＋开始＋结束＋地点＋备注＋重复规则＋提前提醒）后，周视图/月视图区域出现该事件（此时仍是占位区域，但切换回「今天」页能看到该事件已汇入今日待办）
3. 点侧边栏「今天」→ 待办列表出现刚刚建的事件（带「日程」来源标记）
4. 编辑事件标题后回到「今天」页，待办标题同步变化；删除事件后待办行消失

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/stores/eventsStore.ts src/renderer/src/components/schedule src/renderer/src/App.tsx src/renderer/src/components/layout/Sidebar.tsx
git commit -m "feat: 日程页框架 + 事件编辑器（重复规则/提醒分钟/增删改）"
```

---

### Task 8: 布局纯函数 + 周视图（TDD + 拖入转日程）

**Files:**
- Create: `src/shared/layout.ts`
- Create: `src/renderer/src/components/schedule/WeekView.tsx`（替换占位）
- Test: `tests/layout.test.ts`

**Interfaces:**
- Consumes: `Occurrence`、`@shared/dates`
- Produces:
  - `weekStart(dateStr: string): string`（周一为一周之始）
  - `weekDays(anchor: string): string[]`（7 个日期）
  - `interface WeekBlock { occurrence: Occurrence; dayIndex: number; topPct: number; heightPct: number; lane: number; laneCount: number }`
  - `layoutWeek(occurrences: Occurrence[], anchor: string, minHeightPct?: number): { days: string[]; allDay: Occurrence[]; blocks: WeekBlock[] }`
  - `monthMatrix(anchor: string): string[]`（42 格）
  - `layoutMonth(occurrences: Occurrence[], anchor: string, maxPerDay?: number): MonthCell[]`
  - `interface MonthCell { date: string; inMonth: boolean; items: Occurrence[]; extra: number }`

- [ ] **Step 1: 写失败测试**

`tests/layout.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { layoutMonth, layoutWeek, monthMatrix, weekDays, weekStart } from '../src/shared/layout'
import type { Occurrence } from '../src/shared/types'

const occ = (date: string, start: string, end: string, allDay = false, id = 1): Occurrence => ({
  eventId: id, title: `E${id}`, date, startAt: `${date} ${start}`, endAt: `${date} ${end}`,
  allDay, location: null, note: null, remindMinutes: 15
})

describe('weekStart / weekDays', () => {
  it('周三的周一是两天前', () => {
    expect(weekStart('2026-09-30')).toBe('2026-09-28')
  })
  it('周一自己就是周一', () => {
    expect(weekStart('2026-09-28')).toBe('2026-09-28')
  })
  it('周日归入本周而不是下周', () => {
    expect(weekStart('2026-10-04')).toBe('2026-09-28')
  })
  it('weekDays 返回连续 7 天并跨月正确', () => {
    expect(weekDays('2026-09-30')).toEqual([
      '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'
    ])
  })
})

describe('layoutWeek', () => {
  it('按时间换算纵向位置与高度', () => {
    const { blocks } = layoutWeek([occ('2026-09-30', '09:00', '12:00')], '2026-09-30')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].dayIndex).toBe(2)
    expect(blocks[0].topPct).toBeCloseTo((9 * 60 / 1440) * 100)
    expect(blocks[0].heightPct).toBeCloseTo((3 * 60 / 1440) * 100)
  })

  it('区间外的事件不参与布局', () => {
    expect(layoutWeek([occ('2026-10-20', '09:00', '10:00')], '2026-09-30').blocks).toHaveLength(0)
  })

  it('同一天重叠事件分道，不重叠共道', () => {
    const { blocks } = layoutWeek([
      occ('2026-09-30', '09:00', '11:00', false, 1),
      occ('2026-09-30', '10:00', '12:00', false, 2),
      occ('2026-09-30', '13:00', '14:00', false, 3)
    ], '2026-09-30')
    const byId = new Map(blocks.map((b) => [b.occurrence.eventId, b]))
    expect(byId.get(1)!.lane).toBe(0)
    expect(byId.get(2)!.lane).toBe(1)
    expect(byId.get(3)!.lane).toBe(0)
    expect(byId.get(1)!.laneCount).toBe(2)
  })

  it('全天事件不进时间网格，单独返回', () => {
    const r = layoutWeek([occ('2026-09-30', '00:00', '00:00', true)], '2026-09-30')
    expect(r.blocks).toHaveLength(0)
    expect(r.allDay.map((o) => o.date)).toEqual(['2026-09-30'])
  })

  it('极短事件有最小高度', () => {
    const { blocks } = layoutWeek([occ('2026-09-30', '09:00', '09:05')], '2026-09-30')
    expect(blocks[0].heightPct).toBeGreaterThanOrEqual(2)
  })
})

describe('monthMatrix / layoutMonth', () => {
  it('固定 42 格，从所在周的周一开始，首尾跨月', () => {
    const grid = monthMatrix('2026-09-15')
    expect(grid).toHaveLength(42)
    expect(grid[0]).toBe('2026-08-31')
    expect(grid[41]).toBe('2026-10-11')
  })

  it('每天最多 3 条，其余进 extra', () => {
    const list = [1, 2, 3, 4, 5].map((i) => occ('2026-09-30', `0${i}:00`, `0${i}:30`, false, i))
    const cell = layoutMonth(list, '2026-09-15').find((c) => c.date === '2026-09-30')!
    expect(cell.items).toHaveLength(3)
    expect(cell.extra).toBe(2)
    expect(cell.inMonth).toBe(true)
  })

  it('非本月格子标 inMonth=false', () => {
    const cell = layoutMonth([], '2026-09-15').find((c) => c.date === '2026-08-31')!
    expect(cell.inMonth).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/layout.test.ts`
Expected: FAIL —— `Failed to resolve import "../src/shared/layout"`

- [ ] **Step 3: 实现 `src/shared/layout.ts`**

```ts
import type { Occurrence } from './types'
import { addDays, pad2, timeToMinutes } from './dates'

/** 周一为一周之始 */
export function weekStart(dateStr: string): string {
  const dow = new Date(dateStr + 'T00:00:00').getDay() // 0 = 周日
  return addDays(dateStr, -(dow === 0 ? 6 : dow - 1))
}

export function weekDays(anchor: string): string[] {
  const from = weekStart(anchor)
  return Array.from({ length: 7 }, (_, i) => addDays(from, i))
}

export interface WeekBlock {
  occurrence: Occurrence
  dayIndex: number
  topPct: number
  heightPct: number
  lane: number
  laneCount: number
}

export interface WeekLayout {
  days: string[]
  allDay: Occurrence[]
  blocks: WeekBlock[]
}

export function layoutWeek(occurrences: Occurrence[], anchor: string, minHeightPct = 2): WeekLayout {
  const days = weekDays(anchor)
  const index = new Map(days.map((d, i) => [d, i]))

  const inWeek = occurrences.filter((o) => index.has(o.date))
  const allDay = inWeek.filter((o) => o.allDay)
  const timed = inWeek.filter((o) => !o.allDay)

  const byDay = new Map<number, Occurrence[]>()
  for (const o of timed) {
    const i = index.get(o.date)!
    const list = byDay.get(i) ?? []
    list.push(o)
    byDay.set(i, list)
  }

  const blocks: WeekBlock[] = []
  for (const [dayIndex, list] of byDay) {
    const sorted = [...list].sort((a, b) => a.startAt.localeCompare(b.startAt))
    const laneEnds: number[] = []
    const placed = sorted.map((o) => {
      const start = timeToMinutes(o.startAt.slice(11))
      let end = timeToMinutes(o.endAt.slice(11))
      if (end <= start) end = start + 30
      let lane = laneEnds.findIndex((e) => e <= start)
      if (lane === -1) {
        lane = laneEnds.length
        laneEnds.push(0)
      }
      laneEnds[lane] = end
      return { o, start, end, lane }
    })
    const laneCount = laneEnds.length
    for (const p of placed) {
      blocks.push({
        occurrence: p.o,
        dayIndex,
        topPct: (p.start / 1440) * 100,
        heightPct: Math.max(((p.end - p.start) / 1440) * 100, minHeightPct),
        lane: p.lane,
        laneCount
      })
    }
  }

  return { days, allDay, blocks }
}

/** 固定 42 格（6 周 × 7 天），首格为当月 1 号所在周的周一 */
export function monthMatrix(anchor: string): string[] {
  const first = `${anchor.slice(0, 7)}-01`
  const start = weekStart(first)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

export interface MonthCell {
  date: string
  inMonth: boolean
  items: Occurrence[]
  extra: number
}

export function layoutMonth(occurrences: Occurrence[], anchor: string, maxPerDay = 3): MonthCell[] {
  const month = anchor.slice(0, 7)
  const byDate = new Map<string, Occurrence[]>()
  for (const o of occurrences) {
    const list = byDate.get(o.date) ?? []
    list.push(o)
    byDate.set(o.date, list)
  }
  return monthMatrix(anchor).map((date) => {
    const all = (byDate.get(date) ?? []).sort((a, b) => a.startAt.localeCompare(b.startAt))
    return {
      date,
      inMonth: date.slice(0, 7) === month,
      items: all.slice(0, maxPerDay),
      extra: Math.max(0, all.length - maxPerDay)
    }
  })
}
```

> `pad2` 在本文件未直接使用时可从 import 中删除，避免无用导入。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/layout.test.ts`
Expected: PASS（11 个用例）

- [ ] **Step 5: 实现周视图（替换占位文件）**

`src/renderer/src/components/schedule/WeekView.tsx`：

```tsx
import { useMemo, useState } from 'react'
import type { Event, Occurrence } from '@shared/types'
import { layoutWeek, weekDays } from '@shared/layout'
import { formatCn, pad2, todayStr } from '@shared/dates'

const HOUR_HEIGHT = 44
const WEEK_LABEL = ['一', '二', '三', '四', '五', '六', '日']

interface Props {
  occurrences: Occurrence[]
  anchor: string
  events: Event[]
  onCreateAt: (start?: string) => void
  onEdit: (ev: Event) => void
}

export function WeekView({ occurrences, anchor, events, onCreateAt, onEdit }: Props): JSX.Element {
  const { days, allDay, blocks } = useMemo(() => layoutWeek(occurrences, anchor), [occurrences, anchor])
  const today = todayStr()
  const [dropDay, setDropDay] = useState<string | null>(null)

  const openEvent = (eventId: number): void => {
    const ev = events.find((e) => e.id === eventId)
    if (ev) onEdit(ev)
  }

  // 拖入格子：把待办落到该格对应的时间点
  const onDrop = (date: string) => (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setDropDay(null)
    const taskId = Number(e.dataTransfer.getData('text/lifeos-task'))
    if (!taskId) return
    const rect = e.currentTarget.getBoundingClientRect()
    const hour = Math.max(0, Math.min(23, Math.floor((e.clientY - rect.top) / HOUR_HEIGHT)))
    window.dispatchEvent(new CustomEvent('lifeos:drop-task', {
      detail: { taskId, startAt: `${date} ${pad2(hour)}:00`, endAt: `${date} ${pad2(hour)}:59` }
    }))
  }

  return (
    <div className="p-4">
      {/* 全天通栏 */}
      <div className="flex mb-2">
        <div className="w-12 shrink-0" />
        {days.map((d) => (
          <div key={d} className="flex-1 min-w-0 border-l border-[var(--border)] px-1">
            {allDay.filter((o) => o.date === d).map((o) => (
              <div key={o.eventId} onClick={() => openEvent(o.eventId)}
                className="text-[10px] truncate rounded px-1 py-0.5 mb-0.5 cursor-pointer text-white"
                style={{ background: '#7c8cff' }} title={o.title}>{o.title}</div>
            ))}
          </div>
        ))}
      </div>

      {/* 日期表头 */}
      <div className="flex border-b border-[var(--border)] pb-1">
        <div className="w-12 shrink-0" />
        {days.map((d, i) => (
          <div key={d} className={`flex-1 text-center text-xs ${d === today ? 'text-[var(--accent)] font-bold' : 'text-[var(--muted)]'}`}>
            周{WEEK_LABEL[i]} {formatCn(d)}
          </div>
        ))}
      </div>

      {/* 时间网格 */}
      <div className="flex relative" style={{ height: HOUR_HEIGHT * 24 }}>
        <div className="w-12 shrink-0 relative">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="absolute right-1 text-[9px] text-[var(--muted)] -translate-y-1/2"
              style={{ top: h * HOUR_HEIGHT }}>{h === 0 ? '' : `${pad2(h)}:00`}</div>
          ))}
        </div>

        {days.map((d, dayIndex) => (
          <div
            key={d}
            onDragOver={(e) => { e.preventDefault(); setDropDay(d) }}
            onDragLeave={() => setDropDay((cur) => (cur === d ? null : cur))}
            onDrop={onDrop(d)}
            onDoubleClick={() => onCreateAt(`${d}T09:00`)}
            className={`flex-1 min-w-0 relative border-l border-[var(--border)] ${d === today ? 'bg-[var(--accent)]/5 ring-1 ring-inset ring-[var(--accent)]' : ''} ${dropDay === d ? 'bg-[var(--accent)]/10' : ''}`}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="absolute left-0 right-0 border-t border-[var(--border)]/40" style={{ top: h * HOUR_HEIGHT }} />
            ))}
            {blocks.filter((b) => b.dayIndex === dayIndex).map((b) => {
              const widthPct = 100 / b.laneCount
              return (
                <div
                  key={`${b.occurrence.eventId}-${b.occurrence.date}`}
                  onClick={() => openEvent(b.occurrence.eventId)}
                  className="absolute rounded px-1 text-[10px] text-white overflow-hidden cursor-pointer hover:brightness-110"
                  style={{
                    top: `${b.topPct}%`,
                    height: `${b.heightPct}%`,
                    left: `${b.lane * widthPct}%`,
                    width: `calc(${widthPct}% - 2px)`,
                    background: '#7c8cff'
                  }}
                  title={`${b.occurrence.title} ${b.occurrence.startAt.slice(11)}-${b.occurrence.endAt.slice(11)}`}
                >
                  {b.occurrence.title}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: 手动验收（PRD 8.4.1 / 8.3.3）**

Run: `npm run dev`
Expected:
1. 周视图显示七列日格与左侧 0–23 时间刻度，今天列有强调色描边
2. 事件按开始时间落在正确高度与列，重叠事件并排
3. 全天事件显示为通栏色条
4. 双击空白格子 → 打开新建事件弹窗且时间已预填
5. 点事件色块 → 打开编辑弹窗

- [ ] **Step 7: Commit**

```bash
git add src/shared/layout.ts src/renderer/src/components/schedule/WeekView.tsx tests/layout.test.ts
git commit -m "feat: 周/月网格布局纯函数（TDD）+ 周视图渲染"
```

---

### Task 9: 月视图 + 「+N」折叠 + 跳转周视图

**Files:**
- Create: `src/renderer/src/components/schedule/MonthView.tsx`（替换占位）

**Interfaces:**
- Consumes: `layoutMonth`、`MonthCell`、`formatCn`
- Produces: `MonthView` 组件（props 见 Task 7 占位签名）

- [ ] **Step 1: 实现月视图（替换占位文件）**

`src/renderer/src/components/schedule/MonthView.tsx`：

```tsx
import { useMemo, useState } from 'react'
import type { Event, Occurrence } from '@shared/types'
import { layoutMonth } from '@shared/layout'
import { formatCn, todayStr } from '@shared/dates'

const WEEK_LABEL = ['一', '二', '三', '四', '五', '六', '日']

interface Props {
  occurrences: Occurrence[]
  anchor: string
  events: Event[]
  onPickDay: (date: string) => void
  onOpenEvent: (ev: Event) => void
}

export function MonthView({ occurrences, anchor, events, onPickDay, onOpenEvent }: Props): JSX.Element {
  const cells = useMemo(() => layoutMonth(occurrences, anchor), [occurrences, anchor])
  const today = todayStr()
  const [expanded, setExpanded] = useState<string | null>(null)

  const openEvent = (eventId: number): void => {
    const ev = events.find((e) => e.id === eventId)
    if (ev) onOpenEvent(ev)
  }

  return (
    <div className="p-4">
      <div className="grid grid-cols-7 mb-1">
        {WEEK_LABEL.map((w) => (
          <div key={w} className="text-center text-xs text-[var(--muted)]">周{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 border-l border-t border-[var(--border)]">
        {cells.map((c) => (
          <div
            key={c.date}
            onClick={() => onPickDay(c.date)}
            className={`h-[92px] border-r border-b border-[var(--border)] p-1 overflow-hidden cursor-pointer hover:bg-[var(--border)]/30 ${
              c.inMonth ? '' : 'opacity-40'
            } ${c.date === today ? 'ring-1 ring-inset ring-[var(--accent)]' : ''}`}
          >
            <div className={`text-[10px] mb-0.5 ${c.date === today ? 'text-[var(--accent)] font-bold' : 'text-[var(--muted)]'}`}>
              {formatCn(c.date)}
            </div>
            {c.items.map((o) => (
              <div
                key={`${o.eventId}-${o.date}`}
                onClick={(e) => { e.stopPropagation(); openEvent(o.eventId) }}
                className="text-[9px] truncate rounded px-1 mb-0.5 text-white"
                style={{ background: '#7c8cff' }}
                title={o.title}
              >{o.title}</div>
            ))}
            {c.extra > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); setExpanded(c.date) }}
                className="text-[9px] text-[var(--accent)]"
              >+{c.extra}</button>
            )}
          </div>
        ))}
      </div>

      {expanded && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setExpanded(null)}>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4 w-72" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-bold mb-2">{expanded} 全部事件</div>
            {occurrences.filter((o) => o.date === expanded)
              .sort((a, b) => a.startAt.localeCompare(b.startAt))
              .map((o) => (
                <div key={`${o.eventId}-${o.date}`} onClick={() => { setExpanded(null); openEvent(o.eventId) }}
                  className="text-xs py-1 cursor-pointer hover:text-[var(--accent)]">
                  <span className="text-[var(--muted)] mr-1">{o.allDay ? '全天' : o.startAt.slice(11)}</span>{o.title}
                </div>
              ))}
            <button onClick={() => setExpanded(null)} className="mt-2 text-xs px-2 py-1 rounded bg-[var(--border)]">关闭</button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 手动验收（PRD 8.4.1）**

Run: `npm run dev`
Expected:
1. 月视图显示 6×7 网格，非本月日期变暗，今天有强调色描边
2. 某天超过 3 条事件时显示前 3 条 + 「+N」，点「+N」弹出当天全部事件列表
3. 点某天任意空白处 → 跳到该日所在周视图
4. 点事件条 → 打开编辑弹窗

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/schedule/MonthView.tsx
git commit -m "feat: 月视图 + 每天 3 条折叠与「+N」+ 跳转周视图"
```

---

### Task 10: 今天页互通 UI（日程汇入只读行 + 转日程入口 + 拖入周视图）

**Files:**
- Modify: `src/renderer/src/components/today/TaskItem.tsx`（整文件）
- Modify: `src/renderer/src/components/today/TaskList.tsx`（整文件）
- Create: `src/renderer/src/components/schedule/ConvertDialog.tsx`
- Modify: `src/renderer/src/components/schedule/WeekView.tsx`（监听 `lifeos:drop-task` 事件 → 打开转换弹窗）
- Modify: `src/renderer/src/stores/tasksStore.ts`（新增 `convert` 动作）

**Interfaces:**
- Consumes: `api.interop.convertTask`、`ConvertTaskInput`
- Produces:
  - `useTasksStore` 追加 `convert: (id: number, input: ConvertTaskInput) => Promise<void>`
  - `TaskItem` props 追加 `onConvert?: (task: Task) => void`

- [ ] **Step 1: `tasksStore` 加 `convert`**

```ts
import { create } from 'zustand'
import type { Task, Priority } from '@shared/types'
import { api, type ConvertTaskInput } from '../lib/ipc'
import { todayStr } from '../lib/dates'

interface TasksState {
  tasks: Task[]
  load: (date: string) => Promise<void>
  add: (title: string, priority: Priority) => Promise<void>
  toggle: (id: number) => Promise<void>
  remove: (id: number) => Promise<void>
  convert: (id: number, input: ConvertTaskInput) => Promise<void>
}

export const useTasksStore = create<TasksState>((set, get) => ({
  tasks: [],
  load: async (date) => {
    const tasks = await api.tasks.list(date)
    set({ tasks })
  },
  add: async (title, priority) => {
    await api.tasks.create({ title, priority, date: todayStr() })
    await get().load(todayStr())
  },
  toggle: async (id) => {
    const t = get().tasks.find((x) => x.id === id)
    if (!t) return
    await api.tasks.update(id, { done: !t.done })
    await get().load(todayStr())
  },
  remove: async (id) => {
    await api.tasks.remove(id)
    await get().load(todayStr())
  },
  convert: async (id, input) => {
    await api.interop.convertTask(id, input)
    await api.interop.syncDates([input.startAt.slice(0, 10)])
    await get().load(todayStr())
  }
}))
```

- [ ] **Step 2: `TaskItem` 区分事件来源行（只读 + 来源标记 + 跳转）**

```tsx
import type { Task } from '@shared/types'

const PRIORITY_DOT: Record<string, string> = { high: '#e74c3c', mid: '#f39c12', low: '#8b8d98' }
const SOURCE_LABEL: Record<string, string> = { event: '日程' }

export function TaskItem({ task, onToggle, onRemove, onConvert, onJump }: {
  task: Task
  onToggle: (id: number) => void
  onRemove: (id: number) => void
  onConvert?: (task: Task) => void
  onJump?: (task: Task) => void
}): JSX.Element {
  const fromEvent = task.source_module === 'event'

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] group">
      <input type="checkbox" checked={task.done} onChange={() => onToggle(task.id)} className="accent-[#7c8cff]" />
      <span className={`flex-1 text-sm ${task.done ? 'line-through text-[var(--muted)]' : ''}`}>{task.title}</span>

      {fromEvent && (
        <button onClick={() => onJump?.(task)} title="跳到日程"
          className="text-[10px] px-1.5 py-0.5 rounded border border-[#7c8cff]/50 text-[#7c8cff] hover:bg-[#7c8cff]/10">
          {SOURCE_LABEL[task.source_module!] ?? task.source_module} ↗
        </button>
      )}

      {!fromEvent && (
        <>
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PRIORITY_DOT[task.priority] }} />
          <button onClick={() => onConvert?.(task)} title="转为日程"
            className="opacity-0 group-hover:opacity-100 text-[var(--muted)] hover:text-[var(--accent)] text-xs">转日程</button>
          <button onClick={() => onRemove(task.id)} className="opacity-0 group-hover:opacity-100 text-[var(--muted)] hover:text-red-400 text-xs">✕</button>
        </>
      )}
    </div>
  )
}
```

> 事件来源行**不提供删除**（数据以事件为准），但保留勾选完成 —— 与 Task 5 的同步契约一致。
> 手工待办行加上 `draggable` 与 `dragstart`（见 Step 3），供拖入周视图使用。

- [ ] **Step 3: `TaskList` 接线（拖拽源 + 转换弹窗 + 跳转日程）**

```tsx
import { useState } from 'react'
import type { Priority, Task } from '@shared/types'
import { TaskItem } from './TaskItem'
import { useTasksStore } from '../../stores/tasksStore'
import { ConvertDialog } from '../schedule/ConvertDialog'

export function TaskList({ onJumpToSchedule }: { onJumpToSchedule?: () => void }): JSX.Element {
  const { tasks, add, toggle, remove, convert } = useTasksStore()
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<Priority>('mid')
  const [converting, setConverting] = useState<Task | null>(null)

  const submit = async (): Promise<void> => {
    const t = title.trim()
    if (!t) return
    await add(t, priority)
    setTitle('')
  }

  const buildInput = (task: Task, startAt: string, endAt: string): Parameters<typeof convert>[1] => ({
    startAt, endAt, location: null, note: null, remindMinutes: 15
  })

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
          placeholder="添加今日待办，回车确认"
          className="flex-1 bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className="bg-[var(--card)] border border-[var(--border)] rounded-lg px-2 text-sm text-[var(--muted)]">
          <option value="low">低</option>
          <option value="mid">中</option>
          <option value="high">高</option>
        </select>
      </div>

      {tasks.map((t) => (
        <div
          key={t.id}
          draggable={t.source_module !== 'event'}
          onDragStart={(e) => e.dataTransfer.setData('text/lifeos-task', String(t.id))}
        >
          <TaskItem
            task={t}
            onToggle={toggle}
            onRemove={remove}
            onConvert={setConverting}
            onJump={() => onJumpToSchedule?.()}
          />
        </div>
      ))}

      {tasks.length === 0 && <div className="text-center text-[var(--muted)] text-sm py-8">今天还没有待办，加一个吧</div>}

      <ConvertDialog
        task={converting}
        onClose={() => setConverting(null)}
        onSubmit={async (startAt, endAt) => {
          if (!converting) return
          await convert(converting.id, buildInput(converting, startAt, endAt))
          setConverting(null)
        }}
      />
    </div>
  )
}
```

- [ ] **Step 4: 新建 `ConvertDialog.tsx`（待办 → 日程）**

```tsx
import { useEffect, useState } from 'react'
import type { Task } from '@shared/types'
import { datePart, timePart, todayStr } from '@shared/dates'

interface Props {
  task: Task | null
  onClose: () => void
  onSubmit: (startAt: string, endAt: string) => Promise<void>
}

export function ConvertDialog({ task, onClose, onSubmit }: Props): JSX.Element | null {
  const [date, setDate] = useState(todayStr())
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('10:00')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!task) return
    setError('')
    setDate(task.date || todayStr())
    setStart('09:00')
    setEnd('10:00')
  }, [task])

  if (!task) return null

  const submit = async (): Promise<void> => {
    setBusy(true)
    try {
      await onSubmit(`${date} ${start}`, `${date} ${end}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const inputCls = 'w-full bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 text-sm outline-none focus:border-[var(--accent)]'

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4 w-80" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-bold mb-1">转为日程</div>
        <div className="text-xs text-[var(--muted)] mb-3">「{task.title}」将由日程接管，原待办行会被移除</div>
        <div className="mb-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </div>
        <div className="flex gap-2 mb-3">
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} />
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
        </div>
        {error && <div className="text-xs text-red-400 mb-2">{error}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded bg-[var(--border)]">取消</button>
          <button disabled={busy} onClick={() => void submit()} className="text-xs px-3 py-1.5 rounded bg-[var(--accent)] text-white disabled:opacity-50">确认转换</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 周视图接收拖入的待办**

在 `WeekView.tsx` 顶部 import 之后加入：

```tsx
import { useEffect } from 'react'
import type { ConvertTaskInput } from '../../lib/ipc'
```

在组件内、`onDrop` 定义之后加入：

```tsx
  // 今天页待办拖入格子：交给 SchedulePage 打开转换弹窗
  useEffect(() => {
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent<ConvertTaskInput & { taskId: number }>).detail
      window.dispatchEvent(new CustomEvent('lifeos:convert-request', { detail }))
    }
    window.addEventListener('lifeos:drop-task', handler)
    return () => window.removeEventListener('lifeos:drop-task', handler)
  }, [])
```

`SchedulePage.tsx` 里接收该事件并打开 `ConvertDialog`：在 `SchedulePage` 内加入

```tsx
import { ConvertDialog } from './ConvertDialog'
import type { ConvertTaskInput } from '../../lib/ipc'
import { useTasksStore } from '../../stores/tasksStore'
```

```tsx
  const convertTask = useTasksStore((s) => s.convert)
  const [dropped, setDropped] = useState<(ConvertTaskInput & { taskId: number; title: string }) | null>(null)

  useEffect(() => {
    const handler = (e: Event): void => {
      setDropped((e as CustomEvent<ConvertTaskInput & { taskId: number; title: string }>).detail)
    }
    window.addEventListener('lifeos:convert-request', handler)
    return () => window.removeEventListener('lifeos:convert-request', handler)
  }, [])
```

在 `SchedulePage` 的 JSX 末尾（`EventDialog` 之后）加入：

```tsx
      <ConvertDialog
        task={dropped ? { id: dropped.taskId, title: dropped.title, date: dropped.startAt.slice(0, 10) } : null}
        onClose={() => setDropped(null)}
        onSubmit={async (startAt, endAt) => {
          if (!dropped) return
          await convertTask(dropped.taskId, { startAt, endAt, location: null, note: null, remindMinutes: 15 })
          setDropped(null)
        }}
      />
```

> `ConvertDialog` 的 props 用最小结构 `{ id: number; title: string; date: string } | null`，这样今天页（拿到完整 `Task`）和日程页（只有拖拽传过来的 id/title）都能复用；`ConvertDialog.tsx` 里的 `import type { Task }` 相应换成：
> ```ts
> export interface ConvertTarget { id: number; title: string; date: string }
> ```
> 并把 `task: Task | null` 改为 `task: ConvertTarget | null`（`Task` 结构上满足该接口，今天页调用处无需改动）。

`WeekView.tsx` 的 `onDrop` 同步改为传标题（供拖拽路径使用）：

```tsx
  const onDrop = (date: string) => (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setDropDay(null)
    let payload: { id: number; title: string } | null = null
    try { payload = JSON.parse(e.dataTransfer.getData('text/lifeos-task')) } catch { payload = null }
    if (!payload?.id) return
    const rect = e.currentTarget.getBoundingClientRect()
    const hour = Math.max(0, Math.min(23, Math.floor((e.clientY - rect.top) / HOUR_HEIGHT)))
    window.dispatchEvent(new CustomEvent('lifeos:drop-task', {
      detail: { taskId: payload.id, title: payload.title, startAt: `${date} ${pad2(hour)}:00`, endAt: `${date} ${pad2(hour)}:59` }
    }))
  }
```

对应地，`TaskList.tsx` 的拖拽源改为写 JSON：

```tsx
          onDragStart={(e) => e.dataTransfer.setData('text/lifeos-task', JSON.stringify({ id: t.id, title: t.title }))}
```

- [ ] **Step 6: 手动验收（PRD 8.3.1 / 8.3.2 / 8.3.3 / 8.4.2）**

Run: `npm run dev`
Expected:
1. 「今天」页手工待办行悬停出现「转日程」按钮，点击后填时间确认 → 该行消失，日程页对应时间出现事件
2. 事件来源的待办行显示「日程 ↗」标记，**没有删除按钮**，勾选框仍可用；点「日程 ↗」跳到日程页
3. 在日程页新建/修改/删除事件后回到「今天」页，汇入行随之增、改、删，且已勾选状态不丢
4. 从「今天」页把手工待办拖到日程页周视图的某个格子 → 弹出转换弹窗且时间已按落点预填（跨页面拖拽不可用时，用「转日程」按钮完成同一验收项）

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/today src/renderer/src/components/schedule src/renderer/src/stores/tasksStore.ts
git commit -m "feat: 今天页互通 UI（日程汇入只读行 + 转日程 + 拖入周视图）"
```

---

### Task 11: 时间轴增强（范围/显隐/来源色）+ 模块标记长期任务接口

**Files:**
- Modify: `src/main/db/longTasks.ts`（整文件）
- Modify: `src/main/ipc.ts`、`src/preload/index.ts`、`src/renderer/src/lib/ipc.ts`（追加 longTasks 通道）
- Create: `src/renderer/src/stores/settingsStore.ts`
- Modify: `src/renderer/src/stores/longTasksStore.ts`（整文件）
- Modify: `src/renderer/src/components/layout/TimelineBar.tsx`（顶部控制条 + 详情浮层加来源与完成）
- Modify: `tests/longTasks.test.ts`（追加用例）

**Interfaces:**
- Consumes: `MODULE_COLORS`、`diffDays`、`getAllSettings`、`setSetting`
- Produces:
  - `type LongTaskPatch = Partial<Pick<LongTask, 'title' | 'start_date' | 'end_date' | 'done' | 'color'>>`
  - `updateLongTask(db, id: number, patch: LongTaskPatch): LongTask`
  - `setLongTaskDone(db, id: number, done: boolean): LongTask`
  - `interface MarkFromSourceInput { title: string; startDate: string; endDate: string; sourceModule: ModuleKey; sourceId: number }`
  - `markFromSource(db, input: MarkFromSourceInput): LongTask`（同来源二次标记 = 更新，不产生重复色块）
  - `removeBySource(db, sourceModule: ModuleKey, sourceId: number): void`
  - `createLongTask` 增加"≥2 天"校验；默认色 `#8b8d98`（独立任务）
  - IPC 通道：`longTasks:update`、`longTasks:setDone`、`longTasks:markFromSource`、`longTasks:removeBySource`
  - `useSettingsStore`：`{ settings: Settings; load(): Promise<void>; set<K extends SettingsKey>(k: K, v: Settings[K]): Promise<void> }`

- [ ] **Step 1: 追加失败测试到 `tests/longTasks.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { openDb } from '../src/main/db'
import {
  listRange, createLongTask, deleteLongTask,
  updateLongTask, setLongTaskDone, markFromSource, removeBySource
} from '../src/main/db/longTasks'
```

（替换文件顶部原有 import，`describe` 块保留原 3 个用例，追加：）

```ts
describe('longTasks M2 增强', () => {
  it('少于 2 天不允许上轴', () => {
    expect(() => createLongTask(db, { title: '当天小事', startDate: '2026-09-30', endDate: '2026-09-30' })).toThrow('2 天')
  })

  it('刚好 2 天允许上轴', () => {
    expect(createLongTask(db, { title: '两天', startDate: '2026-09-30', endDate: '2026-10-01' }).id).toBeGreaterThan(0)
  })

  it('更新是合并语义，未传字段不变', () => {
    const t = createLongTask(db, { title: '备考', startDate: '2026-10-01', endDate: '2026-12-01' })
    const u = updateLongTask(db, t.id, { title: '备考（改）' })
    expect(u.title).toBe('备考（改）')
    expect(u.start_date).toBe('2026-10-01')
    expect(u.end_date).toBe('2026-12-01')
    expect(u.done).toBe(false)
  })

  it('更新同样受 2 天校验约束', () => {
    const t = createLongTask(db, { title: '备考', startDate: '2026-10-01', endDate: '2026-12-01' })
    expect(() => updateLongTask(db, t.id, { endDate: '2026-10-01' })).toThrow('2 天')
  })

  it('setLongTaskDone 切换完成标记', () => {
    const t = createLongTask(db, { title: '减脂', startDate: '2026-10-01', endDate: '2026-11-01' })
    expect(setLongTaskDone(db, t.id, true).done).toBe(true)
    expect(setLongTaskDone(db, t.id, false).done).toBe(false)
  })

  it('markFromSource 取来源模块色，且同来源二次标记是更新', () => {
    const a = markFromSource(db, { title: '雅思备考', startDate: '2026-10-01', endDate: '2026-12-01', sourceModule: 'learning', sourceId: 7 })
    expect(a.color).toBe('#4ade80')
    expect(a.source_module).toBe('learning')
    expect(a.source_id).toBe(7)

    const b = markFromSource(db, { title: '雅思备考（改名）', startDate: '2026-10-05', endDate: '2026-12-10', sourceModule: 'learning', sourceId: 7 })
    expect(b.id).toBe(a.id)
    expect(b.title).toBe('雅思备考（改名）')
    expect(b.start_date).toBe('2026-10-05')
    expect(listRange(db, '2026-01-01', '2027-01-01')).toHaveLength(1)
  })

  it('markFromSource 也要求 ≥2 天', () => {
    expect(() => markFromSource(db, { title: '一天', startDate: '2026-10-01', endDate: '2026-10-01', sourceModule: 'dev', sourceId: 1 })).toThrow('2 天')
  })

  it('removeBySource 清掉对应色块，独立任务不受影响', () => {
    markFromSource(db, { title: '项目A', startDate: '2026-10-01', endDate: '2026-11-01', sourceModule: 'dev', sourceId: 3 })
    createLongTask(db, { title: '独立任务', startDate: '2026-10-01', endDate: '2026-11-01' })
    removeBySource(db, 'dev', 3)
    const rest = listRange(db, '2026-01-01', '2027-01-01')
    expect(rest.map((t) => t.title)).toEqual(['独立任务'])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/longTasks.test.ts`
Expected: FAIL —— `does not provide an export named 'updateLongTask'`

- [ ] **Step 3: 改写 `src/main/db/longTasks.ts`**

> **先做 Step 6 的类型定义**：本文件从 `@shared/types` 引入 `LongTaskPatch` 与 `MarkFromSourceInput`，请先把 Step 6 的那两个类型追加到 `src/shared/types.ts`，再改写本文件。

```ts
import type { DatabaseSync } from 'node:sqlite'
import type { LongTask, LongTaskPatch, MarkFromSourceInput } from '@shared/types'
import { MODULE_COLORS } from '@shared/types'
import { diffDays } from '@shared/dates'

export type { LongTaskPatch, MarkFromSourceInput } from '@shared/types'

export const INDEPENDENT_COLOR = '#8b8d98'
const MIN_DAYS = 2

export interface LongTaskInput {
  title: string
  startDate: string
  endDate: string
  color?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToLongTask = (r: any): LongTask => ({ ...r, done: !!r.done })

function assertSpan(startDate: string, endDate: string): void {
  if (endDate < startDate) throw new Error('结束日期不能早于开始日期')
  if (diffDays(endDate, startDate) < MIN_DAYS - 1) {
    throw new Error('长期任务至少需要 2 天；当天完成的小事请用今日待办')
  }
}

export function listRange(db: DatabaseSync, from: string, to: string): LongTask[] {
  return db.prepare(`
    SELECT * FROM long_tasks
    WHERE start_date <= ? AND end_date >= ?
    ORDER BY start_date ASC, id ASC
  `).all(to, from).map(rowToLongTask)
}

export function getLongTask(db: DatabaseSync, id: number): LongTask | null {
  const row = db.prepare('SELECT * FROM long_tasks WHERE id = ?').get(id)
  return row ? rowToLongTask(row) : null
}

export function createLongTask(db: DatabaseSync, input: LongTaskInput): LongTask {
  assertSpan(input.startDate, input.endDate)
  const info = db.prepare(`
    INSERT INTO long_tasks (title, start_date, end_date, color) VALUES (?, ?, ?, ?)
  `).run(input.title, input.startDate, input.endDate, input.color ?? INDEPENDENT_COLOR)
  return getLongTask(db, Number(info.lastInsertRowid))!
}

export function updateLongTask(db: DatabaseSync, id: number, patch: LongTaskPatch): LongTask {
  const cur = getLongTask(db, id)
  if (!cur) throw new Error(`long_task ${id} not found`)
  const start = patch.start_date ?? cur.start_date
  const end = patch.end_date ?? cur.end_date
  assertSpan(start, end)
  db.prepare(`
    UPDATE long_tasks SET title=?, start_date=?, end_date=?, color=?, done=?,
      updated_at=datetime('now','localtime')
    WHERE id=?
  `).run(
    patch.title ?? cur.title, start, end, patch.color ?? cur.color,
    (patch.done ?? cur.done) ? 1 : 0, id
  )
  return getLongTask(db, id)!
}

export function setLongTaskDone(db: DatabaseSync, id: number, done: boolean): LongTask {
  return updateLongTask(db, id, { done })
}

/** 模块事项标记为长期任务：同来源二次调用是更新，色块颜色取来源模块色 */
export function markFromSource(db: DatabaseSync, input: MarkFromSourceInput): LongTask {
  assertSpan(input.startDate, input.endDate)
  const color = MODULE_COLORS[input.sourceModule] ?? INDEPENDENT_COLOR
  const existing = db.prepare(
    'SELECT * FROM long_tasks WHERE source_module = ? AND source_id = ?'
  ).get(input.sourceModule, input.sourceId)

  if (existing) {
    const row = rowToLongTask(existing)
    return updateLongTask(db, row.id, {
      title: input.title, start_date: input.startDate, end_date: input.endDate, color
    })
  }

  const info = db.prepare(`
    INSERT INTO long_tasks (title, start_date, end_date, color, source_module, source_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(input.title, input.startDate, input.endDate, color, input.sourceModule, input.sourceId)
  return getLongTask(db, Number(info.lastInsertRowid))!
}

/** 来源事项被删除时同步清掉色块（M3/M4 模块删除流程调用） */
export function removeBySource(db: DatabaseSync, sourceModule: ModuleKey, sourceId: number): void {
  db.prepare('DELETE FROM long_tasks WHERE source_module = ? AND source_id = ?').run(sourceModule, sourceId)
}

export function deleteLongTask(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM long_tasks WHERE id = ?').run(id)
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/longTasks.test.ts`
Expected: PASS（11 个用例：原 3 + 新 8）

- [ ] **Step 5: 追加 IPC 通道（三处同步修改）**

`src/main/ipc.ts` 的 longTasks 段替换为：

```ts
  ipcMain.handle('longTasks:listRange', (_e, from: string, to: string) => longTasks.listRange(db, from, to))
  ipcMain.handle('longTasks:create', (_e, input: longTasks.LongTaskInput) => longTasks.createLongTask(db, input))
  ipcMain.handle('longTasks:update', (_e, id: number, patch: longTasks.LongTaskPatch) => longTasks.updateLongTask(db, id, patch))
  ipcMain.handle('longTasks:setDone', (_e, id: number, done: boolean) => longTasks.setLongTaskDone(db, id, done))
  ipcMain.handle('longTasks:markFromSource', (_e, input: longTasks.MarkFromSourceInput) => longTasks.markFromSource(db, input))
  ipcMain.handle('longTasks:removeBySource', (_e, m: ModuleKey, id: number) => longTasks.removeBySource(db, m, id))
  ipcMain.handle('longTasks:delete', (_e, id: number) => longTasks.deleteLongTask(db, id))
```

并在 `src/main/ipc.ts` 顶部加 `import type { ModuleKey } from '@shared/types'`。

`src/preload/index.ts` 的 `longTasks` 段补：

```ts
    update: (id: number, patch: unknown): Promise<unknown> => ipcRenderer.invoke('longTasks:update', id, patch),
    setDone: (id: number, done: boolean): Promise<unknown> => ipcRenderer.invoke('longTasks:setDone', id, done),
    markFromSource: (input: unknown): Promise<unknown> => ipcRenderer.invoke('longTasks:markFromSource', input),
    removeBySource: (m: string, id: number): Promise<unknown> => ipcRenderer.invoke('longTasks:removeBySource', m, id),
```

`src/renderer/src/lib/ipc.ts` 的 `longTasks` 接口补：

```ts
    update(id: number, patch: LongTaskPatch): Promise<LongTask>
    setDone(id: number, done: boolean): Promise<LongTask>
    markFromSource(input: MarkFromSourceInput): Promise<LongTask>
    removeBySource(sourceModule: ModuleKey, sourceId: number): Promise<void>
```

并在文件顶部补两个类型：

```ts
import type { LongTaskPatch, MarkFromSourceInput } from '@shared/types'
```

- [ ] **Step 6: `src/shared/types.ts` 追加两个共享类型（在 Step 3 之前执行）**

```ts
export type LongTaskPatch = Partial<Pick<LongTask, 'title' | 'start_date' | 'end_date' | 'done' | 'color'>>

export interface MarkFromSourceInput {
  title: string
  startDate: string
  endDate: string
  sourceModule: ModuleKey
  sourceId: number
}
```

（`src/main/db/longTasks.ts` 与 `src/renderer/src/lib/ipc.ts` 都从这里取类型，避免两处定义漂移。）

- [ ] **Step 7: 新建 `src/renderer/src/stores/settingsStore.ts`**

```ts
import { create } from 'zustand'
import type { Settings, SettingsKey } from '@shared/settings'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { api } from '../lib/ipc'

interface SettingsState {
  settings: Settings
  loaded: boolean
  load: () => Promise<void>
  set: <K extends SettingsKey>(key: K, value: Settings[K]) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  load: async () => {
    const settings = await api.settings.getAll()
    set({ settings, loaded: true })
  },
  set: async (key, value) => {
    const settings = await api.settings.set(key, value)
    set({ settings })
  }
}))
```

- [ ] **Step 8: 改写 `src/renderer/src/stores/longTasksStore.ts`（范围来自设置、显隐过滤）**

```ts
import { create } from 'zustand'
import type { LongTask } from '@shared/types'
import { api } from '../lib/ipc'
import { addDays, todayStr } from '../lib/dates'
import { useSettingsStore } from './settingsStore'

const PAST_DAYS = 3

interface LongTasksState {
  tasks: LongTask[]
  range: { from: string; to: string }
  reload: () => Promise<void>
  create: (title: string, startDate: string, endDate: string) => Promise<void>
  setDone: (id: number, done: boolean) => Promise<void>
  remove: (id: number) => Promise<void>
}

function computeRange(): { from: string; to: string } {
  const days = useSettingsStore.getState().settings['timeline.rangeDays']
  return { from: addDays(todayStr(), -PAST_DAYS), to: addDays(todayStr(), days) }
}

export const useLongTasksStore = create<LongTasksState>((set, get) => ({
  tasks: [],
  range: computeRange(),
  reload: async () => {
    const range = computeRange()
    const tasks = await api.longTasks.listRange(range.from, range.to)
    set({ tasks, range })
  },
  create: async (title, startDate, endDate) => {
    await api.longTasks.create({ title, startDate, endDate })
    await get().reload()
  },
  setDone: async (id, done) => {
    await api.longTasks.setDone(id, done)
    await get().reload()
  },
  remove: async (id) => {
    await api.longTasks.remove(id)
    await get().reload()
  }
}))
```

- [ ] **Step 9: `TimelineBar.tsx` 接线（范围选择、已完成显隐、来源与完成）**

在原有实现上做四处改动（其余结构保持不变）：

1. 顶部 import 追加：

```tsx
import { useSettingsStore } from '../../stores/settingsStore'
```

2. 组件内取设置与加载：

```tsx
  const { settings, load: loadSettings, set: setSetting } = useSettingsStore()
  const { tasks, range, reload, create, remove, setDone } = useLongTasksStore()

  useEffect(() => { void loadSettings() }, [loadSettings])
  useEffect(() => { void reload() }, [reload, settings['timeline.rangeDays']])

  const visible = settings['timeline.showDone'] ? tasks : tasks.filter((t) => !t.done)
```

3. `calcBlocks` 与后续计算全部改用 `visible`（原来是 `tasks`），详情浮层里的 `tasks.find(...)` 改为 `visible.find(...)`。

4. 在"＋长期任务"按钮左侧加设置控件：

```tsx
      <select
        value={settings['timeline.rangeDays']}
        onChange={(e) => void setSetting('timeline.rangeDays', Number(e.target.value) as 7 | 30 | 90)}
        className="text-xs bg-[var(--card)] border border-[var(--border)] rounded px-1 py-1 text-[var(--muted)]"
      >
        <option value={7}>未来 7 天</option>
        <option value={30}>未来 30 天</option>
        <option value={90}>未来 90 天</option>
      </select>
      <label className="flex items-center gap-1 text-xs text-[var(--muted)] whitespace-nowrap">
        <input
          type="checkbox"
          checked={settings['timeline.showDone']}
          onChange={(e) => void setSetting('timeline.showDone', e.target.checked)}
          className="accent-[#7c8cff]"
        />
        显示已完成
      </label>
```

5. 详情浮层补来源与完成操作（替换原有的浮层按钮区）：

```tsx
          {selected.source_module && <div className="text-[10px] text-[var(--muted)] mb-2">来源：{SOURCE_LABEL[selected.source_module] ?? selected.source_module}</div>}
          <div className="flex gap-2">
            <button onClick={() => { void setDone(selected.id, !selected.done); setSelected(null) }}
              className="text-xs px-2 py-1 rounded bg-[var(--border)]">
              {selected.done ? '标记未完成' : '标记完成'}
            </button>
            <button onClick={() => { void remove(selected.id); setSelected(null) }} className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-300">删除</button>
            <button onClick={() => setSelected(null)} className="text-xs px-2 py-1 rounded bg-[var(--border)]">关闭</button>
          </div>
```

文件顶部加映射：

```tsx
const SOURCE_LABEL: Record<string, string> = {
  schedule: '日程', learning: '自我学习', dev: '开发', inspiration: '设计灵感',
  fitness: '健身', diet: '饮食', entertainment: '游戏娱乐'
}
```

> 已完成任务的色块在紧凑模式下仍然渲染（是否可见由「显示已完成」控制），这是 PRD 8.5.3 的显隐语义。

- [ ] **Step 10: 手动验收（PRD 8.5.2 / 8.5.3 / 8.5.4）**

Run: `npm run dev`
Expected:
1. 时间轴上方出现「未来 7 / 30 / 90 天」下拉与「显示已完成」勾选框；切换 7/30/90 后色块横向密度立刻变化
2. 新建长期任务时若起止不足 2 天，弹出报错提示且不创建
3. 点色块 → 详情浮层可「标记完成」；勾选「显示已完成」后该色块出现，取消勾选后消失
4. 独立创建的长期任务色块为灰 `#8b8d98`

- [ ] **Step 11: Commit**

```bash
git add src/main/db/longTasks.ts src/shared/types.ts src/main/ipc.ts src/preload/index.ts src/renderer/src/lib/ipc.ts src/renderer/src/stores src/renderer/src/components/layout/TimelineBar.tsx tests/longTasks.test.ts
git commit -m "feat: 时间轴范围/显隐/来源色 + 模块标记长期任务接口（TDD）"
```

---

### Task 12: 系统通知提醒（纯函数 TDD + 主进程轮询）

**Files:**
- Create: `src/shared/reminders.ts`
- Create: `src/main/reminders.ts`
- Modify: `src/main/index.ts`（启动轮询 + 退出清理）
- Test: `tests/reminders.test.ts`

**Interfaces:**
- Consumes: `Occurrence`、`parseLocal`、`listOccurrences`、`getAllSettings`
- Produces:
  - `interface ReminderHit { key: string; eventId: number; title: string; startAt: string }`
  - `reminderKey(o: Occurrence): string`（= `${eventId}@${date}`）
  - `dueReminders(now: Date, occurrences: Occurrence[], fired: ReadonlySet<string>): ReminderHit[]`
  - `startReminders(db: DatabaseSync, getWindow: () => BrowserWindow | null, intervalMs?: number): () => void`

**锁定的提醒语义：**

- 每条事件的提前量取自身 `remind_minutes`（新建事件时由 `remind.enabled` / `remind.leadMinutes` 设置提供默认值，可在编辑器里改）
- 命中条件：`start - lead <= now < start`；应用在窗口期内启动会立刻补发，**已经开始的过期事件不再打扰**
- 同一次发生只提醒一次（`reminderKey` 去重，内存集合）；跨天后清理旧 key

- [ ] **Step 1: 写失败测试**

`tests/reminders.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { dueReminders, reminderKey } from '../src/shared/reminders'
import type { Occurrence } from '../src/shared/types'

const occ = (id: number, startAt: string, remindMinutes = 15): Occurrence => ({
  eventId: id, title: `事件${id}`, date: startAt.slice(0, 10), startAt,
  endAt: `${startAt.slice(0, 10)} 23:00`, allDay: false, location: null, note: null, remindMinutes
})

describe('dueReminders', () => {
  const now = new Date('2026-09-30T09:50:00')

  it('进入提前窗口后命中', () => {
    const hits = dueReminders(now, [occ(1, '2026-09-30 10:00', 15)], new Set())
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ eventId: 1, title: '事件1', startAt: '2026-09-30 10:00' })
    expect(hits[0].key).toBe('1@2026-09-30')
  })

  it('恰好等于提醒时刻也算命中（含边界）', () => {
    expect(dueReminders(new Date('2026-09-30T09:45:00'), [occ(1, '2026-09-30 10:00', 15)], new Set())).toHaveLength(1)
  })

  it('还没到提醒时刻不命中', () => {
    expect(dueReminders(new Date('2026-09-30T09:44:00'), [occ(1, '2026-09-30 10:00', 15)], new Set())).toHaveLength(0)
  })

  it('事件已经开始就不再提醒', () => {
    expect(dueReminders(new Date('2026-09-30T10:00:00'), [occ(1, '2026-09-30 10:00', 15)], new Set())).toHaveLength(0)
    expect(dueReminders(new Date('2026-09-30T11:00:00'), [occ(1, '2026-09-30 10:00', 15)], new Set())).toHaveLength(0)
  })

  it('每个事件用自己的提前量', () => {
    const list = [occ(1, '2026-09-30 10:00', 5), occ(2, '2026-09-30 10:00', 15)]
    const hits = dueReminders(now, list, new Set())
    expect(hits.map((h) => h.eventId)).toEqual([2])
  })

  it('已提醒过的发生项不再重复', () => {
    const o = occ(1, '2026-09-30 10:00', 15)
    expect(dueReminders(now, [o], new Set([reminderKey(o)]))).toHaveLength(0)
  })

  it('多条同时命中的按开始时间排序返回', () => {
    const list = [occ(2, '2026-09-30 10:00'), occ(1, '2026-09-30 09:55')]
    expect(dueReminders(now, list, new Set()).map((h) => h.eventId)).toEqual([1, 2])
  })

  it('明天的发生项不会被今天的轮询误发', () => {
    expect(dueReminders(now, [occ(1, '2026-10-01 10:00', 15)], new Set())).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/reminders.test.ts`
Expected: FAIL —— `Failed to resolve import "../src/shared/reminders"`

- [ ] **Step 3: 实现 `src/shared/reminders.ts`**

```ts
import type { Occurrence } from './types'
import { parseLocal } from './dates'

export interface ReminderHit {
  key: string
  eventId: number
  title: string
  startAt: string
}

export function reminderKey(o: Occurrence): string {
  return `${o.eventId}@${o.date}`
}

/** 命中的条件：start - lead <= now < start，且该次发生尚未提醒过 */
export function dueReminders(
  now: Date,
  occurrences: Occurrence[],
  fired: ReadonlySet<string>
): ReminderHit[] {
  const t = now.getTime()
  const hits: ReminderHit[] = []
  for (const o of occurrences) {
    const key = reminderKey(o)
    if (fired.has(key)) continue
    const start = parseLocal(o.startAt).getTime()
    const lead = Number.isFinite(o.remindMinutes) ? o.remindMinutes : 15
    if (t >= start - lead * 60000 && t < start) {
      hits.push({ key, eventId: o.eventId, title: o.title, startAt: o.startAt })
    }
  }
  return hits.sort((a, b) => a.startAt.localeCompare(b.startAt) || a.eventId - b.eventId)
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/reminders.test.ts`
Expected: PASS（8 个用例）

- [ ] **Step 5: 实现主进程轮询 `src/main/reminders.ts`**

```ts
import { Notification, type BrowserWindow } from 'electron'
import type { DatabaseSync } from 'node:sqlite'
import { listOccurrences } from './db/events'
import { getAllSettings } from './db/settings'
import { dueReminders, reminderKey } from '@shared/reminders'
import { addDays, todayStr } from '@shared/dates'

export const REMINDER_INTERVAL_MS = 30000

export function startReminders(
  db: DatabaseSync,
  getWindow: () => BrowserWindow | null,
  intervalMs: number = REMINDER_INTERVAL_MS
): () => void {
  const fired = new Set<string>()

  const tick = (): void => {
    const settings = getAllSettings(db)
    if (!settings['remind.enabled']) return

    const today = todayStr()
    // 清理昨天及更早的去重键，避免集合无限增长
    for (const k of fired) if (!k.endsWith(`@${today}`) && !k.endsWith(`@${addDays(today, 1)}`)) fired.delete(k)
    if (!fired.size) fired.clear()

    const occurrences = listOccurrences(db, today, addDays(today, 1))
    for (const hit of dueReminders(new Date(), occurrences, fired)) {
      fired.add(hit.key)
      const n = new Notification({
        title: 'LifeOS 提醒',
        body: `${hit.title} · ${hit.startAt.slice(11)}`
      })
      n.on('click', () => {
        const win = getWindow()
        if (win) {
          if (win.isMinimized()) win.restore()
          win.show()
          win.focus()
        }
      })
      n.show()
    }
  }

  tick()
  const timer = setInterval(tick, intervalMs)
  return () => clearInterval(timer)
}
```

- [ ] **Step 6: 接入 `src/main/index.ts`**

顶部 import 追加：

```ts
import { startReminders } from './reminders'
```

`createWindow` 改为返回窗口，便于提醒点击时聚焦：

```ts
function createWindow(): BrowserWindow {
  const win = new BrowserWindow({ /* …保持原有配置… */ })
  /* …原有 setWindowOpenHandler 与加载逻辑不变… */
  return win
}
```

`app.whenReady()` 回调改为：

```ts
void app.whenReady().then(() => {
  const dataDir = app.getPath('userData')
  ensureDataDir(dataDir)
  const { db, notice } = startupOpen(path.join(dataDir, 'app.db'), path.join(dataDir, 'backups'))
  registerIpc(db)

  let mainWindow: BrowserWindow | null = createWindow()
  const stopReminders = startReminders(db, () => mainWindow)

  if (notice) {
    void dialog.showMessageBox({ type: 'warning', title: 'LifeOS 数据恢复', message: notice })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
  app.on('before-quit', () => stopReminders())
})
```

- [ ] **Step 7: 手动验收（PRD 8.4.4）**

Run: `npm run dev`

验收方法：在日程页新建一个"开始时间 = 当前时间 + 2 分钟"的事件，把事件提醒设为 5 分钟（即立刻进入提醒窗口），保存后等待 ≤30 秒。
Expected:
1. 弹出 Windows 系统通知，标题 `LifeOS 提醒`，正文为「事件名 · HH:MM」
2. 同一条只弹一次（等 1 分钟确认无重复）
3. 点击通知，应用窗口被唤起并聚焦

- [ ] **Step 8: Commit**

```bash
git add src/shared/reminders.ts src/main/reminders.ts src/main/index.ts tests/reminders.test.ts
git commit -m "feat: 事件系统通知提醒（纯函数 TDD + 主进程 30s 轮询）"
```

---

### Task 13: M2 验收清单 + 打包验证

**Files:**
- Modify: `DEVELOPMENT-PLAN.md`（补充 M2 计划文件链接）
- Create: `docs/plans/2026-09-30-m2-acceptance.md`（验收记录，实际执行后填写结果）

**Interfaces:**
- Consumes: 全部前序任务

- [ ] **Step 1: 全量测试与类型检查**

Run: `npm test`
Expected: PASS —— 至少 12 个测试文件、80+ 用例全绿

Run: `npm run typecheck`
Expected: 无输出

- [ ] **Step 2: 逐条走 PRD 验收（把结果写进 `docs/plans/2026-09-30-m2-acceptance.md`）**

Run: `npm run dev`

- [ ] **8.1 数据安全**：新增事件 + 待办 + 长期任务 → 关闭重开，数据完整；`%APPDATA%\LifeOS\backups\` 有备份且不超过 10 份
- [ ] **8.1.3**：删除 `app.db` 重启 → 自动从最近备份恢复并弹提示
- [ ] **8.2**：时间轴在「今天」与「日程」两页都常驻；紧凑/展开、点色块浮层正常
- [ ] **8.3.1**：待办增删改、勾选、优先级排序正常
- [ ] **8.3.2**：当天日程事件自动出现在待办列表并带「日程 ↗」来源标记
- [ ] **8.3.3**：待办「转日程」后出现在日历对应时间
- [ ] **8.4.1**：周视图/月视图正确渲染；今天列（周视图）与今天格（月视图）高亮；月视图每天最多 3 条 + 「+N」
- [ ] **8.4.2**：可创建/编辑/删除事件，含地点、备注、重复规则
- [ ] **8.4.3**：每日/每周/每月重复事件按规则在日历正确展开（用跨月日期验证：1 月 31 日每月重复 → 2 月 28 日、3 月 31 日）
- [ ] **8.4.4**：到点弹系统通知，提前量符合事件设置
- [ ] **8.5.1**：`markFromSource` 接口就绪（M2 通过单测验证；学习项/开发项目的界面入口在 M3 交付）
- [ ] **8.5.2**：时间轴可直接创建独立长期任务
- [ ] **8.5.3**：显示范围 7/30/90 生效；「显示已完成」显隐生效
- [ ] **8.5.4**：`markFromSource` 产生的色块颜色与来源模块色一致（单测断言 `#4ade80`）
- [ ] **8.9**：`npm test` 全绿；连续操作 10 分钟无崩溃

- [ ] **Step 3: 构建与打包**

Run: `npm run build && npx electron-builder`
Expected: `release/` 下生成 `LifeOS Setup *.exe`；安装包可安装、可启动、可卸载

- [ ] **Step 4: 安装包冒烟测试**

安装 → 启动 → 新建一条待办与一个事件 → 关闭 → 重启 → 数据仍在 → 卸载。
Expected: 全流程无崩溃；`%APPDATA%\LifeOS\` 数据在卸载后保留（除非用户主动清理）

- [ ] **Step 5: 更新总览计划**

`DEVELOPMENT-PLAN.md` 第 6 行下方追加：

```md
  - M2 详细计划：[docs/plans/2026-09-30-m2-core-interop.md](./docs/plans/2026-09-30-m2-core-interop.md)
```

- [ ] **Step 6: Commit**

```bash
git add docs/plans/2026-09-30-m2-acceptance.md DEVELOPMENT-PLAN.md
git commit -m "chore: M2 验收记录 + 打包验证通过"
```

---

## Self-Review 记录

### 1. Spec 覆盖

| 需求来源 | 覆盖任务 |
|---|---|
| 开发计划 M2-1：events 表 + CRUD + 重复展开引擎（纯函数 TDD） | Task 2、Task 3、Task 4 |
| 开发计划 M2-2：周视图 / 月视图组件 | Task 8、Task 9 |
| 开发计划 M2-3：系统通知提醒（主进程轮询） | Task 12 |
| 开发计划 M2-4：待办 ⇄ 日程双向转换 | Task 5、Task 10 |
| 开发计划 M2-5：long_tasks 与模块联动接口、独立创建 | Task 11（独立创建 M1 已有并保留） |
| 开发计划 M2-6：滚动备份（启动备份 + 保留 10 份 + 损坏自动恢复） | Task 1 |
| PRD 8.1 数据安全（含 8.1.3 删库自动恢复、8.1.4 导出导入 → 后者属 M5） | Task 1、Task 13 |
| PRD 8.3.2 / 8.3.3 互通 | Task 5、Task 10 |
| PRD 8.4.1–8.4.4 日程全部 | Task 4、Task 7、Task 8、Task 9、Task 12 |
| PRD 8.5.2–8.5.4 长期任务上轴与显隐 | Task 11 |
| PRD 4.8 时间轴设置（显示范围 / 已完成显隐） | Task 11（设置项读写在本里程碑打通，完整设置页 UI 仍归 M5） |
| PRD 4.8 提醒设置（声音开关 / 提前分钟数） | Task 6 提供 `remind.enabled` / `remind.leadMinutes` 读写；设置页 UI 归 M5 |

**已知范围边界（非缺口，需在 M5 收口）：**
- 「网站风格模仿」「数据导出/导入」「浅色模式」「主题色」属 M5，本计划不涉及
- 学习项 / 开发项目的「标记为长期任务」**按钮**在 M3/M4 各模块页面接入；M2 交付的是数据接口 `markFromSource` + 单测证明其行为（PRD 8.5.1 的界面部分因此在 M3 完整验收）
- 跨页面 HTML5 拖拽（今天页 → 日程页）在 Electron 单窗口下不保证生效，Task 10 已给出「转日程」按钮作为等价路径，验收不依赖拖拽成功

**设计文档与 PRD 的偏差（已在计划中处理，需在 M5 回写设计文档）：**
1. `events` 表新增 `all_day` 字段 —— 设计文档 §7.1 未列，但 PRD §3.5 要求「全天事件为通栏色条」
2. `long_tasks` 表新增 `done` 字段 —— 设计文档 §7.1 未列，但 PRD §8.5.3 要求「已完成任务显隐设置生效」
3. 数据库驱动实际为 `node:sqlite`（非设计文档 §3 写的 better-sqlite3），M1 已如此实现，M2 延续
4. 事件不设独立 `color` 字段：全部事件统一使用日程模块色 `#7c8cff`，符合「模块色贯穿全局」

### 2. 占位符扫描

- 无 TBD / TODO / 「稍后补充」
- 每个改动代码的步骤都给出了完整代码块；UI 组件（Task 7–11）给了整文件或"整段替换 + 精确插入位置"
- Task 7 的 `WeekView` / `MonthView` 占位实现明确标注了被 Task 8 / Task 9整体替换，属于可编译的中间态而非 TODO
- 所有命令都带 Run/Expected

### 3. 类型一致性核对

| 名字 | 定义处 | 消费处 | 一致 |
|---|---|---|---|
| `Occurrence{eventId,title,date,startAt,endAt,allDay,location,note,remindMinutes}` | Task 3 `types.ts` | recur / layout / reminders / interop / 组件 | ✅ |
| `Event{...all_day, repeat_type, repeat_interval, repeat_until, remind_minutes}` | Task 3 `types.ts` | Task 2 SQL 列名与之逐字段对应 | ✅ |
| `EventInput`（camelCase） | Task 3 | events.ts / EventDialog / preload | ✅ |
| `syncEventTasks(db, date)` | Task 5 | Task 6 `tasks:list`、`interop:syncDates` | ✅ |
| `convertTaskToEvent(db, taskId, input)` | Task 5 | Task 6 `interop:convertTask`、Task 10 store | ✅ |
| `ConvertInput{startAt,endAt,...}` vs 渲染端 `ConvertTaskInput` | Task 5 / Task 6 | 字段同名同型 | ✅ |
| `SettingsKey` / `Settings` | Task 6 `shared/settings.ts` | main `db/settings.ts` re-export、renderer `lib/ipc.ts`、settingsStore | ✅ |
| `layoutWeek` 返回 `{days, allDay, blocks}` | Task 8 `layout.ts` | Task 8 `WeekView` | ✅ |
| `layoutMonth` 返回 `MonthCell[]` | Task 8 `layout.ts` | Task 9 `MonthView` | ✅ |
| `dueReminders(now, occurrences, fired)` | Task 12 `shared/reminders.ts` | Task 12 `main/reminders.ts` | ✅ |
| `LongTask.done` | Task 2 类型 + SQL | Task 11 store / TimelineBar / 既有夹具 | ✅（`tests/timeline.test.ts` 已在 Task 2 同步补 `done:false`） |
| IPC 通道名 | Task 6（9 个）+ Task 11（4 个） | main/ipc.ts、preload、renderer/lib/ipc.ts 三处逐一对应 | ✅ |

### 4. 执行顺序与依赖

```
Task 1（数据安全）
   └─► Task 2（迁移 + events 表）
          └─► Task 3（纯函数：dates/recur）
                 └─► Task 4（events 数据层）
                        └─► Task 5（互通）
                               └─► Task 6（settings + IPC）
                                      ├─► Task 7（日程页框架 + 编辑器）
                                      │      ├─► Task 8（布局 + 周视图）
                                      │      │      └─► Task 9（月视图）
                                      │      └─► Task 10（互通 UI）
                                      └─► Task 11（时间轴增强 + 标记接口）
                                             └─► Task 12（系统通知）
                                                    └─► Task 13（验收 + 打包）
```

Task 1 与 Task 2 都改启动路径但文件不重叠（`backup.ts` / `db/index.ts`）；Task 6 与 Task 11 都要动 `main/ipc.ts`、`preload/index.ts`、`renderer/lib/ipc.ts` 三个文件，必须**串行执行**，Task 11 只在 Task 6 的基础上追加。

