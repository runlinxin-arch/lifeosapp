# M3-2 开发模块 验收记录

- 日期：2026-10-09
- 计划：[docs/plans/2026-10-09-m3-2-dev.md](./2026-10-09-m3-2-dev.md)
- 对应 PRD：3.5 / 4.3 / 8.5.1（模块侧入口）/ 8.6.2
- 上游总览：[docs/plans/2026-10-09-m3-overview.md](./2026-10-09-m3-overview.md)

## 一、交付物

| 层 | 文件 | 说明 |
|---|---|---|
| 迁移 | `src/main/db/index.ts` v4 | `projects` / `dev_tasks` / `bugs` / `snippets` / `tech_notes` / `dev_sessions` |
| 类型 | `src/shared/types.ts` | 38 个开发相关类型（实体 + Input + Patch） |
| 数据层 | `src/main/db/dev.ts` | 项目 CRUD + 统计、看板、Bug、片段、笔记、计时汇总 |
| 纯函数 | `src/shared/kanban.ts` | `planMove`（跨列/列内重排）、`columnsOf`、`DEV_COLUMNS` |
| 纯函数 | `src/shared/snippetFilter.ts` | `filterSnippets`（关键词 × 标签 AND）、`parseTags` |
| 纯函数 | `src/shared/devStats.ts` | `minutesByProjectInRange` / `projectWeekMinutes` / `minutesByTask` |
| IPC | 29 条 `dev:*` 通道 | main / preload / renderer 三处一致 |
| 状态 | `devStore.ts` / `devTimerStore.ts` | 项目·看板·Bug·片段·笔记·会话 + 计时器 |
| 界面 | `components/dev/*` | `DevPage` / `ProjectList` / `ProjectDetail` / `KanbanBoard` / `DevTimer` / `BugPanel` / `TimeStatsPanel` / `SnippetView` / `TechNoteView` / `ProjectMarkButton` |
| 接线 | `App.tsx` / `Sidebar.tsx` | 「开发」从 disabled 打开并挂载页面 |

## 二、自动化结果

```
npm test              24 文件 / 407 用例全绿     （M3-2 开工前：23 / 290 → +117）
npm run typecheck     0 错误
npm run build         三入口通过
npx electron-builder  release/LifeOS Setup 0.1.0.exe（109.67 MB）
```

本阶段新增 **117 个用例**：迁移 5、项目数据层 19、看板纯函数 15 + 数据层 15、片段筛选 13、Bug/片段/笔记 27、开发计时 13、开发统计 10。

## 三、端到端界面验证（CDP 驱动）

脚本：`scripts/acceptance/m3-2-e2e.mjs`；截图：`docs/acceptance-shots/13~19`。

| # | 验证项 | 结果 |
|---|---|---|
| 1 | 看板三列渲染 | ✅ |
| 2 | 新建任务进入「待办」，列头计数正确 | ✅ |
| 3 | 「移动到…」跨列 | ✅ |
| 4 | **拖拽**跨列 | ✅ |
| 5 | **刷新后看板位置持久** | ✅ |
| 6 | 常驻计时器走字 | ✅ |
| 7 | 停止后记录时长（卡片显示「已计 1m」） | ✅ |
| 8–9 | Bug 页签渲染 + 新建 | ✅ |
| 10–11 | Bug 状态流转 未修 → 修复中 → 已修复 | ✅ |
| 12 | 项目卡片与页签徽标同步未修数（卡片 1 / 页签 `Bug 1`） | ✅ |
| 13 | 计时统计：项目累计 + 按任务汇总 | ✅ |
| 14 | 删除计时记录后累计归零且卡片同步 | ✅ |
| 15–16 | 片段新建 + 关键词命中代码内容 | ✅ |
| 17 | 无命中显示空状态 | ✅ |
| 18 | 标签筛选只留命中项 | ✅ |
| 19 | 清除筛选恢复全部 | ✅ |
| 20–21 | 技术笔记关联项目显示项目名 / 不关联显示「未关联」 | ✅ |
| 22 | 未设起止日期时标记按钮禁用 | ✅ |
| 23 | 标记后时间轴出现**开发蓝块**（`#3498db`） | ✅ |
| 24 | 取消标记后蓝块消失 | ✅ |

**27 / 27 通过。**

## 四、PRD 8.6.2 逐条对照

