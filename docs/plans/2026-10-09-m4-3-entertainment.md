# M4-3 游戏娱乐模块 Implementation Plan

> **执行后的变更（2026-10-09，用户复核提出）**：
> 1. **移除愿望单**（本计划 T1/T3/T4/T7 中的愿望单部分已废弃，表与 v8 迁移保留未动）
> 2. 游玩记录增加**按周/月/全部区间切换**与**按游戏筛选**
> 3. 影视书拆分为**影视**与**书籍**两个页签，页签从 3 个变为「游玩记录 | 影视 | 书籍」
>
> 以 [M4-3 验收记录](./2026-10-09-m4-3-acceptance.md) 为准（E2E 20/20）。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付「游戏娱乐」模块：游玩记录（日期 + 时长，按游戏自动聚合计总时长）、愿望单（游戏 + 优先级）、影视书（类型/状态/五星评分/短评），三页签界面。对应 PRD 4.7 与 8.7.3、界面 PRD L111、设计文档 §5.8 / §6.7 / §7.7。

**Architecture:** 延续 M1–M4-2 的分层。新增三张表以迁移 v8 落地；聚合逻辑（按游戏汇总、愿望单排序、影视书分组）全部是纯函数，界面只做展示与编辑。

**Tech Stack:** Electron 44 + electron-vite + React 18 + TypeScript + Tailwind + Zustand + `node:sqlite` + Vitest

## Global Constraints

- 数据目录 `%APPDATA%\LifeOS\`；渲染进程禁止直接访问数据库与文件系统
- 多步写入必须包在事务中，失败回滚
- 深色色板：底色 `#1e1f24`、卡片 `#26272e`、描边 `#3a3b45`、强调 `#7c8cff`、正文 `#e4e4e7`、次要 `#8b8d98`；**游戏娱乐模块色紫 `#a06ee1`**
- 日期 `YYYY-MM-DD`；复用既有 `Priority = 'low' | 'mid' | 'high'`
- **不得修改已发布的 v1–v7 迁移**，本次新增 v8
- 提交前固定顺序：`npm test` → `npm run typecheck` → commit
- 起点基线：38 个测试文件 / 668 用例全绿，`typecheck` 0 错误
- 复用：`assertNonEmpty` / `assertDateStr`、`formatIpcError`、`LatestGuard`、`dietStats.upcomingDays` 的写法、`dates.ts` 的 `addDays` / `formatCn`

## 与设计文档的偏差（需在 M5 回写）

1. `plays` 增加 `minutes` 的 **1–1440 整数**校验（一天最多 24 小时），避免误填造出天文数字总时长
2. `media.rating` 取 **0–5 整数**，`0` 表示"未评分"（与五星组件的空态一致）
3. 按游戏聚合**大小写敏感**：`Elden Ring` 与 `elden ring` 视为两个游戏——不自作主张合并用户输入，避免展示名被改写；如需合并由用户在录入时统一

---

### Task 1: 迁移 v8（三张表）+ 共享类型

**Files:**
- Modify: `src/main/db/index.ts`（追加 v8）、`src/shared/types.ts`
- Test: `tests/migrate.test.ts`

**Interfaces:**
- Produces:
  - `plays`：`id, game, date, minutes, created_at, updated_at`
  - `wishlist`：`id, name, platform, priority, created_at, updated_at`
  - `media`：`id, title, type, status, rating, comment, date, created_at, updated_at`
  - `LATEST_VERSION` 变为 **8**
  - 类型 `Play` / `PlayInput` / `PlayPatch` / `WishItem` / `WishInput` / `WishPatch` / `MediaType` / `MediaStatus` / `Media` / `MediaInput` / `MediaPatch` / `GameSummary`

- [x] **Step 1: 追加失败测试到 `tests/migrate.test.ts` 末尾**

