# M4-1 健身模块 验收记录

- 日期：2026-10-09
- 计划：[docs/plans/2026-10-09-m4-1-fitness.md](./2026-10-09-m4-1-fitness.md)
- 对应 PRD：4.5 / 8.7.1、界面 PRD L107
- 上游总览：[docs/plans/2026-10-09-m4-overview.md](./2026-10-09-m4-overview.md)

## 一、交付物

| 层 | 文件 | 说明 |
|---|---|---|
| 迁移 | `src/main/db/index.ts` v6 | `workout_plans` / `workout_logs`（`plan_id` 可空 + `ON DELETE SET NULL`）/ `body_metrics`（`date UNIQUE`） |
| 类型 | `src/shared/types.ts` | `WorkoutPlan` / `WorkoutLog` / `BodyMetric` / `WorkoutItem` + Input/Patch 类型 |
| 纯函数 | `src/shared/fitnessContent.ts` | JSON 列「解析 → 校验 → 序列化」：`parseSchedule` / `normalizeSchedule` / `parseWorkoutContent` / `WEEKDAY_LABELS` |
| 纯函数 | `src/shared/fitnessStats.ts` | `isoWeekday` / `planForDate` / `itemVolume` / `totalVolume` / `workoutCount` / `workoutStreak` / `toSvgPoints` / `linePath` / `latestMetric` |
| 数据层 | `src/main/db/fitness.ts` | 计划 CRUD、打卡 CRUD、身体数据 upsert（同日覆盖）、最新一条 |
| IPC | `ipc.ts` / `preload` / `lib/ipc.ts` | 12 条 `fit:*` 通道，三处一致 |
| 状态 | `src/renderer/src/stores/fitnessStore.ts` | 计划/打卡/身体数据 + `LatestGuard` 竞态守卫 + 统一错误处理 |
| 界面 | `components/fitness/*` | `FitnessPage` / `PlanEditor`（一周七格）/ `TodayWorkout` / `WorkoutItemEditor` / `BodyTrend` / `WeeklyStats` / `WorkoutHistory` |
| 接线 | `App.tsx` / `Sidebar.tsx` | 侧边栏「健身」解除 disabled 并挂载页面 |
| 验收 | `scripts/acceptance/m4-1-e2e.mjs` | CDP 端到端脚本，22 项断言 |

## 二、自动化结果

```
npm test              35 文件 / 618 用例全绿   （M4 开工前：32 文件 / 528）
npm run typecheck     0 错误
npm run build         三入口通过
npx electron-builder  release/LifeOS Setup 0.1.0.exe（109.68 MB）
```

本阶段新增 **90 个用例**：迁移 v6 5、健身 JSON 列 15、统计与曲线 37、健身数据层 33。

## 三、端到端界面验证（CDP 驱动）

脚本：`scripts/acceptance/m4-1-e2e.mjs`；截图：`docs/acceptance-shots/31~33`。
通过 Chrome DevTools Protocol 连入真实渲染进程，用真实事件序列操作界面并断言 DOM 与数据库状态：

| # | 验证项 | 结果 |
|---|---|---|
| 1 | 侧边栏「健身」可进入（导航已启用） | ✅ |
| 2 | 空状态提示「还没有训练计划」 | ✅ |
| 3 | 新建计划后自动选中并进入编排 | ✅ |
| 4 | 一周七格编排（周一–周日） | ✅ |
| 5 | 一周安排以 **ISO 数字键**入库（`{"1":"胸","5":"腿"}`） | ✅ |
| 6 | 「今日训练」显示今天该练什么 | ✅ |
| 7 | **刷新（重启渲染进程）后一周安排仍保持** | ✅ |
| 8 | 打卡记录含动作/重量/组数，显示总容量 4,420 kg | ✅ |
| 9 | 周统计训练次数 1 / 总容量 4420（60×4×8 + 100×5×5） | ✅ |
| 10 | **同一天再次打卡是更新**（当天记录数仍为 1） | ✅ |
| 11 | 更新后按新重量重算（50×4×8 + 2500 = 4100） | ✅ |
| 12 | 周统计次数与本周内记录数一致（3） | ✅ |
| 13 | 空打卡计次但不计容量（总容量仍 4100） | ✅ |
| 14 | **连续打卡天数正确**（今天 + 前 2 天 = 3） | ✅ |
| 15 | 本周每日小格渲染 | ✅ |
| 16 | 身体数据按日期记录两条 | ✅ |
| 17 | **趋势曲线出现**：体重两点 + 体脂虚线 | ✅ |
| 18 | 显示最新体重 70.5 kg 与相对上次变化 ↓ 0.7 kg | ✅ |
| 19 | **同一天再次记录是覆盖**（条数不变、值更新） | ✅ |
| 20 | 打卡历史可见（3 天记录，含空打卡「只记了练了」） | ✅ |
| 21 | 曲线宽度自适应容器（496 = 容器宽度，非固定 320） | ✅ |
| 22 | 脚本可重复运行（开头清理既有健身数据） | ✅ |

