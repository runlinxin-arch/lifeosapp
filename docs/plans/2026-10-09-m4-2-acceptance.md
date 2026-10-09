# M4-2 饮食模块 验收记录

- 日期：2026-10-09
- 计划：[docs/plans/2026-10-09-m4-2-diet.md](./2026-10-09-m4-2-diet.md)
- 对应 PRD：4.6 / 8.7.2、界面 PRD L109
- 上游总览：[docs/plans/2026-10-09-m4-overview.md](./2026-10-09-m4-overview.md)

## 一、交付物

| 层 | 文件 | 说明 |
|---|---|---|
| 迁移 | `src/main/db/index.ts` v7 | `meals`（`(date,type)` 唯一）/ `meal_plans`（`(date,type)` 唯一） |
| 类型 | `src/shared/types.ts` | `MealType` / `MealItem` / `Meal` / `MealInput` / `MealPlan` / `MealPlanInput` / `Nutrition` |
| 纯函数 | `src/shared/dietContent.ts` | JSON 列「解析 → 校验 → 序列化」：`MEAL_TYPES` / `MEAL_LABELS` / `isMealType` / `parseMealItems` / `normalizeMealItems` |
| 纯函数 | `src/shared/dietStats.ts` | `sumNutrition` / `dayNutrition` / `nutritionByMeal` / `mealByType` / `planText` / `recordedCount` / `plannedCount` / `upcomingDays` |
| 纯函数 | `src/shared/dates.ts` | 新增 `weekdayCn`（中文星期，供日期导航与横条使用） |
| 数据层 | `src/main/db/diet.ts` | 餐次 upsert（同日同餐覆盖）、计划 upsert（允许未来日期） |
| IPC | `ipc.ts` / `preload` / `lib/ipc.ts` | 8 条 `diet:*` 通道，三处一致（脚本核对通过） |
| 状态 | `src/renderer/src/stores/dietStore.ts` | 餐次/计划 + `LatestGuard` 并发守卫 + 统一错误处理 + 当前查看日期 |
| 界面 | `components/diet/*` | `DietPage` / `MealCard` / `MealItemEditor` / `NutritionPanel` / `MealPlanStrip` / `MealPlanEditor` |
| 接线 | `App.tsx` / `Sidebar.tsx` | 侧边栏「饮食」解除 disabled 并挂载页面 |
| 验收 | `scripts/acceptance/m4-2-e2e.mjs` | CDP 端到端脚本，20 项断言 |

## 二、自动化结果

```
npm test              38 文件 / 668 用例全绿   （M4-1 结束时：35 文件 / 618）
npm run typecheck     0 错误
npm run build         三入口通过
npx electron-builder  release/LifeOS Setup 0.1.0.exe
```

本阶段新增 **50 个用例**：迁移 v7 5、饮食 JSON 列 10、营养合计与日期序列 16、数据层 18、`weekdayCn` 1。

## 三、端到端界面验证（CDP 驱动）

脚本：`scripts/acceptance/m4-2-e2e.mjs`；截图：`docs/acceptance-shots/34~36`。

| # | 验证项 | 结果 |
|---|---|---|
| 1 | 侧边栏「饮食」可进入（导航已启用） | ✅ |
| 2 | 四张餐卡（早/午/晚/加餐）均为**虚线占位** | ✅ |
| 3 | 空状态提示「这一天还没有记录」 | ✅ |
| 4 | 记录早餐一项食物并显示热量 150 kcal | ✅ |
| 5 | **每餐可录入多食物及热量营养**（米饭 + 鸡胸 → 365 kcal） | ✅ |
| 6 | 允许空打卡（只记「这顿吃了」） | ✅ |
| 7 | **每日合计正确**：515 kcal / 蛋白 40 / 碳水 72 / 脂肪 7.1 | ✅ |
| 8 | 按餐次小计正确（早餐 150 / 午餐 365 / 晚餐 0 / 加餐 0） | ✅ |
| 9 | **同日同餐再次保存是覆盖**（当天记录数仍为 3） | ✅ |
| 10 | 覆盖后合计按新数值重算（150 + 465 = 615 kcal） | ✅ |
| 11 | 取消打卡后卡片回到虚线占位 | ✅ |
| 12 | 取消后合计相应减少（615 − 150 = 465 kcal） | ✅ |
| 13 | **计划横条渲染未来 14 天**，今天默认选中 | ✅ |
| 14 | 点击横条某天可切换查看日期 | ✅ |
| 15 | **为未来日期编排午餐** → 计划数 +1、横条摘要同步 | ✅ |
| 16 | 餐卡显示当天计划文本；打卡仍是虚线占位（计划与打卡互不覆盖） | ✅ |
| 17 | 为明天编排不影响今天的打卡记录（午餐 465 kcal 仍在） | ✅ |
| 18 | **刷新后未来日期的计划仍保持** | ✅ |
| 19 | 清空计划文本并保存 = 删除该计划（不留空记录） | ✅ |
| 20 | 脚本可重复运行（开头清理既有饮食数据） | ✅ |