```ts
describe('游戏娱乐模块迁移 v8', () => {
  it('新库含三张游戏娱乐表', () => {
    const db = openDb(dbFile)
    expect(version(db)).toBe(LATEST_VERSION)
    expect(columns(db, 'plays')).toEqual(['id', 'game', 'date', 'minutes', 'created_at', 'updated_at'])
    expect(columns(db, 'wishlist')).toEqual(['id', 'name', 'platform', 'priority', 'created_at', 'updated_at'])
    expect(columns(db, 'media')).toContain('rating')
    expect(columns(db, 'media')).toContain('comment')
    db.close()
  })

  it('v7 老库能平滑升级到 v8 且饮食数据保留', () => {
    const raw = openDb(dbFile)
    raw.exec('DROP TABLE plays')
    raw.exec('DROP TABLE wishlist')
    raw.exec('DROP TABLE media')
    raw.exec('PRAGMA user_version = 7')
    raw.prepare("INSERT INTO meals (date, type) VALUES ('2026-10-09', 'lunch')").run()
    raw.close()

    const db = openDb(dbFile)
    expect(version(db)).toBe(LATEST_VERSION)
    expect(columns(db, 'plays')).toContain('minutes')
    expect(db.prepare('SELECT COUNT(*) c FROM meals').get()).toEqual({ c: 1 })
    db.close()
  })

  it('默认值正确（priority=mid / status=planned / rating=0 / comment 空）', () => {
    const db = openDb(dbFile)
    db.prepare("INSERT INTO wishlist (name) VALUES ('丝之歌')").run()
    expect(db.prepare('SELECT priority, platform FROM wishlist').get()).toEqual({ priority: 'mid', platform: '' })
    db.prepare("INSERT INTO media (title, type, date) VALUES ('沙丘', 'movie', '2026-10-09')").run()
    expect(db.prepare('SELECT status, rating, comment FROM media').get())
      .toEqual({ status: 'planned', rating: 0, comment: '' })
    db.close()
  })

  it('同一天同一游戏可有多条游玩记录', () => {
    const db = openDb(dbFile)
    db.prepare("INSERT INTO plays (game, date, minutes) VALUES ('老头环', '2026-10-09', 90)").run()
    db.prepare("INSERT INTO plays (game, date, minutes) VALUES ('老头环', '2026-10-09', 30)").run()
    expect(db.prepare('SELECT COUNT(*) c FROM plays').get()).toEqual({ c: 2 })
    db.close()
  })
})
```

- [x] **Step 2: 运行测试确认失败**（`no such table: plays`）

- [x] **Step 3: 追加 v8 迁移**

```ts
  {
    // v8 —— M4-3：游戏娱乐（游玩记录 / 愿望单 / 影视书）
    version: 8,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS plays (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          game TEXT NOT NULL,
          date TEXT NOT NULL,
          minutes INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE INDEX IF NOT EXISTS idx_plays_game ON plays(game);
        CREATE INDEX IF NOT EXISTS idx_plays_date ON plays(date);

        CREATE TABLE IF NOT EXISTS wishlist (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          platform TEXT NOT NULL DEFAULT '',
          priority TEXT NOT NULL DEFAULT 'mid',
          created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS media (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          type TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'planned',
          rating INTEGER NOT NULL DEFAULT 0,
          comment TEXT NOT NULL DEFAULT '',
          date TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE INDEX IF NOT EXISTS idx_media_date ON media(date);
      `)
    }
  }