**22 / 22 通过。**

## 四、PRD 8.7.1 逐条对照

| 验收项 | 证据 | 状态 |
|---|---|---|
| 训练计划可编排一周安排 | 迁移/数据层 8 用例 + E2E 第 4–7 项（含刷新保持） | ✅ |
| 打卡记录含动作/重量/组数 | 数据层 33 用例 + E2E 第 8/11 项（4,420 → 4,100 kg） | ✅ |
| 体重体脂曲线正确 | `toSvgPoints`/`linePath` 37 用例（等值、单点、极值、内边距）+ E2E 第 17/21 项 | ✅ |
| 周统计正确（次数/总容量/连续打卡） | 纯函数用例 + E2E 第 9/12/13/14 项（3 / 4100 / 3） | ✅ |
| 保留历史（PRD 4.5） | 新增「最近打卡」列表 + E2E 第 20 项 | ✅ |
| 三栏界面（PRD L107） | 截图 31~33：今日训练 ｜ 体重体脂趋势 ｜ 本周统计 | ✅ |

## 五、过程中的问题与修正

1. **类型导入缺失**：`fitnessStore.ts` 使用了 `WorkoutLogPatch` 但 import 列表里没有它，`npm run typecheck` 报 TS2552。补齐导入后 0 错误 —— 这是收尾时唯一的红灯，也是「先过闸门再提交」的价值体现。
2. **曲线并非真正自适应**：原实现固定 `viewBox="0 0 320 120"` + `w-full`，等比缩放后在宽卡片里两侧各留 150px 空白（截图 32 可见）。改为 `ResizeObserver` 量取容器宽度、以实际宽度生成坐标与 viewBox，E2E 第 21 项断言 `svg.width === 容器宽`。
3. **顶部文案口径矛盾**：「本周已练 N 次（近 400 天）」一处混用了两个口径，改为「近 400 天已练 N 次」（本周口径由「本周统计」卡片负责）。
4. **交互取舍记录**：点「开始今天的训练」进入编辑态时动作列表为空，需要自行点「＋ 添加动作」。这是为满足契约「空动作也能打卡」而保留的行为，未预填动作行 —— E2E 脚本按此调整。若后续觉得别扭，可在 M5 打磨时改为预填一行空动作。
5. **E2E 脚本两处环境依赖 bug（非产品缺陷）**：① `Page.reload` 后渲染上下文重建，注入的辅助函数丢失 → 改为可重复注入；② 若上一轮脚本结束时停在健身页，清理数据后 store 不会重新挂载，空状态断言会假失败 → 改为「先离开再进入」触发重挂载。
6. **体重与体脂两条线各自独立归一化**：只有两个数据点时，两条线必然完全重合（本次截图 33 即该情形，体脂虚线压在体重实线上）。数学上无解（各自 min→max 都映射到满高），需要用户确认是否接受，见「仍待人工确认」。

## 六、与设计文档的偏差（需 M5 回写）

1. `workout_plans.schedule` 键由中文改为 **ISO 数字**（`{"1":"胸"}`），避免中文字符串参与逻辑判断。
2. `workout_logs.plan_id` 采用 `ON DELETE SET NULL`：删除计划后历史打卡保留。
3. `body_metrics.date` 加 `UNIQUE`，写入走 upsert（每天一条）。
4. 计划中的独立 `BodyMetricDialog.tsx` **合并进 `BodyTrend.tsx`**：弹窗与该卡片强耦合（日期/体重/体脂三个受控输入 + 保存反馈），拆开需要传递 8 个 props，收益为负。
5. **新增 `WorkoutHistory.tsx`（计划未列）**：PRD 4.5 明确要求「保留历史」，原计划没有可见的历史入口。

## 七、仍待人工确认

1. 界面观感：截图 `docs/acceptance-shots/31~33`（深色基调、三栏比例、卡片留白）。
2. 体重/体脂双线的呈现方式：当前为各自独立归一化，两点数据时必然重合。可选替代方案：双 Y 轴刻度、或体脂改为下方独立迷你图。需要用户拍板后决定是否在 M5 调整。

## 八、对后续阶段的输出

M4-2/M4-3/M4-4 可直接复用：

- **JSON 列模式**：`parse*`（容错回退）→ `normalize*`（修正入库）→ `*ToJson`，坏数据不炸界面
- **日期唯一 + upsert**：`body_metrics` 的写法可直接套到饮食「每天每餐一条」
- **曲线纯函数**：`toSvgPoints` / `linePath` 可直接服务饮食营养趋势、游戏时长趋势
- **store 模式**：`run()` 错误包装 + `LatestGuard` 并发守卫 + 成功后定向 fetch
- **迁移模式**：新增表一律追加 `user_version`（v7 饮食、v8 游戏娱乐）
- **E2E 模板**：`m4-1-e2e.mjs` 含「开头清理 → 真实事件操作 → 断言 DOM + IPC 数据」与刷新/重挂载的处理写法
