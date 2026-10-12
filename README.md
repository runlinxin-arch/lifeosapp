# LifeOS

个人工作与生活管理桌面应用 —— 把待办、日程、长期计划、学习、开发、灵感、健身、饮食统一到一个本地应用里。

> 单用户、纯本地：数据全部存在本机应用数据目录（Windows `%APPDATA%\lifeos\`，macOS `~/Library/Application Support/lifeos/`），不联网、无账号。

[![CI](https://github.com/runlinxin-arch/lifeosapp/actions/workflows/ci.yml/badge.svg)](https://github.com/runlinxin-arch/lifeosapp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.1-blue.svg)](https://github.com/runlinxin-arch/lifeosapp/releases/latest)

**下载安装包**（均来自 [最新 Release](https://github.com/runlinxin-arch/lifeosapp/releases/latest)）：

| 平台 | 安装包 | 说明 |
| --- | --- | --- |
| Windows 10/11（x64） | `LifeOS Setup 0.1.1.exe` | NSIS 安装向导，可改安装目录 |
| macOS Apple Silicon（M 系列） | `LifeOS-0.1.1-mac-arm64.dmg` | 拖进「应用程序」 |
| macOS Intel（x64） | `LifeOS-0.1.1-mac-x64.dmg` | 拖进「应用程序」 |

### 下载与安装

**macOS**：打开 dmg，把 LifeOS 拖进「应用程序」。安装包**没有 Apple 开发者签名与公证**（需要付费账号），
所以首次打开会被 Gatekeeper 拦下 —— 按下面任一种方式放行一次即可：

1. 双击 App，看到「无法验证开发者 / 无法验证是否包含恶意软件」后，打开「系统设置 → 隐私与安全性」，
   在「安全性」区域点「仍要打开」，再确认一次。
   > macOS 15 Sequoia 起「右键 → 打开」不再直接放行，必须走系统设置这一步。
2. 或者终端执行一次（按实际安装路径调整）：

   ```bash
   xattr -dr com.apple.quarantine /Applications/LifeOS.app
   ```

包内的 `LifeOS.app` 是 ad-hoc 签名（`mac.identity: "-"`），发布前由 CI 做严格校验（见[发布](#发布)），
不会出现「App 已损坏」；若遇到该提示，说明下载不完整，重新下载即可。

**Windows**：运行 `.exe`，安装向导里可以改安装目录。

## 技术栈

Electron 44（electron-vite）+ React 18 + TypeScript + Vite + Tailwind CSS + Zustand + `node:sqlite` + Vitest + electron-builder

- 渲染进程**不直接访问数据库与文件系统**，一切读写经 IPC 到主进程（`src/main/ipc.ts` / `src/preload/index.ts` / `src/renderer/src/lib/ipc.ts` 三处契约一致）
- 迁移只追加不改写：`user_version` v1 → **v9**（`src/main/db/index.ts`）
- 统计口径一律是共享层纯函数（`src/shared/*Stats.ts`），界面只做展示

## 快速开始

```bash
npm install
npm run dev        # 开发模式
npm test           # Vitest（46 文件 / 710 用例）
npm run typecheck  # tsc 两份配置，0 错误
npm run build      # 构建三入口到 out/
npm run dist:win   # 打 Windows 安装包到 release/（NSIS .exe）
npm run dist:mac   # 打 macOS 安装包到 release/（.dmg，必须在 macOS 上执行）
```

## 发布

推送 `v*` tag 触发 `.github/workflows/release.yml`，两个 runner 并行打包后汇总到同一个 Release：

| 平台 | runner | 产物 |
| --- | --- | --- |
| Windows | `windows-latest` | `LifeOS Setup <版本>.exe`（NSIS） |
| macOS | `macos-latest` | `LifeOS-<版本>-mac-arm64.dmg`、`LifeOS-<版本>-mac-x64.dmg` |

macOS 侧发布前有三道门禁，任一不过就整单不发：

1. `codesign --verify --deep --strict` 通过，且 `Contents/_CodeSignature/CodeResources` 存在
   —— 挡住「只带 linker 签名」这类会让用户看到「App 已损坏」的半成品；
2. `hdiutil verify` 通过，挂载 dmg 复验其中的 `LifeOS.app` 签名、`CFBundleIdentifier` 与版本号；
3. 解包后的 App 在 runner 上启动 25 秒不崩，且已初始化 `app.db`。

```bash
# 本地打同一套包（macOS 包只能在 macOS 上打）
npm run dist:win
npm run dist:mac
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

# M5 设置页回归
& .\scripts\acceptance\m5-all.ps1
```

验收脚本**不会触碰真实数据**：应用数据目录可由 `LIFEOS_DATA_DIR` 覆盖，runner 会在 `%TEMP%` 的一次性目录里跑，并断言真实 `app.db` 与 `images/` 指纹未变；会清库的脚本在未设置该变量时直接拒绝运行。

验收记录：`docs/plans/*-acceptance.md`；界面截图：`docs/acceptance-shots/`。

## 目录结构

```
build/       应用图标（icon.png，Windows .ico 与 macOS .icns 由 electron-builder 生成）
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

[MIT](LICENSE) © 2026 runlinxin-arch