```

- [x] **Step 4: 追加类型**（`Play` / `PlayInput` / `PlayPatch` / `WishItem` / `WishInput` / `WishPatch` / `MediaType` / `MediaStatus` / `Media` / `MediaInput` / `MediaPatch`；`GameSummary` 放 `@shared/entStats`）

- [x] **Step 5: 测试通过（migrate 32 用例）** → **Step 6: Commit**

```bash
git commit -m "feat(M4-3): 迁移 v8 三张游戏娱乐表 + 共享类型（+4 测试）"
```

---

### Task 2: 聚合纯函数（TDD）

**Files:**
- Create: `src/shared/entContent.ts`、`src/shared/entStats.ts`
- Test: `tests/entContent.test.ts`、`tests/entStats.test.ts`

**Interfaces:**
- Produces（`@shared/entContent`）：
  - `MEDIA_TYPES: MediaType[]`、`MEDIA_TYPE_LABELS: Record<MediaType, string>`
  - `MEDIA_STATUSES: MediaStatus[]`、`MEDIA_STATUS_LABELS: Record<MediaStatus, string>`
  - `PRIORITY_LABELS: Record<Priority, string>`、`PRIORITY_ORDER: Record<Priority, number>`
  - `isMediaType(v): v is MediaType`、`isMediaStatus(v): v is MediaStatus`、`isPriority(v): v is Priority`
  - `clampRating(n: unknown): number`（整数 0–5）
  - `normalizeComment(v: unknown): string`（去首尾空白）
  - `stars(rating: number): string`（'★★★☆☆'）
- Produces（`@shared/entStats`）：
  - `GameSummary`：`{ game, totalMinutes, sessions, lastDate }`
  - `gameSummaries(plays: Play[]): GameSummary[]`
  - `totalMinutes(plays: Play[], from?: string, to?: string): number`
  - `recentPlays(plays: Play[], n: number): Play[]`
  - `sortWishlist(items: WishItem[]): WishItem[]`
  - `mediaGroups(media: Media[]): Record<MediaStatus, Media[]>`
  - `mediaByType(media: Media[]): Record<MediaType, Media[]>`

**锁定的行为契约：**

*枚举与展示*
1. `MEDIA_TYPES = ['movie','series','book']`，标签 电影/剧集/书籍；`MEDIA_STATUSES = ['planned','doing','done']`，标签 想看/在看/看完
2. `PRIORITY_LABELS`：low→低、mid→中、high→高；`PRIORITY_ORDER`：high=0 < mid=1 < low=2（数值越小越靠前）
3. `clampRating`：非有限数 → 0；`Math.round` 后夹到 `[0,5]`
4. `stars(3)` → `'★★★☆☆'`；`stars(0)` → `'☆☆☆☆☆'`；`stars(9)` → `'★★★★★'`
5. `normalizeComment`：非字符串 → `''`；否则去首尾空白

*聚合*
6. `gameSummaries`：按**去空白后的游戏名**分组（大小写敏感）；每组 `totalMinutes` 求和、`sessions` 计数、`lastDate` 取最大日期；**排序：总时长降序，同则游戏名升序**
7. `totalMinutes(plays, from?, to?)`：区间含端点；不传区间统计全部
8. `recentPlays(plays, n)`：按 `date DESC, id DESC` 取前 n；`n ≤ 0` → `[]`
9. `sortWishlist`：按 `PRIORITY_ORDER` 升序（high 在前），同级按 `id` 升序；不修改入参
10. `mediaGroups`：总是返回三个键（planned/doing/done），每组内保持传入顺序
11. `mediaByType`：总是返回三个键（movie/series/book）

- [x] **Step 1–2: 写失败测试 `tests/entContent.test.ts`、`tests/entStats.test.ts`**
- [x] **Step 3–4: 实现两个纯函数模块**
- [x] **Step 5: 测试通过** → **Step 6: Commit**

```bash
git commit -m "feat(M4-3): 游戏娱乐枚举与聚合纯函数（+约 30 测试）"
```

---

### Task 3: 数据层（TDD）

**Files:**
- Create: `src/main/db/entertainment.ts`
- Test: `tests/entertainment.test.ts`

**Interfaces:**
- `listPlays(db, from?, to?): Play[]`（`date DESC, id DESC`）/ `createPlay` / `updatePlay` / `deletePlay`
- `listWishlist(db): WishItem[]`（`id ASC`）/ `createWish` / `updateWish` / `deleteWish`
- `listMedia(db): Media[]`（`date DESC, id DESC`）/ `createMedia` / `updateMedia` / `deleteMedia`

**锁定的行为契约：**
1. `plays.game` 去空白非空；`minutes` 必须是 **1–1440 的整数**；`date` 合法
2. `wishlist.name` 去空白非空；`platform` 去空白（允许空串）；`priority` 必须是三个枚举之一（默认 `mid`）
3. `media.title` 去空白非空；`type` / `status` 必须是枚举；`rating` 经 `clampRating`（默认 0）；`comment` 经 `normalizeComment`；`date` 合法
4. 更新是**合并语义**，未提供的字段保持原值；更新不存在的记录抛 `not found`
5. 删除按 id

- [x] **Step 1–5: TDD 实现** → **Step 6: Commit**

```bash
git commit -m "feat(M4-3): 游戏娱乐数据层（游玩/愿望单/影视书 CRUD）（+约 24 测试）"
```

---

### Task 4: IPC 契约扩展 + preload + 渲染端封装

- 12 条通道：`ent:listPlays` / `ent:createPlay` / `ent:updatePlay` / `ent:deletePlay` / `ent:listWishlist` / `ent:createWish` / `ent:updateWish` / `ent:deleteWish` / `ent:listMedia` / `ent:createMedia` / `ent:updateMedia` / `ent:deleteMedia`
- `window.lifeos.ent` 命名空间与 12 个方法一一对应（`removePlay` 等删除方法映射到 `ent:delete*`）
- 三处通道名一致性用脚本核对 → **Commit**

```bash
git commit -m "feat(M4-3): 游戏娱乐 IPC 契约（12 条通道）+ preload + 渲染端封装"
```

---

### Task 5: 游戏娱乐页骨架 + 三页签

**Files:**
- Create: `src/renderer/src/stores/entertainmentStore.ts`
- Create: `src/renderer/src/components/entertainment/EntertainmentPage.tsx`
- Modify: `Sidebar.tsx`（去掉 `entertainment` 的 disabled）、`App.tsx`

**锁定的行为契约：**
1. 三个页签：**游玩记录 / 愿望单 / 影视书**（PRD L111）；页签状态存在 store 里，切页签不丢数据
2. `load()` 并发拉取 `listPlays()` / `listWishlist()` / `listMedia()`
3. 页签按钮带 `data-tab` 钩子；当前页签 `data-tab-active="true"`

- [x] **Step 1–3: 实现 store 与页面骨架** → **Step 4: 接线 Sidebar/App** → **Step 5: CDP 验证可进入三页签** → **Step 6: Commit**

---

### Task 6: 游玩记录（记录 + 按游戏聚合）

**Files:**
- Create: `components/entertainment/PlayLog.tsx`

**锁定的行为契约：**
1. 顶部记录表单：游戏名 + 日期（默认今天）+ 时长（分钟）；提交后清空表单
2. **按游戏聚合列表**：游戏名 / 总时长（`Xh Ym` 或 `Nm`）/ 次数 / 最近游玩日期；数据来自 `gameSummaries`
3. 明细列表：按日期倒序显示每条记录，可删除
4. 时长输入非法（0、负数、非数字）由数据层拒绝并显示错误，界面不静默失败

- [x] **Step 1–2: 实现并接入页签**
- [x] **Step 3: CDP 验证**：同一天记录两次同一游戏 → 聚合总时长 = 两次之和 → 删除一条后聚合减少
- [x] **Step 4: Commit**

---

### Task 7: 愿望单 + 影视书（五星评分与短评）

**Files:**
- Create: `components/entertainment/Wishlist.tsx`、`components/entertainment/MediaList.tsx`、`components/entertainment/StarRating.tsx`

**锁定的行为契约：**
1. 愿望单：名称 + 平台 + 优先级（低/中/高）；列表按 `sortWishlist` 排序（高优先级在前）；可删除；优先级可改
2. 影视书：标题 + 类型（电影/剧集/书籍）+ 状态（想看/在看/看完）+ 五星评分 + 短评 + 日期
3. `StarRating`：五颗星，点击第 n 颗设为 n；**再点同一颗清零**（回到未评分 0）；带 `data-star={n}` 与 `data-rating` 钩子
4. 短评可留空；列表显示 `stars(rating)` 与短评文本
5. 影视书列表按状态分组展示（`mediaGroups`），每组标题显示数量

- [x] **Step 1–3: 实现三个组件并接入页签**
- [x] **Step 4: CDP 验证**：添加愿望单三条（不同优先级）→ 顺序为高/中/低；影视书评分 4 星 → `★★★★☆`；短评显示；改状态分组跟随
- [x] **Step 5: Commit**

---

### Task 8: 阶段验收

- [x] **Step 1: `npm test && npm run typecheck && npm run build && npx electron-builder`**
- [x] **Step 2: 端到端验收 `scripts/acceptance/m4-3-e2e.mjs`**，覆盖 PRD 8.7.3：
  1. 进入游戏娱乐页，三页签可切换
  2. **游玩记录按游戏聚合计总时长**：同一游戏两条记录（90 + 30 = 120 分钟）→ 聚合显示 `2h 0m`、2 次
  3. 记录第二个游戏 → 聚合按总时长降序
  4. 删除一条 → 聚合与明细同步
  5. 愿望单三条不同优先级 → 排序为 高/中/低；删除后消失
  6. **影视书记录评分与短评**：4 星 → `★★★★☆`、短评文本可见
  7. 影视书按状态分组（想看/在看/看完）计数正确
  8. 刷新后数据仍在
- [x] **Step 3: 写验收记录并提交**

```bash
git add scripts/acceptance/m4-3-e2e.mjs docs/plans/2026-10-09-m4-3-acceptance.md docs/acceptance-shots docs/plans/2026-10-09-m4-3-entertainment.md src/renderer/src/components/entertainment
git commit -m "chore(M4-3): 游戏娱乐阶段验收记录 + 打包验证"
```

---

## Self-Review 记录

### 1. Spec 覆盖

| PRD 要求（4.7 / 8.7.3 / L111） | 覆盖任务 |
|---|---|
| 游玩记录：日期 + 时长，按游戏自动聚合计总时长 | T1（表）、T2（`gameSummaries`）、T3、T6 |
| 愿望单：想入手的游戏 + 优先级 | T1、T2（`sortWishlist`）、T3、T7 |
| 影视书：类型、状态、五星评分、短评 | T1、T2（`clampRating`/`stars`/`mediaGroups`）、T3、T7 |
| 三页签界面 | T5 契约 1 |
| 不做游戏库（设计 §6.7 明确） | 非目标，未列入任务 |

### 2. 占位符扫描

- 无 TBD / TODO
- T5–T7 的描述比 T1–T4 概括：常规受控组件 + IPC，模式已在 M3/M4-1/M4-2 验证；**关键行为契约逐条列出**

### 3. 类型一致性核对

| 名字 | 定义处 | 消费处 | 一致 |
|---|---|---|---|
| `Play` / `WishItem` / `Media` / `MediaType` / `MediaStatus` | T1 `types.ts` | T2、T3、T4、T5–T7 | ✅ |
| `GameSummary` | T2 `entStats.ts` | T6 聚合列表 | ✅ |
| `MEDIA_*` / `PRIORITY_*` 标签与顺序 | T2 `entContent.ts` | T7 星评与分组 | ✅ |
| `clampRating` / `stars` / `normalizeComment` | T2 | T3 数据层、T7 UI | ✅ |
| IPC 通道名 | T4 | main / preload / renderer 三处逐一对应 | ✅ |

### 4. 执行顺序与依赖

```
T1（迁移 v8 + 类型）─► T2（聚合纯函数）─► T3（数据层）─► T4（IPC）
                                                          └─► T5（三页签骨架）
                                                               ├─► T6（游玩记录）
                                                               ├─► T7（愿望单 + 影视书）
                                                               └─► T8（验收）
```

### 5. 本阶段特有的风险

| 风险 | 对策 |
|---|---|
| 时长误填造出天文数字 | 数据层 1–1440 整数校验 + 单测 |
| 游戏名大小写/空格不一致导致聚合碎片化 | 分组前统一去空白；大小写敏感**明确记录为决策**，不做隐式合并 |
| 评分越界（6 星）或非整数 | `clampRating` 纯函数 + 数据层入库前调用，两层保证 |
| 星级组件点击语义歧义（再点同一颗） | 契约明确"再点同一颗清零"，E2E 覆盖 |
