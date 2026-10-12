# 更新日志

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)（SemVer）。

## [v0.1.1] - 2026-10-12

### 新增

- **macOS 安装包**：新增 `dmg` 目标（arm64 / x64 两个架构），与 Windows 安装包发布在同一个 Release，
  README 补充下载与 Gatekeeper 首次放行说明。
- **跨平台 Release 工作流**：改为 Windows + macOS 双平台矩阵并行打包，汇总后统一创建 Release；
  macOS 侧加三道发布门禁（严格签名校验 + `_CodeSignature/CodeResources`、`hdiutil verify` 并挂载 dmg 复验
  bundle 标识/版本、打包产物真机启动 25s 并确认数据库初始化）。
- **CI 覆盖 macOS**：测试 / 类型检查 / 构建同时在 `windows-latest` 与 `macos-latest` 上运行。
- **应用图标**：`build/icon.png`（1024×1024，由 `scripts/dev/make-icon.py` 生成），替换 Electron 默认图标，
  Windows `.ico` 与 macOS `.icns` 由 electron-builder 自动生成。

### 变更

- electron-builder 25.1.8 → 26.15.3，macOS 用 `mac.identity: "-"` 做确定性 ad-hoc 签名（无开发者证书也能装）。
- 新增 `npm run dist:win` / `npm run dist:mac` 脚本。
- 修正文档里的应用数据目录：Windows 实为 `%APPDATA%\lifeos\`，macOS 为 `~/Library/Application Support/lifeos/`。

## [v0.1.0] - 2026-10-11

首个完整版本：M1–M5 全部里程碑完成。

### 功能

- **M1 骨架**：项目脚手架、深色主题、顶部时间轴、侧边导航、「今天」页待办 CRUD、SQLite 落地。
- **M2 核心互通**：日程（周/月视图、重复事件、提醒）、待办⇄日程互通、长期任务双通道上轴、滚动备份。
- **M3 工作模块**：自我学习 / 开发（项目·看板·Bug·计时·片段·笔记）/ 设计灵感（瀑布流·画板·捕获）。
- **M4 生活模块**：健身（计划·打卡·曲线·统计）、饮食（三餐·营养·计划）、今天页卡片接线。
- **M5 设置与数据**：深浅色 / 主题色 / 网站风格模仿、提醒与时间轴设置、数据导出导入（`.lifeos`）、安装包打包。

### 打磨（8 项隐患修复）

1. 浅色模式下模块色对比度不足
2. 主题色硬编码残留（checkbox 不跟随主题色）
3. 启动先闪深色
4. 「提前提醒 = 0」语义不清
5. 网站抓取无体积上限
6. 导入失败若落在关库之后
7. dev 模式导入后重启不可靠
8. `.tar.gz` 多段扩展名在文件对话框的过滤不确定

### 移除

- 游戏娱乐模块（游玩 / 影视 / 书籍）于 2026-10-11 移除（连同愿望单与游戏自动检测）。
