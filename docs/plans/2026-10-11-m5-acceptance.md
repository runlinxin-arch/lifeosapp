# M5 设置与数据 —— 验收记录

- 日期：2026-10-11
- 计划：[2026-10-11-m5-overview.md](./2026-10-11-m5-overview.md)
- 依据：[PRD.md](../../PRD.md) §4.8 / §8.8 / §8.9

## 一、交付内容

| 项 | 内容 | 关键文件 |
|---|---|---|
| 主题系统 | `theme.mode`（深浅）/ `theme.accent`（主题色）/ `theme.custom`（网站风格整组覆盖），CSS 变量即时生效 | `src/shared/settings.ts`、`src/main/db/settings.ts`、`src/renderer/src/lib/theme.ts` |
| 设置页 | 外观 / 提醒 / 时间轴 / 数据四区块，启用侧边栏「设置和数据」入口 | `src/renderer/src/components/settings/SettingsPage.tsx` |
| 网站风格模仿 | 主进程抓取取色 + 预览/应用/手动选色兜底 | `src/shared/themeExtract.ts`、`src/main/themeStyle.ts` |
| 数据导出/导入 | `app.db`+`images/` 打包成 `.tar.gz`；导入前先备份、失败回退、成功后重启 | `src/main/dataTransfer.ts` |
| 打包 | electron-builder 生成 NSIS 安装包 | `release/LifeOS Setup 0.1.0.exe` |
| 回写 | 设计文档回写 M2–M4 累计 schema 偏差；README / DEVELOPMENT-PLAN 更新 | `docs/2026-09-29-life-os-design.md` |

## 二、已确认决策（均落地）

| 决策 | 结论 | 落地 |
|---|---|---|
| `wishlist` 表去留 | v9 迁移删除 | `src/main/db/index.ts` v9 `DROP TABLE wishlist`（连同 plays/media） |
| 体重/体脂双线 | 接受现状 | 无需改动 |
| 饮食横条密度 | 7 天 + 翻页 | `MealPlanStrip.tsx` `DAYS=7` + ‹ › 翻页 |

## 三、验收对照（PRD 8.8 / 8.9）

| # | 条款 | 结果 |
|---|---|---|
| 1 | 深色/浅色切换即时生效 | ✅ 设置页切换 `theme.mode` → CSS 变量即时应用 |
| 2 | 网站风格模仿：有效网址生成主题可应用；无效网址报错并进入手动选色 | ✅ 抓取取色 → 预览 → 应用；失败提示原因 + 手动选色兜底 |
| 3 | 主题色更换全局生效 | ✅ `theme.accent` 覆盖 `--accent` |
| 4 | 提醒设置（声音开关 / 提前分钟数）、时间轴设置（范围 / 显示已完成） | ✅ 设置页可改，读写 M2 已打通 |
| 5 | 导出包可清空后完整恢复（含图片）；导入前备份、失败回退 | ✅ `dataTransfer.test.ts` 往返用例通过 |
| 6 | 无阻塞性 bug；单测覆盖；安装包可安装/运行/卸载 | 🔶 安装包已构建；安装/运行/卸载需在沙箱外人工验证（见 §五） |

## 四、验证结果

- `npm test`：**42 文件 / 695 用例全绿**（新增 settings 主题校验 4 项、themeExtract 6 项、dataTransfer 2 项）
- `npm run typecheck`：两份配置 **0 错误**
- `npm run build`：三入口构建成功
- `npx electron-builder --win`：产出 `release/LifeOS Setup 0.1.0.exe`（NSIS，oneClick=false）
- `& .\scripts\acceptance\m5-all.ps1`：**9/9 通过**（设置页四区块齐全、浅色切换即时生效、主题色全局生效、提醒开关/提前分钟数、时间轴范围/显示已完成、网站风格无效网址报错）

## 五、已知限制与待人工确认

1. **设置页 UI 已 E2E 验收通过**（`m5-all.ps1` 9/9）。仍待人工确认的项：**网站风格「有效网址」抓取**（依赖外网，E2E 只覆盖了无效网址报错路径；有效网址路径由 `themeExtract` 单测 + 手动验证兜底）、**导出/导入的完整流程**（弹原生文件对话框 + 导入后重启，E2E 不易自动化，由 `dataTransfer.test.ts` 往返用例覆盖）、**安装包安装/运行/卸载**（需在正常桌面环境执行 `release/LifeOS Setup 0.1.0.exe`）。
2. **网站风格只提取配色，不做字体**：设计文档原写「配色/字体」，字体提取未实现（应用使用系统字体，收益有限），已回写设计文档口径。
3. **安装包用默认 Electron 图标**：未设置自定义应用图标（`default Electron icon is used`），属打磨项，可后续补充。
4. **package.json 缺 `author` 字段**：electron-builder 提示，不影响构建，可补。
