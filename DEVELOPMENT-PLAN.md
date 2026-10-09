# LifeOS 开发计划总览

- 日期：2026-09-29
- 依据：[PRD.md](./PRD.md)、[docs/2026-09-29-life-os-design.md](./docs/2026-09-29-life-os-design.md)
- 详细执行计划：每里程碑开工前产出，存 `docs/plans/`
  - M1 详细计划：[docs/plans/2026-09-29-m1-skeleton.md](./docs/plans/2026-09-29-m1-skeleton.md)
  - M2 详细计划：[docs/plans/2026-09-30-m2-core-interop.md](./docs/plans/2026-09-30-m2-core-interop.md)
  - M2 验收记录：[docs/plans/2026-09-30-m2-acceptance.md](./docs/plans/2026-09-30-m2-acceptance.md)
  - M3 总览计划：[docs/plans/2026-10-09-m3-overview.md](./docs/plans/2026-10-09-m3-overview.md)
  - M3-1 详细计划（共享底座 + 自我学习）：[docs/plans/2026-10-09-m3-1-learning.md](./docs/plans/2026-10-09-m3-1-learning.md)

## 技术栈（全里程碑共用）

Electron（electron-vite）+ React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui + Zustand + better-sqlite3 + Vitest + electron-builder

**全局约束（任何任务都必须遵守）：**

1. 数据目录 `%APPDATA%\LifeOS\`（`app.db` + `images/` + `backups/`）
2. 渲染进程禁止直接访问数据库；一切读写经 IPC 到主进程
3. 多步写入必须包在 SQLite 事务中
4. 深色色板：底色 `#1e1f24`、卡片 `#26272e`、描边 `#3a3b45`、强调 `#7c8cff`、正文 `#e4e4e7`、次要 `#8b8d98`
5. 模块色：日程 `#7c8cff`、学习 `#4ade80`、开发 `#3498db`、灵感 `#e879c9`、健身 `#e74c3c`、饮食 `#f39c12`、娱乐 `#a06ee1`、独立 `#8b8d98`
6. 每完成一个可独立验收的任务立即 commit

## 里程碑路线

| 里程碑 | 内容 | 依赖 | 产出物 | 对应验收 |
|---|---|---|---|---|
| **M1 骨架** | 项目脚手架、深色主题、顶部时间轴（紧凑/展开/浮层）、侧边导航、「今天」页待办 CRUD、今日卡片框架、SQLite 落地 | 无 | 可运行的桌面应用，数据重启不丢 | PRD 8.1 / 8.2 / 8.3 |
| **M2 核心互通** | 日程模块（周/月视图、事件 CRUD、重复事件、提醒）、待办⇄日程互通、长期任务双通道上轴、滚动备份 | M1 | 日历可用、互通闭环、备份恢复 | PRD 8.4 / 8.5 / 8.1 |
| **M3 工作模块** | 自我学习（清单/进度/笔记/统计）、开发（项目/看板/Bug/计时/片段/笔记）、设计灵感（瀑布流/画板/捕获） | M1（时间轴标记入口） | 三个工作模块完整可用 | PRD 8.6 |
| **M4 生活模块** | 健身（计划/打卡/曲线/统计）、饮食（三餐/营养/计划）、游戏娱乐（游玩/愿望单/影视书） | M1 | 三个生活模块完整可用、今日卡片全部激活 | PRD 8.7 / 8.3 |
| **M5 设置与数据** | 外观（深浅切换/主题色/网站风格模仿）、提醒设置、数据导出/导入、整体打磨 | M2–M4 | 可交付安装包 | PRD 8.8 / 8.9 |

## 里程碑间任务依赖图

```
M1 ──┬──► M2 ──┐
     │         ├──► M5
     ├──► M3 ──┤
     └──► M4 ──┘
```

## M1 任务分解（详见 docs/plans/2026-09-29-m1-skeleton.md）

1. 项目脚手架（electron-vite + 依赖 + Tailwind + shadcn + dev 跑通）
2. 共享类型 + 日期工具（TDD）
3. 数据库层（连接/迁移/tasks/long_tasks CRUD + 单测）
4. IPC 契约（preload + 渲染端封装）
5. 主题 + AppShell + 侧边导航
6. 「今天」页待办 CRUD（zustand + IPC）
7. 常驻时间轴（紧凑/展开/浮层/新建长期任务）
8. 今日卡片框架
9. 打包配置 + M1 验收清单

## M2–M5 任务预分解（开工时展开为详细计划）

**M2：**
- events 表 + 事件 CRUD + 重复事件展开引擎（纯函数，TDD）
- 周视图 / 月视图组件
- 系统通知提醒（主进程轮询）
- 待办⇄日程双向转换
- long_tasks 与模块联动接口、独立创建
- 滚动备份（启动备份 + 保留 10 份 + 损坏自动恢复）

**M3：**
- learn_items / learn_notes / learn_sessions 三张表 + 界面 + 统计
- projects / dev_tasks / bugs / snippets / tech_notes / dev_sessions + 看板拖拽 + 计时器
- inspiration_boards / inspirations + 图片存取 + 瀑布流 + 捕获弹窗
- 各模块"标记为长期任务"入口统一接入时间轴

**M4：**
- workout_plans / workout_logs / body_metrics + 打卡 + 曲线
- meals / meal_plans + 营养合计
- plays / wishlist / media
- 「今天」页右侧卡片全部接入真实数据

**M5：**
- settings 读写 + 浅色模式 + 主题色
- 网站风格模仿（主进程抓取 + 取色 + 主题预览应用 + 手动兜底）
- 数据导出（db + images 打包）/ 导入恢复（先备份后恢复）
- 整体验收 + electron-builder 安装包
