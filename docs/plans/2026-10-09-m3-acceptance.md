# M3 工作模块 总验收记录

- 日期：2026-10-09
- 总览计划：[docs/plans/2026-10-09-m3-overview.md](./2026-10-09-m3-overview.md)
- 对应 PRD：第 3 章（工作模块）、8.5.1、8.6
- 上游里程碑：[docs/plans/2026-09-30-m2-acceptance.md](./2026-09-30-m2-acceptance.md)

## 一、阶段划分与状态

| 阶段 | 详细计划 | 验收记录 | 状态 |
|---|---|---|---|
| M3-1 共享底座 + 自我学习 | [m3-1-learning](./2026-10-09-m3-1-learning.md) | [m3-1-acceptance](./2026-10-09-m3-1-acceptance.md) | ✅ 完成 |
| M3-2 开发模块 | [m3-2-dev](./2026-10-09-m3-2-dev.md) | [m3-2-acceptance](./2026-10-09-m3-2-acceptance.md) | ✅ 完成 |
| M3-3 设计灵感 | [m3-3-inspiration](./2026-10-09-m3-3-inspiration.md) | [m3-3-acceptance](./2026-10-09-m3-3-acceptance.md) | ✅ 完成 |
| M3-4 「今天」页卡片接线 | — | [m3-4-acceptance](./2026-10-09-m3-4-acceptance.md) | ✅ 完成 |

## 二、最终验证结果

```
npm test              31 文件 / 510 用例全绿     （M3 开工前：16 文件 / 214）
npm run typecheck     0 错误
npm run build         三入口通过
npx electron-builder  release/LifeOS Setup 0.1.0.exe（109.67 MB）
```

### 端到端界面验证（CDP 驱动真实界面）

统一的回归入口：`scripts/acceptance/m3-all.ps1`（清库 → 重启应用 → 依次跑各阶段脚本）。

| 阶段 | 脚本 | 结果 |
|---|---|---|
| M3-1 自我学习 | `m3-1-e2e.mjs` | **10 / 10** |
| M3-2 开发模块 | `m3-2-e2e.mjs` | **27 / 27** |
| M3-3 设计灵感 | `m3-3-e2e.mjs` | **31 / 31** |
| M3-4 今天卡片 | `m3-4-e2e.mjs` | **8 / 8** |
| | | **76 / 76** |

## 三、本里程碑新增的迁移

| 版本 | 内容 |
|---|---|
| v3 | `learn_items` / `learn_notes` / `learn_sessions` |
| v4 | `projects` / `dev_tasks` / `bugs` / `snippets` / `tech_notes` / `dev_sessions` |
| v5 | `inspiration_boards` / `inspirations` |

数据层共 11 张新表；`user_version` 由 2 升至 5，全部迁移沿用"整批单事务"机制。

## 四、PRD 8.6 验收锚点对照

### 8.6.1 自我学习

| 要求 | 状态 |
|---|---|
| 学习项 CRUD（书/课程/技能，未开始/学习中/已完成） | ✅ |
| 进度更新（总量 / 当前进度 / 百分比） | ✅ |
| 笔记增删改 | ✅ |
| 学习计时计入统计 | ✅ |
| 连续天数正确累计 | ✅ |
| 标记为长期任务 | ✅ |

### 8.6.2 开发

| 要求 | 状态 |
|---|---|
| 项目列表（状态、简介、进度、本周计时、未修 Bug 数） | ✅ |
| 三列看板拖拽，卡片带优先级与截止日 | ✅ |
| 看板位置持久 | ✅ |
| Bug 状态流转 | ✅ |
| 代码片段（标签 + 关键词搜索） | ✅ |
| 技术笔记（可关联项目） | ✅ |
| 开发计时按项目汇总 | ✅ |
| 标记为长期任务 | ✅ |

### 8.6.3 设计灵感

| 要求 | 状态 |
|---|---|
| 灵感采集（图片 / 文字 / 链接） | ✅ |
| 瀑布流 | ✅ |
| 星标 / 标签 / 搜索筛选 | ✅ |
| 画板 | ✅ |
| 图片文件随记录删除 | ✅ |

### 8.3.4 「今天」页

| 要求 | 状态 |
|---|---|
| 今日学习项 + 已学时长 | ✅ |
| 进行中项目任务摘要 | ✅ |
| 点击卡片跳转对应模块 | ✅ |
| 设计灵感与游戏娱乐无今日卡片 | ✅ |

## 五、沉淀的共享底座（可被 M4/M5 直接复用）

