# M3-3 设计灵感模块 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付「设计灵感」模块：三合一捕获（贴图 / 写文字 / 贴链接）、瀑布流混排、⭐精选与标签与关键词筛选、画板视图（封面=画板内最新图片、灵感条数），以及**渲染进程全程不接触文件系统**的图片存储。

**Architecture:** 图片由主进程写入 `%APPDATA%\LifeOS\images\`（UUID 命名），渲染进程只发送字节与 MIME，**从不提供路径**。图片回显走自定义协议 `lifeos-image://local/<filename>`——因为现有 CSP 是 `img-src 'self' data:`，`file://` 与自定义协议默认都会被拦截，必须显式放行。瀑布流的列分配是纯函数，不依赖 DOM 测量。

**Tech Stack:** Electron 44 + electron-vite + React 18 + TypeScript + Tailwind + Zustand + `node:sqlite` + Vitest

## Global Constraints

- 数据目录 `%APPDATA%\LifeOS\`（`app.db` + `images/` + `backups/`）
- 渲染进程禁止直接访问数据库与文件系统；一切读写经 IPC 到主进程
- 多步写入必须包在 SQLite 事务中，失败回滚
- 深色色板：底色 `#1e1f24`、卡片 `#26272e`、描边 `#3a3b45`、强调 `#7c8cff`、正文 `#e4e4e7`、次要 `#8b8d98`；**设计灵感模块色 `#e879c9`**
- 日期 `YYYY-MM-DD`，日期时间 `YYYY-MM-DD HH:MM`（本地时区）
- **不得修改已发布的 v1–v4 迁移**，本次新增 v5
- 提交前固定顺序：`npm test` → `npm run typecheck` → commit
- 起点基线：24 个测试文件 / 407 用例全绿，`typecheck` 0 错误
- 复用既有底座：`assertNonEmpty`、`formatIpcError`、`parseTags` 的容错思路、`isMarkedFrom`（把 `'learning'` 换成 `'inspiration'`）、`filterSnippets` 的筛选语义

## 安全约束（本模块新增，必须守住）

1. **渲染进程永不提供文件路径**：只发 `ArrayBuffer` + MIME，文件名由主进程用 `randomUUID()` 生成
2. **图片名白名单**：只接受 `^[0-9a-f-]{36}\.(png|jpg|jpeg|gif|webp)$`；协议处理器还要二次确认解析后的绝对路径的父目录就是 `images/`（防路径穿越）
3. **MIME 白名单**：只允许 `image/png` / `image/jpeg` / `image/gif` / `image/webp`
4. **单张图片大小上限**：8 MB，超限拒绝并回 `图片过大（最大 8 MB）`
5. **CSP 必须放行 `lifeos-image:`**，否则图片一律被拦截

---

### Task 1: 迁移 v5（两张灵感表）+ 共享类型

**Files:**
- Modify: `src/main/db/index.ts`（`MIGRATIONS` 追加 v5）
- Modify: `src/shared/types.ts`（追加灵感类型）
- Test: `tests/migrate.test.ts`（追加用例）

**Interfaces:**
- Produces:
  - `inspiration_boards`：`id, name, created_at, updated_at`
  - `inspirations`：`id, board_id, text, image_path, source_url, starred, tags, created_at, updated_at`
  - `LATEST_VERSION` 变为 **5**
  - 类型 `Inspiration` / `InspirationBoard` / `InspirationInput` / `InspirationPatch` / `BoardInput` / `BoardPatch` / `CaptureKind`

- [ ] **Step 1: 追加失败测试到 `tests/migrate.test.ts` 末尾**

```ts
describe('灵感模块迁移 v5', () => {
  it('新库含两张灵感表', () => {
    const db = openDb(dbFile)
    expect(version(db)).toBe(LATEST_VERSION)
    expect(columns(db, 'inspiration_boards')).toEqual(['id', 'name', 'created_at', 'updated_at'])
    expect(columns(db, 'inspirations')).toContain('board_id')
    expect(columns(db, 'inspirations')).toContain('image_path')
    expect(columns(db, 'inspirations')).toContain('source_url')
    expect(columns(db, 'inspirations')).toContain('starred')
    expect(columns(db, 'inspirations')).toContain('tags')
    db.close()
  })

  it('v4 老库能平滑升级到 v5 且开发数据保留', () => {
    const raw = openDb(dbFile)
    raw.exec('DROP TABLE inspirations')
    raw.exec('DROP TABLE inspiration_boards')
    raw.exec('PRAGMA user_version = 4')
    raw.prepare("INSERT INTO projects (name) VALUES ('M3-2 老项目')").run()
    raw.close()

    const db = openDb(dbFile)
    expect(version(db)).toBe(LATEST_VERSION)
    expect(columns(db, 'inspirations')).toContain('starred')
    expect(db.prepare('SELECT COUNT(*) c FROM projects').get()).toEqual({ c: 1 })
    db.close()
  })

  it('删除画板时灵感保留，只解除归属', () => {
    const db = openDb(dbFile)
    db.prepare("INSERT INTO inspiration_boards (name) VALUES ('配色')").run()
    const bid = (db.prepare('SELECT id FROM inspiration_boards').get() as { id: number }).id
    db.prepare("INSERT INTO inspirations (board_id, text) VALUES (?, '一条灵感')").run(bid)

    db.prepare('DELETE FROM inspiration_boards WHERE id = ?').run(bid)
    const row = db.prepare('SELECT text, board_id FROM inspirations').get() as { text: string; board_id: number | null }
    expect(row.text).toBe('一条灵感')
    expect(row.board_id).toBeNull()
    db.close()
  })

  it('starred 默认 0、tags 默认空数组文本', () => {
    const db = openDb(dbFile)
    db.prepare("INSERT INTO inspirations (text) VALUES ('x')").run()
    const row = db.prepare('SELECT starred, tags, image_path, source_url FROM inspirations').get() as
      { starred: number; tags: string; image_path: string | null; source_url: string | null }
    expect(row).toEqual({ starred: 0, tags: '[]', image_path: null, source_url: null })
    db.close()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/migrate.test.ts`
Expected: FAIL —— `no such table: inspiration_boards`

- [ ] **Step 3: 在 `MIGRATIONS` 末尾追加 v5**

```ts
  {
    // v5 —— M3-3：设计灵感（画板 + 灵感条目）
    version: 5,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS inspiration_boards (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS inspirations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          board_id INTEGER REFERENCES inspiration_boards(id) ON DELETE SET NULL,
          text TEXT NOT NULL DEFAULT '',
          image_path TEXT,
          source_url TEXT,
          starred INTEGER NOT NULL DEFAULT 0,
          tags TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE INDEX IF NOT EXISTS idx_inspirations_board ON inspirations(board_id);
        CREATE INDEX IF NOT EXISTS idx_inspirations_starred ON inspirations(starred);
      `)
    }
  }
```

- [ ] **Step 4: 在 `src/shared/types.ts` 末尾追加类型**

```ts
// ---------- M3-3 设计灵感 ----------

export type CaptureKind = 'image' | 'text' | 'link'

export interface InspirationBoard {
  id: number
  name: string
  created_at: string
  updated_at: string
}

export interface Inspiration {
  id: number
  board_id: number | null
  text: string
  /** 图片文件名（仅文件名，不含目录）；由主进程生成 */
  image_path: string | null
  source_url: string | null
  starred: boolean
  tags: string[]
  created_at: string
  updated_at: string
}

export interface InspirationInput {
  text?: string
  boardId?: number | null
  sourceUrl?: string | null
  starred?: boolean
  tags?: string[]
  /** 仅供主进程在保存图片后内部使用，渲染进程不得提供 */
  imagePath?: string | null
}
export type InspirationPatch = Partial<InspirationInput>

export interface BoardInput { name: string }
export type BoardPatch = Partial<BoardInput>

