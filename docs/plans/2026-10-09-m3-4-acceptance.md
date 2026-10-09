# M3-4 「今天」页卡片接线 验收记录

- 日期：2026-10-09
- 上游总览：[docs/plans/2026-10-09-m3-overview.md](./2026-10-09-m3-overview.md)
- 对应 PRD：3.3 / 8.3.4
- 本阶段为 M3 的收尾阶段，完成后 M3 全部里程碑收口

## 一、交付物

| 文件 | 说明 |
|---|---|
| `src/shared/todayCards.ts` | `pickTodayLearnItems`（排序 + 限条）、`activeProjects` |
| `src/renderer/src/components/today/TodayCards.tsx` | 学习卡片与开发卡片接真实数据 + 「进入模块 →」 |
| `src/renderer/src/components/today/TodayPage.tsx` | 新增 `onNavigate` 回调 |
| `src/renderer/src/App.tsx` | `TodayPage` 传入 `onNavigate={setPage}` |
| `src/renderer/src/components/dev/ProjectList.tsx` | 导出 `STATUS_META` 供今日卡片复用状态灯配色 |

## 二、自动化结果

```
npm test              31 文件 / 510 用例全绿     （M3-4 开工前：30 / 498 → +12）
npm run typecheck     0 错误
npm run build         三入口通过
npx electron-builder  release/LifeOS Setup 0.1.0.exe（109.67 MB）
```

## 三、端到端界面验证（CDP 驱动）

脚本：`scripts/acceptance/m3-4-e2e.mjs`；截图：`docs/acceptance-shots/23-today-cards.png`。

| # | 验证项 | 结果 |
|---|---|---|
| 1 | 播种数据（学习项 + 计时 + 项目 + 任务 + Bug） | ✅ |
| 2 | 「今天」页渲染今日卡片 | ✅ |
| 3 | 学习卡片：今日已学 **30m** + 学习中 1 项 + 学习项 **4/10** 进度条 | ✅ |
| 4 | 开发卡片：进行中项目 + **1/2 任务** + **Bug 1** + 本周 **40m** | ✅ |
| 5 | 开发卡片**不显示**非进行中项目 | ✅ |
| 6 | 学习卡片「进入模块」→ 跳转自我学习 | ✅ |
| 7 | 开发卡片「进入模块」→ 跳转开发 | ✅ |
| 8 | 无数据时显示空状态文案 | ✅ |

**8 / 8 通过。**

## 四、PRD 8.3.4 对照

| 要求 | 证据 | 状态 |
|---|---|---|
| 📖 今日学习项 + 已学时长 | E2E 第 3 项 | ✅ |
| 💻 进行中项目任务摘要 | E2E 第 4、5 项 | ✅ |
| 点击卡片跳转对应模块 | E2E 第 6、7 项 | ✅ |
| 设计灵感与游戏娱乐**无**今日卡片 | 卡片列表中不含这两项（PRD L89） | ✅ |

## 五、过程中的问题

**E2E 首跑 6/8：卡片渲染但数据为空。**

根因是测试流程与真实使用路径不一致：应用启动时就停在「今天」页，卡片在**挂载时**按需加载数据；我在播种数据后又点了「今天」——由于页面没有重新挂载，`useEffect` 不会重跑，卡片保持启动时的空数据。

真实用户流程是"在模块里操作 → 切回今天"，此时 `TodayPage` 会重新挂载并重新加载。已把 E2E 改为**先离开再回来**，与真实路径一致。

> 这类问题值得记录：**测试要么走真实路径，要么就得理解组件的数据加载时机**，不能假定"调了 API 界面就会更新"。

## 六、本阶段的设计取舍

1. **数据来源**：今日卡片不新增 IPC 通道，复用学习/开发模块已有的通道，进入「今天」页时各加载一次。
2. **只显示进行中的项目**：`activeProjects` 过滤 `status === 'in_progress'`，与开发模块状态灯语义一致。
3. **学习项排序**：`pickTodayLearnItems` 按 学习中 → 未开始 → 已完成 排序并限 3 条，避免今日卡片被已完成项占满。
4. **测试可观测性**：今日卡片根节点带 `data-today-card="learning|dev|longtasks|fitness|diet"`，供 E2E 稳定定位（吸取 M3-3 选择器歧义的教训）。

## 七、仍待人工确认

1. ~~界面观感（截图 `23-today-cards`）~~ —— **2026-10-09 用户查看后确认无问题**
2. 跨零点时今日卡片的自动刷新（`useToday` 已有跨零点钩子，本阶段未实测）
