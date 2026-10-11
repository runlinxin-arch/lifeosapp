# LifeOS

个人工作与生活管理桌面应用 —— 把待办、日程、长期计划、学习、开发、灵感、健身、饮食统一到一个本地应用里。

> 单用户、纯本地：数据全部存在 `%APPDATA%\LifeOS\`，不联网、无账号。

## 技术栈

Electron 44（electron-vite）+ React 18 + TypeScript + Vite + Tailwind CSS + Zustand + `node:sqlite` + Vitest + electron-builder

- 渲染进程**不直接访问数据库与文件系统**，一切读写经 IPC 到主进程（`src/main/ipc.ts` / `src/preload/index.ts` / `src/renderer/src/lib/ipc.ts` 三处契约一致）
- 迁移只追加不改写：`user_version` v1 → **v9**（`src/main/db/index.ts`）
- 统计口径一律是共享层纯函数（`src/shared/*Stats.ts`），界面只做展示

## 快速开始

```bash
npm install
npm run dev        # 开发模式
npm test           # Vitest（42 文件 / 695 用例）
npm run typecheck  # tsc 两份配置，0 错误
npm run build      # 构建三入口到 out/
npx electron-builder   # 打 Windows 安装包到 release/
```

## 里程碑进度

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M1 | 骨架、深色主题、顶部时间轴、今天页待办、SQLite 落地 | ✅ |
| M2 | 日程（周/月视图、重复事件、提醒）、待办⇄日程互通、滚动备份 | ✅ |
| M3 | 自我学习 / 开发 / 设计灵感 三个工作模块 | ✅ |
| M4 | 健身 / 饮食 两个生活模块 + 今天页卡片接线 | ✅ |
| M5 | 设置与数据（外观、提醒、导出导入、整体打磨） | ✅ |

> 注：游戏娱乐模块（游玩/影视/书籍）已于 2026-10-11 移除。

需求与设计：[PRD.md](PRD.md) · [设计文档](docs/2026-09-29-life-os-design.md) · [开发计划总览](DEVELOPMENT-PLAN.md)

## 验收

每个阶段都有可复跑的端到端验收脚本（通过 CDP 驱动真实渲染进程，断言 DOM 与数据库状态）：

```powershell
# M3 四阶段回归
& .\scripts\acceptance\m3-all.ps1

# M4 五阶段回归（含跨零点）
& .\scripts\acceptance\m4-all.ps1
```

验收脚本**不会触碰真实数据**：应用数据目录可由 `LIFEOS_DATA_DIR` 覆盖，runner 会在 `%TEMP%` 的一次性目录里跑，并断言真实 `app.db` 与 `images/` 指纹未变；会清库的脚本在未设置该变量时直接拒绝运行。

验收记录：`docs/plans/*-acceptance.md`；界面截图：`docs/acceptance-shots/`。

## 目录结构

```
src/
  main/       主进程：db（迁移/数据层）、ipc、backup、reminders、images
  preload/    contextBridge 暴露 window.lifeos
  renderer/   React 界面：components/{today,schedule,learn,dev,inspiration,fitness,diet} + stores
  shared/     跨进程共享：类型、纯函数（日期/统计/校验/筛选）
tests/        Vitest 单测
scripts/      验收脚本与工具
docs/         设计文档、执行计划、验收记录、截图
```

## 许可

未指定（如需开源请补充 LICENSE）。