/** 三合一捕获的入参：图片以字节传输，渲染进程不给路径 */
export interface CaptureInput {
  kind: CaptureKind
  text?: string
  sourceUrl?: string
  boardId?: number | null
  tags?: string[]
  imageBytes?: Uint8Array
  imageMime?: string
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test`
Expected: PASS —— `tests/migrate.test.ts` 18 个用例通过，其余不回归

- [ ] **Step 6: Commit**

```bash
git add src/main/db/index.ts src/shared/types.ts tests/migrate.test.ts
git commit -m "feat(M3-3): 迁移 v5 两张灵感表 + 共享类型（+4 测试）"
```

---

### Task 2: 图片存储层 + 路径安全纯函数

**Files:**
- Create: `src/shared/imageName.ts`（纯函数：扩展名映射、文件名白名单、UTF-8 字节转 base64 之外的工具）
- Create: `src/main/images.ts`（写盘 / 删除 / 协议注册）
- Test: `tests/imageName.test.ts`

**Interfaces:**
- Produces（`@shared/imageName`）：
  - `IMAGE_MIME_EXT: Record<string, string>`（png/jpeg/gif/webp）
  - `ALLOWED_MIMES: readonly string[]`
  - `MAX_IMAGE_BYTES = 8 * 1024 * 1024`
  - `extFromMime(mime: string): string | null`
  - `isAllowedImageName(name: string): boolean`
  - `buildImageName(uuid: string, ext: string): string`
  - `imageUrl(name: string): string`（渲染端拼接 `lifeos-image://local/<name>`）
  - `assessImage(bytes: Uint8Array, mime: string): { ok: true; ext: string } | { ok: false; reason: string }`
- Produces（`./images`）：
  - `IMAGE_SCHEME = 'lifeos-image'`
  - `imagesDir(): string`
  - `registerImageScheme(): void`（app ready **之前**调用）
  - `registerImageProtocol(): void`（app ready **之后**调用）
  - `saveImageFile(bytes: Uint8Array, mime: string): string`（返回文件名）
  - `deleteImageFile(name: string | null): void`（容错：文件不存在不算错）
  - `resolveImagePath(name: string): string | null`（白名单 + 目录归属双重校验）

**锁定的行为契约：**
1. `extFromMime` 只认 4 种图片 MIME，其余返回 `null`
2. `isAllowedImageName` 只接受 `UUID.ext` 形式的小写十六进制文件名——**不含路径分隔符、不含 `..`**
3. `resolveImagePath` 在 `isAllowedImageName` 通过后，还要确认 `path.dirname(path.resolve(imagesDir(), name)) === path.resolve(imagesDir())`，否则返回 `null`
4. `assessImage` 依次检查：MIME 允许 → 字节长度 ≤ 8 MB 且 > 0 → 返回扩展名；失败给出**中文原因**
5. `deleteImageFile(null)` 与文件不存在都不抛错（记录已删就该成功）

- [ ] **Step 1: 写失败测试 `tests/imageName.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import {
  ALLOWED_MIMES, MAX_IMAGE_BYTES, assessImage, buildImageName, extFromMime,
  imageUrl, isAllowedImageName
} from '../src/shared/imageName'

const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'

describe('extFromMime', () => {
  it('四种图片 MIME 各自映射到扩展名', () => {
    expect(extFromMime('image/png')).toBe('png')
    expect(extFromMime('image/jpeg')).toBe('jpg')
    expect(extFromMime('image/gif')).toBe('gif')
    expect(extFromMime('image/webp')).toBe('webp')
  })
  it('非图片 MIME 返回 null', () => {
    expect(extFromMime('image/svg+xml')).toBeNull()
    expect(extFromMime('application/pdf')).toBeNull()
    expect(extFromMime('')).toBeNull()
  })
  it('允许清单与映射表一致', () => {
    expect([...ALLOWED_MIMES].sort()).toEqual(['image/gif', 'image/jpeg', 'image/png', 'image/webp'])
  })
})

describe('buildImageName', () => {
  it('拼成 uuid.ext', () => {
    expect(buildImageName(UUID, 'png')).toBe(`${UUID}.png`)
  })
})

describe('isAllowedImageName', () => {
  it('接受合法的 uuid.扩展名', () => {
    for (const ext of ['png', 'jpg', 'jpeg', 'gif', 'webp']) {
      expect(isAllowedImageName(`${UUID}.${ext}`)).toBe(true)
    }
  })
  it('拒绝路径穿越', () => {
    expect(isAllowedImageName('../secret.png')).toBe(false)
    expect(isAllowedImageName(`..\\${UUID}.png`)).toBe(false)
    expect(isAllowedImageName(`sub/${UUID}.png`)).toBe(false)
    expect(isAllowedImageName('C:\\Windows\\x.png')).toBe(false)
  })
  it('拒绝非 UUID 名与非法扩展名', () => {
    expect(isAllowedImageName('hello.png')).toBe(false)
    expect(isAllowedImageName(`${UUID}.svg`)).toBe(false)
    expect(isAllowedImageName(`${UUID}.png.exe`)).toBe(false)
    expect(isAllowedImageName('')).toBe(false)
  })
  it('拒绝大写十六进制（生成端一律小写）', () => {
    expect(isAllowedImageName(`${UUID.toUpperCase()}.png`)).toBe(false)
  })
})

describe('assessImage', () => {
  const bytes = new Uint8Array([1, 2, 3])

  it('合法图片返回扩展名', () => {
    expect(assessImage(bytes, 'image/png')).toEqual({ ok: true, ext: 'png' })
  })
  it('不支持的 MIME 被拒绝', () => {
    const r = assessImage(bytes, 'image/svg+xml')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('格式')
  })
  it('空字节被拒绝', () => {
    const r = assessImage(new Uint8Array(0), 'image/png')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('空')
  })
  it('超过 8 MB 被拒绝', () => {
    const r = assessImage(new Uint8Array(MAX_IMAGE_BYTES + 1), 'image/png')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('8 MB')
  })
  it('恰好 8 MB 通过', () => {
    expect(assessImage(new Uint8Array(MAX_IMAGE_BYTES), 'image/png').ok).toBe(true)
  })
})

describe('imageUrl', () => {
  it('拼成自定义协议 URL', () => {
    expect(imageUrl(`${UUID}.png`)).toBe(`lifeos-image://local/${UUID}.png`)
  })
  it('对文件名做 URL 编码', () => {
    expect(imageUrl('a b.png')).toContain('a%20b.png')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/imageName.test.ts`
Expected: FAIL —— `Failed to resolve import "../src/shared/imageName"`

- [ ] **Step 3: 实现 `src/shared/imageName.ts`**

```ts
/** 图片文件名与 MIME 的纯函数：主进程与渲染进程共用，不依赖 fs 与 electron */

export const IMAGE_MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp'
}

export const ALLOWED_MIMES: readonly string[] = Object.keys(IMAGE_MIME_EXT)
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024

/** 只认 4 种图片 MIME */
export function extFromMime(mime: string): string | null {
  return IMAGE_MIME_EXT[mime] ?? null
}

/** 严格白名单：小写 UUID + 允许的扩展名；不含任何路径分隔符 */
const IMAGE_NAME_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|gif|webp)$/

export function isAllowedImageName(name: string): boolean {
  return IMAGE_NAME_RE.test(name)
}

export function buildImageName(uuid: string, ext: string): string {
  return `${uuid.toLowerCase()}.${ext.toLowerCase()}`
}

export function imageUrl(name: string): string {
  return `lifeos-image://local/${encodeURIComponent(name)}`
}

export type ImageAssessment = { ok: true; ext: string } | { ok: false; reason: string }

