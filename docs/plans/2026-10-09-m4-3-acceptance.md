# M4-3 游戏娱乐模块 验收记录

- 日期：2026-10-09
- 计划：[docs/plans/2026-10-09-m4-3-entertainment.md](./2026-10-09-m4-3-entertainment.md)
- 对应 PRD：4.7 / 8.7.3、界面 PRD L111
- 上游总览：[docs/plans/2026-10-09-m4-overview.md](./2026-10-09-m4-overview.md)

## 一、交付物

| 层 | 文件 | 说明 |
|---|---|---|
| 迁移 | `src/main/db/index.ts` v8 | `plays` / `wishlist` / `media`（含索引） |
| 类型 | `src/shared/types.ts` | `Play` / `WishItem` / `Media` / `MediaType` / `MediaStatus` + Input/Patch |
| 纯函数 | `src/shared/entContent.ts` | 枚举与标签：`MEDIA_TYPES` / `MEDIA_STATUSES` / `PRIORITY_LABELS` / `PRIORITY_ORDER` / `clampRating` / `normalizeComment` / `stars` |
| 纯函数 | `src/shared/entStats.ts` | 聚合：`gameSummaries` / `totalMinutes` / `recentPlays` / `sortWishlist` / `mediaGroups` / `mediaByType` |
| 数据层 | `src/main/db/entertainment.ts` | 游玩/愿望单/影视书 CRUD（合并语义更新 + 校验） |
| IPC | `ipc.ts` / `preload` / `lib/ipc.ts` | 12 条 `ent:*` 通道，三处一致（脚本核对通过） |
| 状态 | `src/renderer/src/stores/entertainmentStore.ts` | 三组数据 + 页签状态 + `LatestGuard` + 统一错误处理 |
| 界面 | `components/entertainment/*` | `EntertainmentPage` / `PlayLog` / `Wishlist` / `MediaList` / `StarRating` |
| 接线 | `App.tsx` / `Sidebar.tsx` | 侧边栏「游戏娱乐」解除 disabled 并挂载页面 |
| 验收 | `scripts/acceptance/m4-3-e2e.mjs` | CDP 端到端脚本，19 项断言 |

## 二、自动化结果

```
npm test              41 文件 / 725 用例全绿   （M4-2 结束时：38 文件 / 668）
npm run typecheck     0 错误
npm run build         三入口通过
npx electron-builder  release/LifeOS Setup 0.1.0.exe
```

本阶段新增 **57 个用例**：迁移 v8 4、枚举与展示换算 10、聚合纯函数 15、数据层 28。

## 三、端到端界面验证（CDP 驱动）

脚本：`scripts/acceptance/m4-3-e2e.mjs`；截图：`docs/acceptance-shots/37~39`。

| # | 验证项 | 结果 |
|---|---|---|
| 1 | 侧边栏「游戏娱乐」可进入（导航已启用） | ✅ |
| 2 | 「游玩记录」页签可切换，空状态提示正常 | ✅ |
| 3 | 切到「愿望单」页签（空状态正常） | ✅ |
| 4 | 切到「影视书」页签，三个状态分组齐全 | ✅ |
| 5 | 记录一条游玩（90 分钟） | ✅ |
| 6 | **按游戏自动聚合计总时长**：90 + 30 = 120 分钟、2 次、显示 `2h` | ✅ |
| 7 | 明细列出两条记录 | ✅ |
| 8 | 聚合按总时长降序（丝之歌 300 > 老头环 120） | ✅ |
| 9 | 顶部累计时长 420 分钟（7h） | ✅ |
| 10 | 删除一条后聚合同步（120 − 30 = 90 分钟、1 次） | ✅ |
| 11 | **愿望单按优先级排序**（高 → 中 → 低） | ✅ |
| 12 | 愿望单计数正确 | ✅ |
| 13 | 调整优先级后重新排序（低→高 后：高高中） | ✅ |
| 14 | **影视书记录五星评分与短评**（4 星 + 短评入库与展示） | ✅ |
| 15 | 表单评分默认 0（未评分） | ✅ |
| 16 | **影视书按状态分组**（看完/在看/想看 各 1） | ✅ |
| 17 | 再点同一颗星清零（回到未评分 0） | ✅ |
| 18 | 刷新后游玩记录与聚合仍在（持久化） | ✅ |
| 19 | 脚本可重复运行（开头清理既有数据） | ✅ |