**20 / 20 通过。**

## 四、PRD 8.7.2 逐条对照

| 验收项 | 证据 | 状态 |
|---|---|---|
| 三餐+加餐记录 | 数据层 18 用例 + E2E 第 2/4/6/9 项（四餐 + 空打卡 + 覆盖） | ✅ |
| 每餐可录入多食物及热量营养 | `parseMealItems`/`normalizeMealItems` 10 用例 + E2E 第 5 项 | ✅ |
| 每日合计正确 | `sumNutrition`/`dayNutrition`/`nutritionByMeal` 16 用例 + E2E 第 7/8/10/12 项 | ✅ |
| 饮食计划可编排未来日期 | 数据层未来日期用例 + E2E 第 13–15/18/19 项 | ✅ |
| 界面：三餐+加餐卡片（未记录虚线占位） | 截图 34/35 + E2E 第 2 项 | ✅ |
| 界面：今日摄入面板（纯数值展示） | 截图 35 + E2E 第 7/8 项；**不做进度条与目标值**（对齐 PRD L224 非目标） | ✅ |
| 界面：饮食计划横条 | 截图 36 + E2E 第 13–15 项 | ✅ |

## 五、与设计文档的偏差（需 M5 回写）

1. `meals` 增加 `(date, type)` **唯一约束**，写入走 upsert：每天每餐一条记录，避免"两顿早餐"造成合计口径歧义。
2. `meal_plans` 的 `(date, type)` 同样唯一，`content` 为**纯文本**（设计文档写"文本/JSON"，取更简单的文本）。
3. **不做热量进度条与目标值**：设计文档 5.7 提到「热量进度条（vs 参考值）」，但 PRD L224 把饮食目标列为未来扩展、PRD L109 明确「纯数值展示」。面板只显示合计数值。
4. 新增 `weekdayCn`（`@shared/dates`）：日期导航与计划横条都需要中文星期，放在通用日期工具里而不是饮食模块内。

## 六、过程中的问题与修正

1. **E2E 断言口径错误（非产品缺陷）**：首轮 13 项里 4 项 FAIL，原因是测试脚本读取 `data-meal-calories` / `data-nutrition-*` 的**属性值**，而这些属性最初写成不带数值的"钩子"（`data-meal-calories={type}` 的值是餐次名，`data-nutrition-calories` 是布尔属性 → `"true"`）。修正为让属性直接携带数值（`data-nutrition-calories={total.calories}`），断言改读属性值，比解析 `innerText` 更稳。
2. **编辑态跨日期残留**：餐卡与计划编辑器的本地 state 在切换日期时不会重置（同类型组件复用）。给 `MealCard` 加 `key={date-type}`、给 `MealPlanEditor` 加 `key={date}`，切日期即重挂载，避免把 A 天的草稿带到 B 天。
3. **空计划语义**：数据层 `upsertMealPlan` 严格要求非空内容（避免库里出现空计划行），"清空计划"由界面判定并调用 `deletePlan` —— 语义集中在界面，数据层保持严格。

## 七、仍待人工确认

1. 界面观感：截图 `docs/acceptance-shots/34~36`（四卡布局、横条密度、计划编辑器）。
2. 计划横条 14 天的信息密度是否合适（每格显示"已记录餐数 / 已编排计划数"）；若嫌窄可考虑改为 7 天 + 左右翻页。
3. `meal_plans` 只支持"某天某餐一段文本"，不支持"整周批量套用"。PRD 4.6 的"提前规划某天/某周的餐食"目前通过逐天编排满足，是否需要"周模板"待确认。

## 八、对后续阶段的输出

- **M4-3 游戏娱乐**可复用：JSON 列容错模式、`(date,type)` 唯一 + upsert 模式、store 的 `run()` + `LatestGuard`、E2E 里"数据属性直接携带数值"的断言写法。
- **M4-4「今天」页卡片**需要的接口已就绪：`diet.listMeals(date, date)` 取当天记录、`recordedCount` 判断"已记录/未记录"、`MEAL_LABELS` 展示餐次名。
