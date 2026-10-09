# M3-1 共享底座 + 自我学习 验收记录

- 日期：2026-10-09
- 计划：[docs/plans/2026-10-09-m3-1-learning.md](./2026-10-09-m3-1-learning.md)
- 对应 PRD：4.2 / 8.5.1（模块侧入口）/ 8.6.1
- 上游总览：[docs/plans/2026-10-09-m3-overview.md](./2026-10-09-m3-overview.md)

## 一、交付物

| 层 | 文件 | 说明 |
|---|---|---|
| 迁移 | `src/main/db/index.ts` v3 | `learn_items` / `learn_notes` / `learn_sessions`（外键级联） |
| 类型 | `src/shared/types.ts` | `LearnItem` / `LearnNote` / `LearnSession` / `LearnItemInput` / `LearnItemPatch` |
| 数据层 | `src/main/db/learn.ts` | CRUD、进度校验、笔记、学习记录、删除时清长期任务色块 |
| 纯函数 | `src/shared/learnStats.ts` | `progressPercent` / `sumMinutes` / `dailyMinutes` / `streakDays` / `weekMinutes` |
| 纯函数 | `src/shared/duration.ts` | `formatDuration` / `formatElapsed` / `elapsedToMinutes` |
| 纯函数 | `src/shared/longTaskSource.ts` | `isMarkedFrom`（判断某来源是否已上轴） |
| IPC | `ipc.ts` / `preload` / `lib/ipc.ts` | 12 条 `learn:*` 通道，三处一致 |
| 状态 | `src/renderer/src/stores/learnStore.ts` | 列表/笔记/记录 + 统一错误处理 |
| 界面 | `components/learn/*` | `LearnPage` / `LearnStatsPanel` / `LearnDetail` / `LearnTimer` / `LearnMarkButton` |
| 接线 | `App.tsx` / `Sidebar.tsx` | 「自我学习」从 disabled 打开并挂载页面 |

## 二、自动化结果

```
npm test           20 文件 / 290 用例全绿      （M3 开工前：16 文件 / 214）
npm run typecheck  0 错误
npm run build      三入口通过
npx electron-builder  release/LifeOS Setup 0.1.0.exe（109.66 MB）
```

本阶段新增 **76 个用例**：迁移 4、学习数据层 36、统计纯函数 18、时长换算 11、来源判定 7。

## 三、端到端界面验证（CDP 驱动）

脚本：`scripts/acceptance/m3-1-e2e.mjs`；截图：`docs/acceptance-shots/08~11`。

通过 Chrome DevTools Protocol 连入真实渲染进程，用真实鼠标事件序列操作界面并断言 DOM 状态：

| # | 验证项 | 结果 |
|---|---|---|
| 1 | 新建学习项后出现在清单 | ✅ |
| 2 | 详情页五个区块齐全（属性/计时/长期任务/进度/笔记） | ✅ |
| 3 | 进度编辑：总量 30 + 已完成 12 → 显示 **40%** | ✅ |
| 4 | 进度超总量被主进程拒绝，错误可见且**原值保持 40%** | ✅ |
| 5 | 新增笔记并计入「学习笔记（1）」 | ✅ |
| 6 | 计时器走字 → 停止 → **今日学习变为 1m**，连续学习 🔥 1 天 | ✅ |
| 7 | 未设起止日期时「标记为长期任务」按钮 **disabled** | ✅ |
| 8 | 设 2 天以上区间后标记 → 显示「已上轴」+ **时间轴出现学习绿块**（`#4ade80`） | ✅ |
| 9 | 取消标记 → 徽标与色块同步消失 | ✅ |
| 10 | 删除学习项 → 从清单消失 | ✅ |

**10 / 10 通过。**

## 四、PRD 8.6.1 逐条对照

| 验收项 | 证据 | 状态 |
|---|---|---|
| 学习项 CRUD | 数据层 36 用例 + E2E 新建/删除 | ✅ |
| 进度更新（总量/进度/百分比） | 数据层校验用例 + E2E 40% 与超限拒绝 | ✅ |
| 笔记增删改 | 数据层 7 用例 + E2E 新增 | ✅ |
| 学习计时计入统计 | `elapsedToMinutes` 11 用例 + E2E 今日 1m | ✅ |
| 连续天数正确累计 | `streakDays` 8 用例（含断档/跨月/跨年/同日多条） | ✅ |
| 标记为长期任务（PRD 8.5.1 模块侧） | 数据层 M2 用例 + E2E 标记/取消/禁用态 | ✅ |

## 五、过程中的问题与修正

1. **计划中的跨层引用错误**：`progressPercent` 原本放在主进程数据层，但界面也要用（渲染进程不能引主进程代码）。已移到 `@shared/learnStats`，数据层转出以保持入口完整。
2. **纯函数误置于 .tsx**：`elapsedToMinutes` 最初写在 `LearnTimer.tsx` 里，而 `tsconfig.node.json` 没有 jsx 配置，测试无法类型检查该文件。已抽出为 `@shared/duration`（连同 `formatDuration`、`formatElapsed`）。
3. **写死版本号的断言**：`tests/persistence.test.ts` 里断言 `user_version === 2`，v3 落地即失效。改为引用 `LATEST_VERSION` —— 意图是"重开不重复迁移"，不该随迁移次数改动。
4. **测试断言写错（非产品缺陷）**：`weekMinutes` 的"边界外"用例把周一 `10-05` 当成了区间外，实际它就是本周第一天。修正断言并补了"两端都计入"的用例。
5. **E2E 脚本 bug（非产品缺陷）**：`byText` 按"包含"匹配时，左侧列表项的「未**开始**」会先于右侧计时器的「开始」命中，导致脚本误点了列表项、取消了选中。改为**精确匹配 + 限定右侧面板**；另有一次断言失败源于上次崩溃运行遗留的同名学习项，清理后 10/10。

## 六、仍待人工确认

1. 界面观感（深色基调下的排版与间距）—— 已有截图 `08~11`，但未由人眼确认
2. 计时器长时间运行的稳定性（本阶段只验证了 3 秒级）

## 七、对后续阶段的输出

M3-2/M3-3 可直接复用本阶段沉淀的底座：

- `assertNonEmpty` / `assertDateStr` / `assertDateRange` 输入校验
- `formatIpcError` + store `error` 状态（失败不静默）
- `isMarkedFrom` 长期任务来源判定（把 `'learning'` 换成 `'dev'` / `'inspiration'` 即可）
- `formatDuration` / `formatElapsed` 时长展示
- 迁移机制：新增表一律追加一个 `user_version` 版本
- CDP 验收脚本 `scripts/acceptance/m3-1-e2e.mjs` 可作为后续阶段 E2E 的模板