/** 依次校验 MIME → 非空 → 大小上限 */
export function assessImage(bytes: Uint8Array, mime: string): ImageAssessment {
  const ext = extFromMime(mime)
  if (!ext) return { ok: false, reason: `不支持的图片格式：${mime || '（空）'}` }
  if (bytes.length === 0) return { ok: false, reason: '图片内容为空' }
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, reason: '图片过大（最大 8 MB）' }
  return { ok: true, ext }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/imageName.test.ts`
Expected: PASS（13 个用例）

- [ ] **Step 5: 实现 `src/main/images.ts`**

```ts
import { app, net, protocol } from 'electron'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { assessImage, buildImageName, isAllowedImageName } from '@shared/imageName'

export const IMAGE_SCHEME = 'lifeos-image'

export function imagesDir(): string {
  return path.join(app.getPath('userData'), 'images')
}

/** 必须在 app ready 之前调用，否则 <img src="lifeos-image://..."> 会被拦截 */
export function registerImageScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: IMAGE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
  ])
}

/**
 * 双重校验后才允许读取：
 * 1. 文件名必须命中 UUID + 图片扩展名白名单
 * 2. 解析后的绝对路径的父目录必须正好是 images/
 */
export function resolveImagePath(name: string): string | null {
  if (!isAllowedImageName(name)) return null
  const dir = path.resolve(imagesDir())
  const full = path.resolve(dir, name)
  if (path.dirname(full) !== dir) return null
  return full
}

/** app ready 之后调用 */
export function registerImageProtocol(): void {
  fs.mkdirSync(imagesDir(), { recursive: true })

  protocol.handle(IMAGE_SCHEME, async (request) => {
    let name: string
    try {
      name = decodeURIComponent(new URL(request.url).pathname.replace(/^\/+/, ''))
    } catch {
      return new Response('bad request', { status: 400 })
    }
    const full = resolveImagePath(name)
    if (!full) return new Response('forbidden', { status: 403 })
    if (!fs.existsSync(full)) return new Response('not found', { status: 404 })
    return net.fetch(pathToFileURL(full).toString())
  })
}

/** 写入图片，返回**文件名**（不含目录） */
export function saveImageFile(bytes: Uint8Array, mime: string): string {
  const assessed = assessImage(bytes, mime)
  if (!assessed.ok) throw new Error(assessed.reason)

  fs.mkdirSync(imagesDir(), { recursive: true })
  const name = buildImageName(randomUUID(), assessed.ext)
  const full = resolveImagePath(name)!
  fs.writeFileSync(full, bytes)
  return name
}

/** 删除图片文件；null 与"文件已不存在"都不算错 */
export function deleteImageFile(name: string | null): void {
  if (!name) return
  const full = resolveImagePath(name)
  if (!full) return
  try {
    fs.unlinkSync(full)
  } catch {
    // 文件已被删除或不可访问：记录已经删了，不该因此让整个操作失败
  }
}
```

- [ ] **Step 6: 类型检查 + 全量测试**

Run: `npm run typecheck && npm test`
Expected: 0 错误；全部用例通过

- [ ] **Step 7: Commit**

```bash
git add src/shared/imageName.ts src/main/images.ts tests/imageName.test.ts
git commit -m "feat(M3-3): 图片存储层 + 文件名/MIME/大小安全校验纯函数（+13 测试）"
```

---

### Task 3: 灵感数据层（CRUD + 校验 + 画板）

**Files:**
- Create: `src/main/db/inspiration.ts`
- Test: `tests/inspiration.test.ts`

**Interfaces:**
- Consumes: `assertNonEmpty`（`./validate`）、`removeBySource`（`./longTasks`）
- Produces:
  - `listInspirations(db, filter?: InspirationFilter): Inspiration[]`（按 `id DESC`，最新在前）
  - `getInspiration(db, id): Inspiration | null`
  - `createInspiration(db, input: InspirationInput): Inspiration`
  - `updateInspiration(db, id, patch: InspirationPatch): Inspiration`
  - `setStarred(db, id, starred: boolean): Inspiration`
  - `deleteInspiration(db, id): string | null`（**返回被删记录的图片文件名**，由调用方删文件）
  - `listBoards(db): InspirationBoard[]` / `getBoard` / `createBoard` / `updateBoard` / `deleteBoard`
  - `boardStats(db): Map<number, { count: number; coverImage: string | null }>`
  - `listTags(db): string[]`（全部去重标签，供筛选条）

**锁定的行为契约：**
1. **至少要有一项内容**：`text` 去空白后非空，或 `image_path` 非空，或 `source_url` 非空；否则抛 `灵感内容不能为空`
2. `source_url` 非空时必须以 `http://` 或 `https://` 开头，否则抛 `来源链接必须以 http:// 或 https:// 开头`
3. `tags` 规范化：去空白、去空项、去重（与代码片段一致）
4. `starred` 在库里是 0/1，读出时转 boolean
5. **`deleteInspiration` 只删数据库记录**（含事务内清长期任务色块），返回图片文件名交给调用方；这样数据层完全不碰文件系统，可独立单测
6. `boardStats` 的 `coverImage` = 该画板内**最新一条有图片**的灵感图（`id DESC` 取第一条 `image_path IS NOT NULL`）
7. `deleteBoard` 不影响灵感条目（外键 `SET NULL`），只清掉该画板的长期任务色块（若有）

