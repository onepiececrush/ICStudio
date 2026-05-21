# ICStudio Tauri MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建可运行的 ICStudio Tauri 桌面应用 MVP，承接现有工业上位机原型和需求文档。

**Architecture:** 根目录作为 Tauri v2 应用工程，原始资料归档到 `docs/source-materials/`。React 前端负责应用壳、仪表盘和模块导航，Rust 后端先提供快照数据 command，后续扩展通信和协议解析。

**Tech Stack:** Tauri v2, Rust, React, TypeScript, Vite, npm.

---

### Task 1: Scaffold Tauri App

**Files:**
- Create: root Tauri app files

- [x] 使用 Tauri React TypeScript 模板初始化工程，并迁移到项目根目录
- [x] 检查 `package.json`、`src-tauri/tauri.conf.json`、`src/` 是否生成。
- [x] 运行 `npm install`，确认依赖安装完成。

### Task 2: Define Backend Snapshot Command

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [x] 定义 `AppSnapshot`、`ProjectInfo`、`ConnectionInfo`、`MetricCard`、`ActivityItem`、`DeviceStatus` 序列化结构。
- [x] 实现 `get_app_snapshot()` command，返回与当前文档一致的储能系统测试项目、Modbus TCP 连接、设备状态和活动数据。
- [x] 注册 command 到 Tauri invoke handler。

### Task 3: Rebuild Frontend Shell

**Files:**
- Replace: `src/App.tsx`
- Replace: `src/App.css`
- Modify: `src/main.tsx`

- [x] 实现左侧导航、顶部状态栏、主工作区和模块占位页。
- [x] 首页包括指标卡、储能拓扑、趋势面板、快捷操作、设备状态表和最近活动。
- [x] 前端优先调用 `get_app_snapshot`；浏览器模式下使用同结构 mock 数据。

### Task 4: Add Frontend Dependencies

**Files:**
- Modify: `package.json`

- [x] 添加 `lucide-react`，用于导航和操作图标。
- [x] 使用轻量 SVG 趋势图，避免引入重型图表首包。
- [x] 运行 `npm install` 更新 lockfile。

### Task 5: Verify

**Files:**
- Read: project root

- [x] 运行 `npm run build` 验证 TypeScript 和 Vite 构建。
- [x] 运行 `npm run tauri build` 验证 Tauri 侧；当前阻塞为本机缺少 MSVC `link.exe`。
- [x] 已启动开发服务器，URL 为 `http://127.0.0.1:1420/`。

### Task 6: Completion Notes

**Files:**
- Modify: `docs/2026-05-21-tauri-mvp-plan.md`

- [x] 勾选已完成任务。
- [x] 记录验证命令和结果。
- [x] 明确下一阶段建议：通信中心或协议导入。

## Verification Results

- `npm run build`: 通过。Vite 输出 `dist/index.html`、`assets/index-Bt68GU_y.css`、`assets/index-Cx9TsiL-.js`，无 chunk 警告。
- `rustup update stable`: 完成。Rust 从 `1.85.0` 更新到 `1.95.0`。
- `winget install Microsoft.VisualStudio.2022.BuildTools`: 完成。安装了 Visual Studio Build Tools 2022、MSVC 14.44.35207 与 Windows SDK 10.0.26100.0。
- `cargo check`: 通过。Build Tools 注册完成后，普通 shell 下 `icstudio v0.1.0` 检查完成。
- `npm run tauri build`: 通过。生成 `src-tauri/target/release/icstudio.exe`、`src-tauri/target/release/bundle/msi/ICStudio_0.1.0_x64_en-US.msi` 和 `src-tauri/target/release/bundle/nsis/ICStudio_0.1.0_x64-setup.exe`。
- Playwright `1440x900` 首页截图：已生成 `output/playwright/icstudio-root-dashboard-final.png`，无 console warning/error。
- Playwright 模块导航截图：已生成 `output/playwright/icstudio-simulator-1440.png`，无 console error。

## Next Step

建议进入通信中心，实现 Modbus TCP 主站、报文助手、报文日志和基础统计。

## Structure Update

- Tauri 应用已提升到项目根目录。
- 原始资料已归档到 `docs/source-materials/`：
  - `requirements/`: 上位机功能文档与通用功能规划文档。
  - `visuals/`: 首页效果图与平台宣传图。
  - `protocols/`: PCS Modbus V3.13 / BMS V1.06 协议表。
  - `prototype/`: 旧单页 HTML 原型 `legacy-index.html`。