**19 / 19 通过。**

## 四、PRD 8.7.3 逐条对照

| 验收项 | 证据 | 状态 |
|---|---|---|
| 游玩记录按游戏聚合计总时长 | `gameSummaries` 15 用例 + E2E 第 6/8/10 项 | ✅ |
| 愿望单（游戏 + 优先级） | `sortWishlist` 用例 + 数据层 28 用例 + E2E 第 11/13 项 | ✅ |
| 影视书记录（评分、短评） | `clampRating`/`stars` 10 用例 + E2E 第 14/17 项 | ✅ |
| 三页签界面 | 截图 37~39 + E2E 第 2–4 项 | ✅ |
| 不做游戏库（设计 §6.7 明确） | 未实现，符合非目标 | ✅ |

## 五、与设计文档的偏差（需 M5 回写）

1. `plays.minutes` 校验为 **1–1440 整数**（一天最多 24 小时），避免误填造出天文数字总时长。
2. `media.rating` 为 **0–5 整数**，`0` 表示"未评分"，与五星组件的空态一致（设计文档只写"评分"）。
3. 按游戏聚合**大小写敏感**：`Elden Ring` 与 `elden ring` 视为两个游戏，不自作主张合并用户输入（分组前仅去首尾空白）。
4. 游玩记录聚合**跨全部历史**（不按日期区间裁剪），因为 PRD 要求的是"按游戏自动聚合计总时长"。

## 六、过程中的问题与修正

1. **E2E 断言写错两处（非产品缺陷）**：
   - "删除一条 → 聚合同步"误以为明细第一行是老头环；实际明细按「日期倒序、同日 id 倒序」，第一行是最后录入的丝之歌。改为按文本定位老头环那条再删，并断言 120 → 90、2 次 → 1 次。
   - "调整优先级后重新排序"期望 `[high, high, low]`，实际 `[high, high, mid]` —— 把 low 提到 high 后，剩下的 mid 自然排到第三，**产品行为正确**，是断言写错。
2. **CDP 顶层 `await` 不被支持**：`evaluate("(await window.lifeos...)")` 报 `SyntaxError: Unexpected identifier 'window'`，需包成 `(async () => ...)()`。已在脚本中统一。
3. **页签状态的进程内残留**：`tab` 存在 zustand store 里，上一轮脚本结束时停在「影视书」，重跑时"默认停在游玩记录"会假失败。改为显式切回「游玩记录」再断言，保证脚本可重复运行。

## 七、仍待人工确认

1. 界面观感：截图 `docs/acceptance-shots/37~39`（三页签、聚合表、星级与分组）。
2. 游玩记录的"聚合 + 明细"双列表是否够用；是否需要按游戏筛选明细、或按周/月切换统计区间（当前聚合为全历史）。
3. 影视书目前只按**状态**分组，未按类型分组（`mediaByType` 纯函数已就绪，界面暂未用）。是否需要加"类型筛选"待确认。

## 八、对后续阶段的输出

- **M4-4「今天」页卡片**：PRD L89 明确游戏娱乐**无**今日卡片，因此 M4-4 只需接健身与饮食两张卡；本模块的 store/纯函数不参与卡片聚合。
- **M5 设置与数据**可复用：`clampRating`/`normalizeComment` 的"入库前统一换算"写法、三页签组件的 `data-tab` 钩子与状态存放位置（store 而非组件，跨挂载保持）。
