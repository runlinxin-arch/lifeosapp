# M3 跨零点自动刷新 验证记录

- 日期：2026-10-09
- 触发：M3 验收记录中"跨零点时「今天」页卡片的自动刷新"一项待验证
- 结论：**验证通过**。跨零点后「今天」页、顶部时间轴均自动滚动到新的一天，且会重新排程等待下一个零点。

## 一、被测实现

`src/renderer/src/hooks/useToday.ts`：

```ts
const schedule = () => {
  timer = setTimeout(() => {
    setToday(todayStr())
    schedule()          // 跨零点后继续排程下一个零点
  }, msUntilNextMidnight(new Date()) + 1000)
}
```

- 被 **9 个组件**使用，其中 `TimelineBar` 位于 `AppShell`、**常驻挂载**，因此它的实例决定了时间轴能否自动滚动
- `msUntilNextMidnight` 是纯函数（`src/renderer/src/lib/clock.ts`），已有 5 个单测覆盖（含跨月边界）

## 二、为什么不直接改系统时间

调整系统时钟会影响整台机器（其他进程、日志、证书校验等），代价与风险都超出一次验证所需。改为**在渲染页面内替换 `Date`**，只影响被测应用。

## 三、可控模拟的做法

通过 CDP `Page.addScriptToEvaluateOnNewDocument` 在**文档启动前**注入，保证 React 挂载时就用上假时钟（否则常驻的 `TimelineBar` 会先用真实时钟排好 24 小时的定时器，之后注入无效）。

```js
class FakeDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(fakeNow())   // fakeNow = base + 真实流逝时间
    else super(...args)
  }
  static now() { return fakeNow() }
}
window.Date = FakeDate
```

**起点取真实今天的 23:59:50**，时间按正常速度流逝 → 约 11 秒后应用真的经历一次跨零点。同时监视 `setTimeout`，记录 ≥2 秒的定时器，用来验证排程行为。

### 为什么不加速时钟（走过的弯路）

初版用 21600× 加速（1 真实秒 = 6 假小时），想连续观察多次跨天，结果**只能观察到 1 次**。

原因：hook 的延迟是 `msUntilNextMidnight(假时钟) + 1000`，那个 `+1000` 是交给**真实** `setTimeout` 的毫秒。时钟一加速，这 1 秒缓冲会被放大成 **6 假小时**——第一次跨天后假时间冲到次日凌晨，下一次排程算出"距零点还有约 24 假小时"，作为真实延迟就是**要等 24 小时**。

**倍率必须保持 1，时间语义才不被扭曲。**

## 四、验证结果（`scripts/acceptance/m3-midnight-e2e.mjs`，7/7 通过）

| # | 验证项 | 结果 |
|---|---|---|
| 1 | 播种 7 天待办（第 0–6 天） | ✅ |
| 2 | **启动时排出「距零点 + 1 秒缓冲」的定时器** —— 实测 `10989ms`（23:59:50 起算应为 11000ms） | ✅ |
| 3 | 基线：跨零点前「今天」页显示**第 0 天**的待办 | ✅ |
| 4 | **跨零点后自动切换到次日待办** —— 第 0 天 → 第 1 天（页面时钟 `23:59:52` → `00:00:01`） | ✅ |
| 5 | **跨零点后自动重新排程到下一个零点** —— 实测 `86399984ms ≈ 24.00 小时` | ✅ |
| 6 | **顶部时间轴随之滚动** —— 标签 `10/6 10/13…` → `10/7 10/14…` | ✅ |
| 7 | 页面持续可用未崩溃 | ✅ |

第 4 项同时证明了**数据重载**：`TodayPage` 的 `useEffect(..., [load, today])` 在 `today` 变化时重新拉取当日待办，所以列表从「第 0 天」换成了「第 1 天」。

第 6 项是 `TimelineBar`（常驻实例）的 `useToday` 生效的直接证据。

截图：`docs/acceptance-shots/29-midnight-before.png`、`30-midnight-after.png`。

## 五、覆盖范围说明

| 部分 | 覆盖方式 |
|---|---|
| `msUntilNextMidnight` 的日期计算 | 单元测试（5 例，含零点整、正午、当天最后一刻、跨月） |
| `computeTimelineRange` 随日期滚动 | 单元测试（`每次调用都基于传入的今天重新计算`） |
| **`useToday` 的定时触发与重新排程** | **本 CDP 模拟测试**（7 例） |
| 各组件对 `today` 变化的响应 | 由本测试的断言 4、6 间接覆盖 |

**未做**：`useToday` 的组件级单测。项目当前 vitest 环境是 node（无 jsdom、无 @testing-library/react），补上需要新增依赖并改造测试环境。考虑到该 hook 的逻辑已被上述两层覆盖，暂不引入。

## 六、结论

跨零点自动刷新**按设计工作**：到点触发、更新日期、重载当日数据、滚动时间轴，并为下一个零点重新排程。M3 验收记录中的最后一项待人工确认项据此关闭。