- [ ] **Step 1: 写失败测试 `tests/inspiration.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { openDb } from '../src/main/db'
import {
  listInspirations, getInspiration, createInspiration, updateInspiration, setStarred, deleteInspiration,
  listBoards, createBoard, updateBoard, deleteBoard, boardStats, listTags
} from '../src/main/db/inspiration'

let db: ReturnType<typeof openDb>
beforeEach(() => { db = openDb(':memory:') })

describe('灵感 CRUD', () => {
  it('纯文字灵感', () => {
    const i = createInspiration(db, { text: '深色配一点品红' })
    expect(i).toMatchObject({ text: '深色配一点品红', image_path: null, source_url: null, starred: false, tags: [], board_id: null })
  })

  it('图片灵感（imagePath 由主进程提供）', () => {
    const i = createInspiration(db, { imagePath: '3f2504e0-4f89-41d3-9a0c-0305e82c3301.png', tags: ['配色'] })
    expect(i.image_path).toBe('3f2504e0-4f89-41d3-9a0c-0305e82c3301.png')
    expect(i.tags).toEqual(['配色'])
  })

  it('链接灵感', () => {
    const i = createInspiration(db, { sourceUrl: 'https://dribbble.com/shots/1', text: '参考' })
    expect(i.source_url).toBe('https://dribbble.com/shots/1')
  })

  it('三项全空被拒绝', () => {
    expect(() => createInspiration(db, {})).toThrow('灵感内容不能为空')
    expect(() => createInspiration(db, { text: '   ' })).toThrow('灵感内容不能为空')
    expect(listInspirations(db)).toHaveLength(0)
  })

  it('来源链接必须是 http(s)', () => {
    expect(() => createInspiration(db, { sourceUrl: 'ftp://x.com/a' })).toThrow('http')
    expect(() => createInspiration(db, { sourceUrl: 'javascript:alert(1)' })).toThrow('http')
    expect(() => createInspiration(db, { sourceUrl: 'dribbble.com' })).toThrow('http')
  })

  it('标签规范化：去空、去重、去空白', () => {
    expect(createInspiration(db, { text: 'x', tags: [' a ', 'a', '', '  ', 'b'] }).tags).toEqual(['a', 'b'])
  })

  it('可归属画板', () => {
    const b = createBoard(db, { name: '配色' })
    expect(createInspiration(db, { text: 'x', boardId: b.id }).board_id).toBe(b.id)
  })

  it('归属不存在的画板被拒绝', () => {
    expect(() => createInspiration(db, { text: 'x', boardId: 999 })).toThrow('board 999 not found')
  })

  it('更新是合并语义，可把三项都清空以外', () => {
    const i = createInspiration(db, { text: '原标题' })
    expect(updateInspiration(db, i.id, { text: '新标题' }).text).toBe('新标题')
  })

  it('更新后三项全空被拒绝', () => {
    const i = createInspiration(db, { text: 'x' })
    const withImg = updateInspiration(db, i.id, { imagePath: '3f2504e0-4f89-41d3-9a0c-0305e82c3301.png' })
    expect(() => updateInspiration(db, withImg.id, { imagePath: null })).toThrow('灵感内容不能为空')
  })

  it('更新不存在的灵感报错', () => {
    expect(() => updateInspiration(db, 999, { text: 'x' })).toThrow('not found')
  })

  it('收藏切换', () => {
    const i = createInspiration(db, { text: 'x' })
    expect(i.starred).toBe(false)
    expect(setStarred(db, i.id, true).starred).toBe(true)
    expect(setStarred(db, i.id, false).starred).toBe(false)
  })

  it('删除返回图片文件名供调用方删文件', () => {
    const i = createInspiration(db, { imagePath: '3f2504e0-4f89-41d3-9a0c-0305e82c3301.png' })
    expect(deleteInspiration(db, i.id)).toBe('3f2504e0-4f89-41d3-9a0c-0305e82c3301.png')
    expect(getInspiration(db, i.id)).toBeNull()
  })

  it('删除纯文字灵感返回 null', () => {
    const i = createInspiration(db, { text: 'x' })
    expect(deleteInspiration(db, i.id)).toBeNull()
  })

  it('删除灵感会清掉它的长期任务色块', () => {
    const i = createInspiration(db, { text: 'x' })
    db.prepare(`
      INSERT INTO long_tasks (title, start_date, end_date, color, source_module, source_id)
      VALUES ('灵感', '2026-10-01', '2026-12-01', '#e879c9', 'inspiration', ?)
    `).run(i.id)
    deleteInspiration(db, i.id)
    expect(db.prepare('SELECT COUNT(*) c FROM long_tasks').get()).toEqual({ c: 0 })
  })

  it('列表按最新在前', () => {
    createInspiration(db, { text: '先' })
    createInspiration(db, { text: '后' })
    expect(listInspirations(db).map((i) => i.text)).toEqual(['后', '先'])
  })
})

describe('画板', () => {
  it('创建/更新/删除', () => {
    const b = createBoard(db, { name: '配色' })
    expect(updateBoard(db, b.id, { name: '配色方案' }).name).toBe('配色方案')
    deleteBoard(db, b.id)
    expect(listBoards(db)).toHaveLength(0)
  })

  it('名称为空被拒绝', () => {
    expect(() => createBoard(db, { name: '  ' })).toThrow('画板名称不能为空')
  })

  it('删除画板后灵感保留并解除归属', () => {
    const b = createBoard(db, { name: '配色' })
    const i = createInspiration(db, { text: 'x', boardId: b.id })
    deleteBoard(db, b.id)
    expect(getInspiration(db, i.id)!.board_id).toBeNull()
  })

  it('boardStats 统计条数并取最新图片作封面', () => {
    const b = createBoard(db, { name: '配色' })
    createInspiration(db, { text: '无图', boardId: b.id })
    createInspiration(db, { imagePath: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png', boardId: b.id })
    createInspiration(db, { imagePath: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png', boardId: b.id })
    const s = boardStats(db).get(b.id)!
    expect(s.count).toBe(3)
    expect(s.coverImage).toBe('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png')
  })

  it('空画板封面为 null', () => {
    const b = createBoard(db, { name: '空' })
    expect(boardStats(db).get(b.id)).toEqual({ count: 0, coverImage: null })
  })

  it('listTags 返回去重排序的全部标签', () => {
    createInspiration(db, { text: 'a', tags: ['配色', '排版'] })
    createInspiration(db, { text: 'b', tags: ['排版'] })
    expect(listTags(db)).toEqual(['排版', '配色'])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/inspiration.test.ts`
Expected: FAIL —— `Failed to resolve import "../src/main/db/inspiration"`

- [ ] **Step 3: 实现 `src/main/db/inspiration.ts`**

要点（完整实现，逐条对应上面的行为契约）：
- `rowToInspiration`：把 `starred` 由 0/1 转 boolean，`tags` 用 `parseTags`（复用 `@shared/snippetFilter`）解析
- `assertHasContent(text, imagePath, sourceUrl)`：三项至少一项非空
- `assertSourceUrl(url)`：非空时必须以 `http://` 或 `https://` 开头
- `createInspiration`：校验 → 归属画板存在性 → 插入
- `updateInspiration`：合并当前值后重新跑全部校验（**不能出现"改完变成三项全空"**）
- `deleteInspiration`：事务内 `DELETE` + `removeBySource(db, 'inspiration', id)`，**返回删除前的 `image_path`**
- `boardStats`：一条 SQL 取每个画板的条数，另一条按画板取 `MAX(id)` 且 `image_path IS NOT NULL` 的图片名
- `listTags`：遍历全部灵感的 tags 去重排序

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/inspiration.test.ts`
Expected: PASS（22 个用例）

- [ ] **Step 5: Commit**

```bash
git add src/main/db/inspiration.ts tests/inspiration.test.ts
git commit -m "feat(M3-3): 灵感数据层（CRUD/收藏/画板/标签 + 内容三选一校验）（+22 测试）"
```

---

### Task 4: 筛选与瀑布流纯函数

**Files:**
- Create: `src/shared/inspirationFilter.ts`
- Create: `src/shared/waterfall.ts`
- Test: `tests/inspirationFilter.test.ts`、`tests/waterfall.test.ts`

**Interfaces:**
- Produces（`@shared/inspirationFilter`）：
  - `interface InspirationFilter { starred?: boolean; boardId?: number | 'all'; tags?: string[]; keyword?: string }`
  - `filterInspirations(items: Inspiration[], filter: InspirationFilter): Inspiration[]`
- Produces（`@shared/waterfall`）：
  - `estimateCardHeight(item: Pick<Inspiration, 'image_path' | 'text'>): number`
  - `distributeColumns<T>(items: T[], columnCount: number, heightOf: (item: T) => number): T[][]`

**锁定的行为契约：**
1. `filterInspirations`：`starred: true` 只留精选、`false` 只留非精选、`undefined` 不过滤；`boardId` 为数字时只留该画板，`'all'` 或 `undefined` 不过滤；`tags` 为**全部命中**（AND）；`keyword` 对 **text / source_url / tags 拼接**做不区分大小写包含；条件为空白一律视为不过滤
2. `estimateCardHeight`：有图固定 `200`；无图按文字长度分档——`<=40` 字 `90`、`<=120` 字 `130`、更长 `170`（用于瀑布流列分配，不需要精确）
3. `distributeColumns`：**贪心最短列优先**，把每张卡放进当前累计高度最小的列；高度相同时选最左列（保证确定性）；`columnCount <= 0` 时返回 `[]`；不修改入参

- [ ] **Step 1: 写失败测试 `tests/inspirationFilter.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { filterInspirations } from '../src/shared/inspirationFilter'
import type { Inspiration } from '../src/shared/types'

const ins = (id: number, o: Partial<Inspiration> = {}): Inspiration => ({
  id, board_id: null, text: '', image_path: null, source_url: null,
  starred: false, tags: [], created_at: '', updated_at: '', ...o
})