| 验收项 | 证据 | 状态 |
|---|---|---|
| 项目列表：状态（计划中/开发中/暂停/已完成）、简介 | CHECK 约束 + 5 用例 + 卡片状态灯 | ✅ |
| 任务看板三列拖拽，卡片带优先级与截止日 | `planMove` 15 用例 + E2E 拖拽 | ✅ |
| 看板位置持久 | 事务落库 + E2E「刷新后仍保持」 | ✅ |
| Bug 记录：现象、优先级、状态流转 | 数据层 10 用例 + E2E 两段流转 | ✅ |
| 代码片段：标题/代码/语言/标签 + 关键词搜索 | `filterSnippets` 13 用例 + E2E 关键词与标签筛选 | ✅ |
| 技术笔记：可关联项目 | 数据层 7 用例（含 SET NULL）+ E2E | ✅ |
| 开发计时：手动开始/停止，按项目汇总 | 13 用例 + E2E 计时与统计 | ✅ |
| 标记为长期任务（PRD 8.5.1 模块侧） | E2E 禁用/标记/取消 + 蓝色块 | ✅ |

## 五、过程中的问题与修正

1. **拖拽依赖 React 状态（真实脆弱点）**
   初版把拖拽载荷存在组件状态 `drag.taskId`。React 18 批处理状态更新，`dragstart` 与 `drop` 落在同一批次时 `drop` 读到的是旧值 `null`，拖拽静默失效。真实浏览器拖拽因中间隔了多帧而侥幸可用。
   **修正**：改为从 `dataTransfer.getData()` 读取任务 id，不再依赖组件状态。这是消除隐患，不是为测试让路。

2. **本周计时缺少 task → project 映射**
   设计时遗漏：`dev_sessions` 只记 `task_id`，而按项目汇总本周时长需要全部任务。补上 `listAllDevTasks()` + `dev:listAllTasks` 通道 + store 的 `allTasks`，并把该逻辑抽成可单测的 `minutesByProjectInRange`。

3. **迁移测试写死版本号（第三次踩坑）**
   v4 落地后 M3-1 的 v3 测试立即失败（断言 `user_version === 3`）。统一改为引用 `LATEST_VERSION`，并验证文件中再无写死版本数字。

4. **PowerShell 写入 UTF-8 BOM**
   用 `Set-Content -Encoding UTF8` 做机械替换时被写入 BOM（与仓库其他文件不一致）。已清除并全仓库体检确认无 BOM。结论：**不要用 PowerShell 写源文件**。

5. **E2E 脚本自身的问题（非产品缺陷）**
   - 项目卡片文本是「名称 + 状态 + 统计」拼接，精确匹配找不到 → 改用包含匹配；同时发现一处**假通过**（选中从未发生，断言"不显示"自然成立）。
   - `Page.reload` 会清空注入的辅助函数 → 把注入源码提为常量，重载后重新注入。
   - T12 里项目**仍处于选中状态**却又点了一次卡片，触发取消选中导致日期输入框消失 → 改为「已选中就不再点」。

## 六、设计决定（值得留在代码里）

1. **计时器失败不丢时间**：`devTimerStore.stop()` 只在成功写库后才清空 `running`；失败时计时继续保留。
2. **只记录已结束的会话**：进行中的计时只存在渲染端内存，应用崩溃不会留下没有结束时间的悬挂记录。
3. **看板排序是纯函数**：`planMove` 不碰数据库，数据层只负责在事务里落库；跨列移动后两列 position 均为连续 `0..n-1`。
4. **删除项目的两种关联语义**：看板任务/Bug/计时 `CASCADE`；技术笔记 `SET NULL`（笔记保留，仅解除关联）。

## 七、仍待人工确认

1. ~~界面观感（截图 `13~19`）~~ —— **2026-10-09 用户查看后确认无问题**
2. 真实鼠标拖拽的手感（E2E 用的是合成 DragEvent；「移动到…」已作为等价路径验证）
3. 大量卡片时的看板性能（当前只有个位数卡片）

## 八、与设计文档的偏差（M5 回写）

1. `dev_tasks` 增加 `priority` 列 —— 设计文档 §7.3 未列，PRD §3.5 要求「卡片带优先级、截止日」
2. `dev_tasks.column` 实际列名为 **`column_name`** —— `column` 是 SQLite 保留字
3. `tech_notes.project_id` 采用 `ON DELETE SET NULL` —— 项目删除后笔记保留
4. 计时统计页签为新增（设计文档未明确，PRD §4.3 要求「按项目汇总」，落地为「按任务汇总 + 最近记录」）
