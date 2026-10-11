# 游戏自动检测（A-minus）设计与计划

- 日期：2026-10-11
- 类型：M4 游戏娱乐模块的增强（用户需求，自动记录游玩时长）
- 方案：**A-minus**（米哈游硬编码 + Steam 进程名匹配，不做全路径、不做多库 vdf）
- 对应数据：复用现有 `plays` 表（`game / date / minutes`），无迁移、无新表

## 目标

检测到「米哈游 / Steam 已装游戏」的进程启动 → 退出后，自动写一条游玩记录（游戏名 + 日期 + 时长）。同一游戏探测一次（构建映射并缓存），后续启动只记时长；不同游戏按名称分类（`plays` 的 `gameSummaries` 已天然支持）。

## 非目标（YAGNI）

- 不解析 Steam 多库 `libraryfolders.vdf`（只扫默认库 `steamapps`）
- 不枚举进程全路径（只用 `tasklist` 的进程名）
- 不建 `games` 表（映射放内存，启动构建 / 每 10 分钟刷新）
- 不做"正在玩"实时状态（用户选 B：只自动记录）
- 不联网、不碰 Epic/GOG 等其他平台

## 架构

- `src/shared/gameDetect.ts`：纯函数（可单测）—— ACF 解析、exe 挑选、映射构建、进程名匹配、时长取整、会话状态机。
- `src/main/gameDetect.ts`：轮询器 + IO 适配（`tasklist` / 注册表 / 目录扫描），复用 `ent.createPlay` 写库。
- 设置：`src/shared/settings.ts` 加 `autoGameLog.enabled`（默认 `true`）；开关 UI 归 M5。
- 接线：`src/main/index.ts` 像 `startReminders` 一样启动/停止轮询器。

## 检测来源

- **米哈游（硬编码）**：原神 `yuanshen.exe`/`genshinimpact.exe`、崩坏：星穹铁道 `starrail.exe`、绝区零 `zenlesszonezero.exe`、崩坏3 `bh3.exe`。
- **Steam（进程名匹配）**：读注册表 `HKCU\Software\Valve\Steam\SteamPath` → 解析 `steamapps\appmanifest_*.acf`（`name`/`installdir`）→ 浅列 `common\<installdir>\`（最多两层）的 `.exe` → 用 `pickGameExes` 挑出主程序 exe → 构建 `exe名 → 游戏名` 映射。
- 米哈游启动器 `launcher.exe`/`hyp.exe`、`steam.exe` 不在映射里，天然排除。

## 轮询与状态机（每 30s）

1. `tasklist /FO CSV` 拿进程名（小写、去 `.exe`）。
2. `matchRunningGames` 与映射取交集 → 当前在玩的游戏集合。
3. `stepSessions`：新出现记 `startedAt`；消失结账返回 `{game, minutes}`。
4. `minutes ≥ 1` 才 `createPlay`（秒崩不算）；`sessionMinutes` 夹到 0–1440。

## 明确的取舍（可接受）

- 时长是轮询粒度（±30s），且从 LifeOS 首次看到游戏算起（先开游戏再开 LifeOS 会低估）。
- 挂机/休眠：进程活着就算在玩。
- LifeOS 关闭时正在玩的会话丢失（内存态）。
- 只覆盖米哈游 4 款 + Steam 默认库已装游戏；多盘库/特殊 exe 可能漏检。
- 与手动录入不去重。

## 测试

- 单测：`parseAcf` / `pickGameExes` / `buildGameMap` / `matchRunningGames` / `sessionMinutes` / `stepSessions`。
- 轮询器：IO 注入式，单测"新出现→记时、消失→写库"。
- 无法 E2E 驱动真实游戏进程 → 以单测 + 手动实测为准。