const list = [
  ins(1, { text: '深色配色', tags: ['配色'], starred: true, board_id: 10 }),
  ins(2, { image_path: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png', tags: ['配色', '排版'], board_id: 10 }),
  ins(3, { source_url: 'https://dribbble.com/shots/9', text: '参考站', tags: ['排版'], board_id: 20 })
]

describe('filterInspirations', () => {
  it('无条件是全部', () => {
    expect(filterInspirations(list, {})).toHaveLength(3)
  })
  it('精选筛选', () => {
    expect(filterInspirations(list, { starred: true }).map((i) => i.id)).toEqual([1])
    expect(filterInspirations(list, { starred: false }).map((i) => i.id)).toEqual([2, 3])
  })
  it('画板筛选', () => {
    expect(filterInspirations(list, { boardId: 10 }).map((i) => i.id)).toEqual([1, 2])
    expect(filterInspirations(list, { boardId: 'all' })).toHaveLength(3)
  })
  it('标签为全部命中', () => {
    expect(filterInspirations(list, { tags: ['配色'] }).map((i) => i.id)).toEqual([1, 2])
    expect(filterInspirations(list, { tags: ['配色', '排版'] }).map((i) => i.id)).toEqual([2])
  })
  it('关键词命中文字 / 链接 / 标签', () => {
    expect(filterInspirations(list, { keyword: '深色' }).map((i) => i.id)).toEqual([1])
    expect(filterInspirations(list, { keyword: 'dribbble' }).map((i) => i.id)).toEqual([3])
    expect(filterInspirations(list, { keyword: '排版' }).map((i) => i.id)).toEqual([2, 3])
  })
  it('关键词不区分大小写', () => {
    expect(filterInspirations(list, { keyword: 'DRIBBBLE' }).map((i) => i.id)).toEqual([3])
  })
  it('空白关键词不过滤', () => {
    expect(filterInspirations(list, { keyword: '   ' })).toHaveLength(3)
  })
  it('条件组合取交集', () => {
    expect(filterInspirations(list, { boardId: 10, tags: ['排版'], starred: false }).map((i) => i.id)).toEqual([2])
  })
  it('无命中返回空数组', () => {
    expect(filterInspirations(list, { keyword: '不存在' })).toEqual([])
  })
  it('不修改入参', () => {
    const copy = JSON.parse(JSON.stringify(list))
    filterInspirations(list, { starred: true })
    expect(list).toEqual(copy)
  })
})
```

- [ ] **Step 2: 写失败测试 `tests/waterfall.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { distributeColumns, estimateCardHeight } from '../src/shared/waterfall'

describe('estimateCardHeight', () => {
  it('有图固定 200', () => {
    expect(estimateCardHeight({ image_path: 'x.png', text: '很短' })).toBe(200)
    expect(estimateCardHeight({ image_path: 'x.png', text: '' })).toBe(200)
  })
  it('无图按文字长度分档', () => {
    expect(estimateCardHeight({ image_path: null, text: '短' })).toBe(90)
    expect(estimateCardHeight({ image_path: null, text: 'a'.repeat(40) })).toBe(90)
    expect(estimateCardHeight({ image_path: null, text: 'a'.repeat(41) })).toBe(130)
    expect(estimateCardHeight({ image_path: null, text: 'a'.repeat(120) })).toBe(130)
    expect(estimateCardHeight({ image_path: null, text: 'a'.repeat(121) })).toBe(170)
  })
})

describe('distributeColumns', () => {
  const h = (n: number) => () => n

  it('按最短列优先分配', () => {
    // 高度 100,100,100 三张卡分到 2 列 → 第一张进列 0，第二张进列 1，第三张回列 0
    const cols = distributeColumns([1, 2, 3], 2, h(100))
    expect(cols[0]).toEqual([1, 3])
    expect(cols[1]).toEqual([2])
  })

  it('高度相同时选最左列（确定性）', () => {
    const cols = distributeColumns([1, 2], 2, h(50))
    expect(cols[0]).toEqual([1])
    expect(cols[1]).toEqual([2])
  })

  it('不等高时能把长卡分到较短的列', () => {
    const heights: Record<number, number> = { 1: 200, 2: 90, 3: 90 }
    const cols = distributeColumns([1, 2, 3], 2, (x: number) => heights[x])
    expect(cols[0]).toEqual([1])
    expect(cols[1]).toEqual([2, 3])
  })

  it('单列时全部进同一列', () => {
    expect(distributeColumns([1, 2, 3], 1, h(10))).toEqual([[1, 2, 3]])
  })

  it('列数为 0 或负数返回空数组', () => {
    expect(distributeColumns([1], 0, h(1))).toEqual([])
    expect(distributeColumns([1], -2, h(1))).toEqual([])
  })

  it('空输入返回对应数量的空列', () => {
    expect(distributeColumns([], 3, h(1))).toEqual([[], [], []])
  })

  it('不丢卡、不重复', () => {
    const cols = distributeColumns([1, 2, 3, 4, 5], 3, (x: number) => x * 10)
    const all = cols.flat().sort((a, b) => a - b)
    expect(all).toEqual([1, 2, 3, 4, 5])
  })

  it('不修改入参', () => {
    const items = [1, 2, 3]
    distributeColumns(items, 2, h(1))
    expect(items).toEqual([1, 2, 3])
  })
})
```

- [ ] **Step 3: 实现两个纯函数模块**

`src/shared/inspirationFilter.ts`：

```ts
import type { Inspiration } from './types'

export interface InspirationFilter {
  /** true 只看精选；false 只看非精选；undefined 不过滤 */
  starred?: boolean
  /** 数字只看该画板；'all' 或 undefined 不过滤 */
  boardId?: number | 'all'
  /** 全部命中（AND） */
  tags?: string[]
  /** 对 text / source_url / tags 拼接做不区分大小写包含 */
  keyword?: string
}

export function filterInspirations(items: Inspiration[], filter: InspirationFilter): Inspiration[] {
  const keyword = (filter.keyword ?? '').trim().toLowerCase()
  const tags = filter.tags ?? []

  return items.filter((it) => {
    if (filter.starred !== undefined && it.starred !== filter.starred) return false
    if (typeof filter.boardId === 'number' && it.board_id !== filter.boardId) return false
    for (const t of tags) if (!it.tags.includes(t)) return false
    if (keyword) {
      const haystack = `${it.text}\n${it.source_url ?? ''}\n${it.tags.join(' ')}`.toLowerCase()
      if (!haystack.includes(keyword)) return false
    }
    return true
  })
}
```

`src/shared/waterfall.ts`：

```ts
import type { Inspiration } from './types'

/** 瀑布流卡片高度估算：有图固定高度，无图按文字长度分档（不需精确，只用于列分配） */
export function estimateCardHeight(item: Pick<Inspiration, 'image_path' | 'text'>): number {
  if (item.image_path) return 200
  const len = item.text.length
  if (len <= 40) return 90
  if (len <= 120) return 130
  return 170
}

/**
 * 贪心最短列优先：每张卡放进当前累计高度最小的列，高度相同时选最左列（保证确定性）。
 * 不修改入参；columnCount <= 0 返回 []。
 */
export function distributeColumns<T>(
  items: T[],
  columnCount: number,
  heightOf: (item: T) => number
): T[][] {
  if (columnCount <= 0) return []
  const cols: T[][] = Array.from({ length: columnCount }, () => [])
  const heights = new Array<number>(columnCount).fill(0)

  for (const item of items) {
    let target = 0
    for (let i = 1; i < columnCount; i++) {
      if (heights[i] < heights[target]) target = i
    }
    cols[target].push(item)
    heights[target] += heightOf(item)
  }
  return cols
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/inspirationFilter.test.ts tests/waterfall.test.ts`
Expected: PASS（10 + 11 = 21 个用例）

- [ ] **Step 5: Commit**

```bash
git add src/shared/inspirationFilter.ts src/shared/waterfall.ts tests/inspirationFilter.test.ts tests/waterfall.test.ts
git commit -m "feat(M3-3): 灵感筛选与瀑布流列分配纯函数（+21 测试）"
```

---

### Task 5: 捕获编排（含孤儿文件防护）

**Files:**
- Create: `src/main/capture.ts`
- Test: `tests/capture.test.ts`

**Interfaces:**
- Consumes: `createInspiration`（`./db/inspiration`）、`CaptureInput`（`@shared/types`）
- Produces:
  - `interface ImageStore { save(bytes: Uint8Array, mime: string): string; remove(name: string | null): void }`
  - `capture(db, input: CaptureInput, store: ImageStore): Inspiration`

**锁定的行为契约：**
1. `kind: 'text'` / `'link'`：直接建记录，不碰 `store`
2. `kind: 'image'`：**先存文件、再建记录**；若建记录失败（校验不通过等），**必须删掉刚写入的文件**，避免孤儿文件
3. `kind: 'image'` 但没给 `imageBytes` → 抛 `图片内容为空`
4. 依赖 `ImageStore` 注入而不是直接调 `saveImageFile`，这样数据层可以在**不接触真实文件系统**的前提下被测试

- [ ] **Step 1: 写失败测试 `tests/capture.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { openDb } from '../src/main/db'
import { capture, type ImageStore } from '../src/main/capture'
import { listInspirations } from '../src/main/db/inspiration'

let db: ReturnType<typeof openDb>
let saved: { bytes: Uint8Array; mime: string }[]
let removed: (string | null)[]
let store: ImageStore

beforeEach(() => {
  db = openDb(':memory:')
  saved = []
  removed = []
  store = {
    save: (bytes, mime) => {
      saved.push({ bytes, mime })
      return '3f2504e0-4f89-41d3-9a0c-0305e82c3301.png'
    },
    remove: (name) => { removed.push(name) }
  }
})

describe('capture', () => {
  it('文字捕获不碰文件存储', () => {
    const i = capture(db, { kind: 'text', text: '一条灵感' }, store)
    expect(i.text).toBe('一条灵感')
    expect(saved).toHaveLength(0)
    expect(removed).toHaveLength(0)
  })

  it('链接捕获', () => {
    const i = capture(db, { kind: 'link', sourceUrl: 'https://example.com', text: '看这个' }, store)
    expect(i.source_url).toBe('https://example.com')
    expect(saved).toHaveLength(0)
  })

  it('图片捕获：先存文件再落库，记录里是返回的文件名', () => {
    const bytes = new Uint8Array([1, 2, 3])
    const i = capture(db, { kind: 'image', imageBytes: bytes, imageMime: 'image/png', text: '配色参考' }, store)
    expect(saved).toEqual([{ bytes, mime: 'image/png' }])
    expect(i.image_path).toBe('3f2504e0-4f89-41d3-9a0c-0305e82c3301.png')
    expect(i.text).toBe('配色参考')
  })

  it('图片捕获可以带标签与画板', () => {
    const i = capture(db, {
      kind: 'image', imageBytes: new Uint8Array([1]), imageMime: 'image/jpeg', tags: ['配色', '配色', '排版']
    }, store)
    expect(i.tags).toEqual(['配色', '排版'])
  })

  it('图片捕获缺字节被拒绝，且不写文件', () => {
    expect(() => capture(db, { kind: 'image', imageMime: 'image/png' }, store)).toThrow('图片内容为空')
    expect(saved).toHaveLength(0)
  })

  it('落库失败时删掉刚写的文件（防孤儿文件）', () => {
    // 链接非法 → createInspiration 会抛错
    expect(() => capture(db, {
      kind: 'image', imageBytes: new Uint8Array([1]), imageMime: 'image/png', sourceUrl: 'ftp://x'
    }, store)).toThrow('http')
    expect(saved).toHaveLength(1)
    expect(removed).toEqual(['3f2504e0-4f89-41d3-9a0c-0305e82c3301.png'])
    expect(listInspirations(db)).toHaveLength(0)
  })

  it('存储层自身报错时向上传递，不尝试删文件', () => {
    const bad: ImageStore = {
      save: () => { throw new Error('不支持的图片格式：image/svg+xml') },
      remove: (n) => { removed.push(n) }
    }
    expect(() => capture(db, { kind: 'image', imageBytes: new Uint8Array([1]), imageMime: 'image/svg+xml' }, bad))
      .toThrow('不支持的图片格式')
    expect(removed).toHaveLength(0)
  })

  it('文字捕获落库失败不会误删文件', () => {
    expect(() => capture(db, { kind: 'text', text: '   ' }, store)).toThrow('灵感内容不能为空')
    expect(removed).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 实现 `src/main/capture.ts`**

```ts
import type { DatabaseSync } from 'node:sqlite'
import type { CaptureInput, Inspiration } from '@shared/types'
import { createInspiration } from './db/inspiration'

/** 注入式图片存储，便于在不接触真实文件系统的前提下测试编排逻辑 */
export interface ImageStore {
  save(bytes: Uint8Array, mime: string): string
  remove(name: string | null): void
}

export function capture(db: DatabaseSync, input: CaptureInput, store: ImageStore): Inspiration {
  if (input.kind !== 'image') {
    return createInspiration(db, {
      text: input.text ?? '',
      sourceUrl: input.sourceUrl ?? null,
      boardId: input.boardId ?? null,
      tags: input.tags ?? []
    })
  }

  if (!input.imageBytes || input.imageBytes.length === 0) throw new Error('图片内容为空')

  // 先写文件（存储层负责 MIME/大小校验），再落库
  const name = store.save(input.imageBytes, input.imageMime ?? '')
  try {
    return createInspiration(db, {
      text: input.text ?? '',
      sourceUrl: input.sourceUrl ?? null,
      boardId: input.boardId ?? null,
      tags: input.tags ?? [],
      imagePath: name
    })
  } catch (err) {
    // 落库失败必须回收刚写入的图片，否则会留下无人引用的孤儿文件
    store.remove(name)
    throw err
  }
}
```

- [ ] **Step 3: 运行测试确认通过**

Run: `npm test -- tests/capture.test.ts`
Expected: PASS（8 个用例）

- [ ] **Step 4: Commit**

```bash
git add src/main/capture.ts tests/capture.test.ts
git commit -m "feat(M3-3): 三合一捕获编排 + 孤儿文件防护（失败自动回收）（+8 测试）"
```

---

### Task 6: IPC（含图片协议注册与 CSP 放行）

**Files:**
- Modify: `src/main/index.ts`（注册协议 scheme 与 handler）
- Modify: `src/renderer/index.html`（CSP 放行 `lifeos-image:`）
- Modify: `src/main/ipc.ts`、`src/preload/index.ts`、`src/renderer/src/lib/ipc.ts`

**Interfaces:**
- Produces（21 条新通道）：

```
insp:list / insp:get / insp:capture / insp:update / insp:delete / insp:setStarred
insp:listTags / insp:listBoards / insp:createBoard / insp:updateBoard / insp:deleteBoard / insp:boardStats
```

- `window.lifeos.insp` 命名空间

- [ ] **Step 1: `src/main/index.ts` 接入协议**

在文件顶部（`app.whenReady()` **之前**）调用 `registerImageScheme()`；在 ready 回调里、创建窗口之前调用 `registerImageProtocol()`。

```ts
import { registerImageScheme, registerImageProtocol, deleteImageFile } from './images'
// ...
registerImageScheme()   // 必须在 app ready 之前
```

并在 `app.whenReady().then(...)` 内最先执行：

```ts
  registerImageProtocol()  // 必须在窗口加载前
```

- [ ] **Step 2: `src/renderer/index.html` 放行自定义协议**

```html
content="default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: lifeos-image:"
```

> 不放行的话，`<img src="lifeos-image://...">` 会被 CSP 一律拦截，且**不会报错到控制台之外**——表现为图片全部空白。

- [ ] **Step 3: `src/main/ipc.ts` 追加通道**

```ts
  // ---------- M3-3 设计灵感 ----------
  ipcMain.handle('insp:list', (_e, filter?: insp.InspirationFilter) => insp.listInspirations(db, filter))
  ipcMain.handle('insp:get', (_e, id: number) => insp.getInspiration(db, id))
  ipcMain.handle('insp:capture', (_e, input: CaptureInput) =>
    capture(db, input, { save: saveImageFile, remove: deleteImageFile }))
  ipcMain.handle('insp:update', (_e, id: number, patch: insp.InspirationPatch) => insp.updateInspiration(db, id, patch))
  ipcMain.handle('insp:delete', (_e, id: number) => {
    // 先删记录（事务），提交成功后再删文件；避免"文件没了但记录还在"
    const imageName = insp.deleteInspiration(db, id)
    deleteImageFile(imageName)
  })
  ipcMain.handle('insp:setStarred', (_e, id: number, starred: boolean) => insp.setStarred(db, id, starred))
  ipcMain.handle('insp:listTags', () => insp.listTags(db))
  ipcMain.handle('insp:listBoards', () => insp.listBoards(db))
  ipcMain.handle('insp:createBoard', (_e, input: insp.BoardInput) => insp.createBoard(db, input))
  ipcMain.handle('insp:updateBoard', (_e, id: number, patch: insp.BoardPatch) => insp.updateBoard(db, id, patch))
  ipcMain.handle('insp:deleteBoard', (_e, id: number) => insp.deleteBoard(db, id))
  ipcMain.handle('insp:boardStats', () => [...insp.boardStats(db).entries()])
```

- [ ] **Step 4: preload 与渲染端契约**

按上述通道逐个包装；渲染端类型：

```ts
  insp: {
    list(filter?: InspirationFilter): Promise<Inspiration[]>
    get(id: number): Promise<Inspiration | null>
    capture(input: CaptureInput): Promise<Inspiration>
    update(id: number, patch: InspirationPatch): Promise<Inspiration>
    remove(id: number): Promise<void>
    setStarred(id: number, starred: boolean): Promise<Inspiration>
    listTags(): Promise<string[]>
    listBoards(): Promise<InspirationBoard[]>
    createBoard(input: BoardInput): Promise<InspirationBoard>
    updateBoard(id: number, patch: BoardPatch): Promise<InspirationBoard>
    removeBoard(id: number): Promise<void>
    boardStats(): Promise<[number, { count: number; coverImage: string | null }][]>
  }
```

> `CaptureInput.imageBytes` 经 `contextBridge` 传输为 `Uint8Array`；主进程侧收到后可直接交给 `fs.writeFileSync`。

- [ ] **Step 5: 三处一致性核对 + 类型检查 + 全量测试**

Run: `npm run typecheck && npm test`
Expected: 0 错误；全部用例通过；main / preload / renderer 三处通道名集合一致

- [ ] **Step 6: 手动确认协议可用**

Run: `npm run build && 启动应用（清空 ELECTRON_RUN_AS_NODE）`
在渲染页控制台执行：`document.querySelector('img[src^="lifeos-image"]')` 应能找到元素且 `naturalWidth > 0`。

- [ ] **Step 7: Commit**

```bash
git add src/main/index.ts src/main/ipc.ts src/preload/index.ts src/renderer/src/lib/ipc.ts src/renderer/index.html
git commit -m "feat(M3-3): 灵感 IPC（12 通道）+ 图片自定义协议注册 + CSP 放行 lifeos-image"
```

---

### Task 7: 渲染端 store + 图片 URL 工具

**Files:**
- Create: `src/renderer/src/stores/inspStore.ts`
- Test: `tests/imageUrl.test.ts`（对 `@shared/imageName` 的 `imageUrl` 已有覆盖，此处补渲染端拼装）

**Interfaces:**
- Produces: `useInspStore`：`{ items, boards, boardStats, tags, filter, view, selectedBoardId, error, loading, setFilter, setView, selectBoard, load, refresh, capture, update, remove, toggleStar, createBoard, updateBoard, removeBoard, clearError }`

**锁定的行为契约：**
1. `load()` 并发拉取 `list`（带当前 filter）/ `listBoards` / `boardStats` / `listTags`
2. `setFilter` 后立即重新拉取列表（筛选在主进程用 SQL + 纯函数完成，保证与测试口径一致）
3. `view` 为 `'flow' | 'boards'`；进入某个画板时 `selectedBoardId` 非空且 `filter.boardId` 同步为该画板
4. `remove` 成功后同时刷新列表、画板统计与标签

- [ ] **Step 1: 实现 `inspStore.ts`**（结构照搬 `devStore` 的 `run()` 错误包装模式）

- [ ] **Step 2: 类型检查**

Run: `npm run typecheck`
Expected: 0 错误

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/stores/inspStore.ts
git commit -m "feat(M3-3): 灵感 store（列表/画板/标签/筛选状态）"
```

---

### Task 8: 灵感页骨架 —— 瀑布流 + 筛选条

**Files:**
- Create: `src/renderer/src/components/inspiration/InspirationPage.tsx`
- Create: `src/renderer/src/components/inspiration/WaterfallGrid.tsx`
- Create: `src/renderer/src/components/inspiration/InspirationCard.tsx`
- Modify: `src/renderer/src/components/layout/Sidebar.tsx`、`src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `distributeColumns` / `estimateCardHeight`、`imageUrl`
- Produces: `InspirationPage`、`WaterfallGrid({ items, columns })`、`InspirationCard({ item })`

**锁定的行为契约：**
1. 列数按容器宽度自适应：`< 640 → 2 列，< 1024 → 3 列，否则 4 列`
2. 顶部筛选条：`全部 | ⭐精选 | 标签多选 | 搜索框`，以及「画板」切换
3. 图片卡：`<img src={imageUrl(item.image_path)}>`，`⭐` 角标，`🔗` 来源提示，画板名
4. 文字卡：正文 + 标签 chip
5. 点卡片打开编辑；卡片右上角 ⭐ 可直接切换收藏

- [ ] **Step 1–3: 实现三个组件并接线 Sidebar / App**（去掉 `inspiration` 的 disabled，`App.tsx` 增加 `case 'inspiration'`）

- [ ] **Step 4: CDP 界面验证**

断言：
1. 侧边栏「设计灵感」可进入
2. 空状态显示引导文案
3. 文字捕获后卡片出现在瀑布流
4. ⭐ 切换后「精选」筛选能筛到
5. 标签 chip 筛选生效

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/inspiration src/renderer/src/components/layout/Sidebar.tsx src/renderer/src/App.tsx
git commit -m "feat(M3-3): 灵感页骨架（自适应瀑布流 + 筛选条 + 卡片）"
```

---

### Task 9: 捕获弹窗（贴图 / 写文字 / 贴链接）

**Files:**
- Create: `src/renderer/src/components/inspiration/CaptureDialog.tsx`
- Modify: `src/renderer/src/components/inspiration/InspirationPage.tsx`

**Interfaces:**
- Produces: `CaptureDialog({ open, onClose })`

**锁定的行为契约：**
1. 三页签：**贴图 / 写文字 / 贴链接**
2. 贴图支持**粘贴**（监听 `paste` 事件的 `clipboardData.items`）与**选择文件**（`<input type="file" accept="image/*">`）；选中后显示预览
3. 提交时把图片读成 `Uint8Array`（`await file.arrayBuffer()` → `new Uint8Array(buf)`）连同 MIME 一起发给主进程；**渲染进程不生成任何路径**
4. 可同时填文字与标签；链接页签校验 `http(s)://` 前缀并在前端给出提示
5. 主进程返回的错误（格式不支持 / 过大）原样显示，不静默失败

- [ ] **Step 1: 实现 `CaptureDialog.tsx`**

- [ ] **Step 2: 接入页面顶部的「＋捕获」按钮**

- [ ] **Step 3: CDP 界面验证**

断言：
1. 点「＋捕获」弹出弹窗，三个页签可切换
2. 写文字 → 保存 → 卡片出现在瀑布流
3. 贴链接（合法 URL）→ 保存 → 卡片出现且显示来源
4. 贴链接（`ftp://`）→ 显示错误且不关闭弹窗
5. **贴图**：用 `DataTransfer` 构造一个 1×1 PNG 的 `File`，通过 `input.files` + `change` 事件走选择文件路径 → 保存 → 卡片出现且 `<img>` 的 `naturalWidth > 0`（**这是自定义协议与 CSP 放行的真实证据**）

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/inspiration/CaptureDialog.tsx src/renderer/src/components/inspiration/InspirationPage.tsx
git commit -m "feat(M3-3): 三合一捕获弹窗（贴图/文字/链接，图片走字节传输）"
```

---

### Task 10: 画板视图 + 卡片操作（编辑 / 删除同步删文件）

**Files:**
- Create: `src/renderer/src/components/inspiration/BoardView.tsx`
- Create: `src/renderer/src/components/inspiration/InspirationEditDialog.tsx`
- Modify: `src/renderer/src/components/inspiration/InspirationPage.tsx`

**Interfaces:**
- Produces: `BoardView`、`InspirationEditDialog({ item, onClose })`

**锁定的行为契约：**
1. 画板视图：卡片显示封面（`coverImage` 的 `imageUrl`，无封面用色块占位）、名称、灵感条数；点进去看该画板的瀑布流
2. 编辑弹窗：改文字 / 链接 / 标签 / 归属画板；**三项不能同时清空**（主进程会拒绝，前端提示）
3. 删除灵感：先确认，删除后**图片文件同步消失**（主进程负责）
4. 删除画板：提示「灵感条目会保留，只解除归属」

- [ ] **Step 1–2: 实现两个组件并接入**

- [ ] **Step 3: CDP 界面验证**

断言：
1. 新建画板 → 画板卡片出现，条数正确
2. 把灵感归入画板 → 卡片显示画板名，画板统计 +1，封面为该灵感图片
3. 编辑灵感正文 → 卡片更新
4. 删除灵感 → 卡片消失，画板统计 -1
5. 删除画板 → 灵感仍在，只显示「未归属」

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/inspiration
git commit -m "feat(M3-3): 画板视图 + 灵感编辑/删除（图片文件同步清理）"
```

---

### Task 11: 图片文件落盘与清理的集成验证 + 阶段验收

**Files:**
- Modify: `scripts/acceptance/m3-3-e2e.mjs`（新建）
- Create: `docs/plans/2026-10-09-m3-3-acceptance.md`
- Create: `src/renderer/src/components/inspiration/InspirationMarkButton.tsx`
- Modify: `src/renderer/src/components/inspiration/InspirationEditDialog.tsx`

- [ ] **Step 1: 「标记为长期任务」入口**

复用 `ProjectMarkButton` 结构，`sourceModule` 换成 `'inspiration'`；时间轴显示为**灵感品红 `#e879c9`**。灵感没有起止日期字段，改为在编辑弹窗里提供可选的起止日期（与长期任务区间对应），未设时按钮禁用。

> 若与既有 `inspirations` 表结构冲突，则在 v6 迁移中为 `inspirations` 增加 `start_date` / `end_date` 两列（沿用 `addColumnIfMissing`）。

- [ ] **Step 2: 图片文件落盘的集成验证（真实文件系统）**

在 `scripts/dev/` 新增 `verify-image-files.mts`：直接调用主进程的 `saveImageFile` / `deleteImageFile`，断言
1. 写入后 `images/` 下确实出现该 UUID 文件，且字节完全一致
2. `resolveImagePath('../evil.png')` 与 `resolveImagePath('C:\\x.png')` 都返回 `null`
3. `deleteImageFile` 后文件消失；对不存在的文件再删一次不抛错
4. 用 9 MB 字节调用 `saveImageFile` 抛 `图片过大`

- [ ] **Step 3: 全量测试 + 类型检查 + 构建 + 打包**

Run: `npm test && npm run typecheck && npm run build && npx electron-builder`

- [ ] **Step 4: 端到端验收 `scripts/acceptance/m3-3-e2e.mjs`**

覆盖：捕获三种类型、瀑布流渲染、精选筛选、标签筛选、关键词搜索、画板创建与归属、编辑、删除、**删除后图片文件消失**、标记长期任务后时间轴出现品红块。

- [ ] **Step 5: 写验收记录并提交**

```bash
git add scripts/acceptance/m3-3-e2e.mjs scripts/dev/verify-image-files.mts docs/plans/2026-10-09-m3-3-acceptance.md docs/acceptance-shots src/renderer/src/components/inspiration
git commit -m "chore(M3-3): 设计灵感验收记录 + 图片文件落盘验证 + 打包"
```

---

## Self-Review 记录

### 1. Spec 覆盖

| PRD / 设计文档要求 | 覆盖任务 |
|---|---|
| 三合一捕获（贴图 / 写文字 / 贴链接） | T5（编排）、T9（弹窗） |
| 瀑布流：图片卡（缩略图、⭐角标、🔗来源、画板）与文字卡混排 | T4（列分配）、T8（渲染） |
| 顶部筛选：全部 / ⭐精选 / 画板 / 标签 / 搜索 | T4（`filterInspirations`）、T8（筛选条） |
| 画板视图：封面=画板内最新图片、灵感条数 | T3（`boardStats`）、T10（视图） |
| 图片写入 `images/`（UUID 命名）、删除灵感同步删文件 | T2（存储层）、T5（编排）、T10/T11（验证） |
| 灵感速记：文字 + 标签分类 | T3、T9 |

### 2. 占位符扫描

- 无 TBD / TODO
- T7 只给结构说明不给逐行代码，因为它完全照搬已交付的 `devStore` 模式；其余任务的实现代码均完整给出

### 3. 类型一致性核对

| 名字 | 定义处 | 消费处 | 一致 |
|---|---|---|---|
| `Inspiration` / `InspirationBoard` | T1 `types.ts` | T3 数据层、T6 IPC、T7–T10 UI | ✅ |
| `CaptureInput.imageBytes: Uint8Array` | T1 | T5 编排、T6 IPC、T9 弹窗 | ✅ |
| `ImageStore`（注入式） | T5 | T6 IPC 传入 `saveImageFile`/`deleteImageFile` | ✅ |
| `isAllowedImageName` / `resolveImagePath` | T2 | T2 协议处理器 | ✅ |
| `imageUrl` | T2 `@shared/imageName` | T8 卡片、T9 预览、T10 封面 | ✅ |
| `deleteInspiration` 返回图片名 | T3 | T6 IPC 删文件 | ✅ |
| `InspirationFilter` | T4 | T3 `listInspirations`、T6 IPC、T7 store | ✅ |
| `distributeColumns` | T4 | T8 `WaterfallGrid` | ✅ |
| CSP `img-src ... lifeos-image:` | T6 | T8/T9/T10 的 `<img>` | ✅ |
| IPC 通道名 | T6 | main / preload / renderer 三处逐一对应 | ✅ |

### 4. 执行顺序与依赖

```
T1（迁移 v5 + 类型）
 ├─► T2（图片存储层 + 安全纯函数）
 ├─► T3（灵感数据层）─► T4（筛选 + 瀑布流纯函数）
 └──────────────────────┴─► T5（捕获编排）─► T6（IPC + 协议 + CSP）
                                                └─► T7（store）
                                                       └─► T8（页面骨架）
                                                              ├─► T9（捕获弹窗）
                                                              └─► T10（画板 + 编辑）
                                                                     └─► T11（标记 + 验收）
```

T2 与 T3 无相互依赖，可并行；其余串行。T8–T11 都改 `InspirationPage.tsx`，必须串行。

### 5. 本阶段特有的风险与对策

| 风险 | 对策 |
|---|---|
| 自定义协议被 CSP 拦截，图片全空白且无显式报错 | T6 显式把 `lifeos-image:` 加入 `img-src`；T9 用 `naturalWidth > 0` 作为真实证据 |
| 路径穿越（渲染进程伪造文件名） | T2 白名单正则 + `resolveImagePath` 目录归属双重校验，且有单测 |
| 落库失败留下孤儿图片 | T5 编排在 catch 里回收文件，有专门单测 |
| 删记录成功但删文件失败 | T2 `deleteImageFile` 容错（文件不存在不算错）；T6 先提交事务再删文件 |
| 瀑布流依赖 DOM 测量导致不可测 | T4 用高度估算 + 贪心分配，纯函数可单测 |