| 能力 | 位置 |
|---|---|
| 输入校验 | `src/main/db/validate.ts` |
| 错误呈现 | `src/renderer/src/lib/errors.ts`（`formatIpcError`） |
| 时长格式化与换算 | `src/shared/duration.ts` |
| 学习统计 | `src/shared/learnStats.ts` |
| 看板列分配 | `src/shared/kanban.ts` |
| 片段筛选 | `src/shared/snippetFilter.ts` |
| 开发时长汇总 | `src/shared/devStats.ts` |
| 灵感筛选 / 瀑布流 | `src/shared/inspirationFilter.ts` / `waterfall.ts` |
| 图片名与 MIME 安全 | `src/shared/imageName.ts` |
| 长期任务来源判定 | `src/shared/longTaskSource.ts` |
| 今日卡片挑选 | `src/shared/todayCards.ts` |
| **并发刷新竞态守卫** | `src/renderer/src/lib/latest.ts`（`LatestGuard`） |
| CDP 验收框架 | `scripts/acceptance/*.mjs` + `m3-all.ps1` |

## 六、本里程碑修复的真实隐患

| # | 隐患 | 影响面 | 修复 |
|---|---|---|---|
| 1 | 拖拽载荷存在 React 状态，批处理下读到旧值 | 开发看板拖拽静默失效 | 改从 `dataTransfer.getData()` 读取 |
| 2 | 并发刷新时慢响应覆盖新数据 | **学习/开发/灵感三个 store** | 抽出 `LatestGuard`，全量应用 + 单测 |
| 3 | 图片路径由渲染进程提供可被伪造 | 路径穿越读取任意文件 | 白名单正则 + 解析后目录归属双重校验 |
| 4 | 图片先落盘后落库，落库失败留孤儿文件 | 磁盘垃圾 | `capture()` 失败时回收文件 + 单测 |
| 5 | 迁移测试写死版本号 | 每加一次迁移就连带失效（踩了 3 次） | 统一改为引用 `LATEST_VERSION` |
| 6 | 删文件失败会让删记录整体失败 | 记录删不掉 | 先提交事务再删文件，删文件容错 |

## 七、本里程碑确认的工程约束

1. **不要用 PowerShell 写源文件**：曾写入 UTF-8 BOM 破坏文件；`.ps1` 无 BOM 时按 ANSI 解析会毁掉中文（`m3-all.ps1` 因此改为纯 ASCII）。
2. **迁移测试断言 `LATEST_VERSION`**，不写死数字。
3. **测试可观测性**：E2E 需要的稳定定位一律通过 `data-*` 属性（`data-devcard`、`data-dropzone`、`data-insp-card`、`data-today-card`、`data-insp-filter`），不靠"包含文本 + 结构推测"。
4. **CDP 选择器必须限定作用域**：弹窗内元素要在弹窗内查找——页面的搜索框 placeholder「搜索文字 / 链接 / 标签」曾与弹窗的标签输入框冲突，导致标签被写进筛选条件。
5. **E2E 走真实路径**：组件在挂载时加载数据，测试必须先离开再回到该页，不能假定"调了 API 界面就会更新"。

## 八、非目标（M3 明确未做）

| 项 | 原因 |
|---|---|
| 灵感「标记为长期任务」 | PRD L200/L263 只点名学习项与开发项目；灵感章节（L144）唯一的"标记"是标星。为它加 v6 迁移与日期字段属于发明需求 |
| 导入 / 导出 | 属 M5 |
| 灵感视频收藏 | 属 M5 |
| 灵感状态流转（待看/已看） | 设计文档未定义 |
| Git 集成、任何联网功能 | 全程非目标 |

## 九、仍待人工确认

1. ~~三个模块与今日卡片的界面观感（截图 `08~23`）~~ —— **2026-10-09 用户逐张查看后确认无问题**
2. 真实鼠标拖拽手感与粘贴板粘贴体验（E2E 走的是合成事件与文件选择路径）
3. 跨零点时「今天」页卡片的自动刷新（`useToday` 已有跨零点钩子，未实测）
4. 大量数据下的性能（瀑布流、看板卡片数当前均为个位数）

## 十、对 M4/M5 的输入

1. **数据层模式已稳定**：新增模块 = 一次 `user_version` 迁移 + 一个 `db/<module>.ts` + 一组 `@shared/<module>Stats.ts` 纯函数 + 一个 `ipc` 命名空间 + 一个 store + 页面组件。
2. **本里程碑的偏差需在 M5 回写设计文档**：
   - `dev_tasks.column` 实际列名为 `column_name`（`column` 是 SQLite 保留字）
   - `dev_tasks` 增加 `priority` 列
   - `tech_notes.project_id` 与 `inspirations.board_id` 采用 `ON DELETE SET NULL`
   - `events.all_day`、`long_tasks.done`、`node:sqlite` 驱动、`TaskSource`（M2 遗留）
   - 图片回显走自定义协议 `lifeos-image://`，CSP 需放行 `img-src`
3. **未做的人工确认项需在 M5 一并处理**。
