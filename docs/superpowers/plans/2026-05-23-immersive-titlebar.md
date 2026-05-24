# Immersive Custom Titlebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the native Tauri titlebar with a custom 52px dark glass titlebar that preserves window controls and resizing.

**Architecture:** Configure the Tauri window as frameless/resizable, then restructure `AppShell` into a global titlebar plus below-titlebar app body. Window actions are isolated in the titlebar component and fail safely in browser dev mode.

**Tech Stack:** Tauri 2, React 19, TypeScript, Vite, CSS glassmorphism, Node static contract test.

---

### Task 1: Add failing contract test

**Files:**
- Create: `tests/titlebar-contract.test.mjs`

- [ ] Write a Node test that reads `src-tauri/tauri.conf.json`, `src/components/AppShell.tsx`, and `src/styles/shell.css`.
- [ ] Assert `decorations: false`, `resizable: true`, custom titlebar classes, drag-region attributes, Tauri window API import, 52px titlebar height, app body row, and window control CSS states.
- [ ] Run `node tests/titlebar-contract.test.mjs` and expect failure before implementation.

### Task 2: Implement frameless Tauri config

**Files:**
- Modify: `src-tauri/tauri.conf.json`

- [ ] Add `decorations: false` to the main window.
- [ ] Add `resizable: true` explicitly.

### Task 3: Implement custom titlebar in AppShell

**Files:**
- Modify: `src/components/AppShell.tsx`

- [ ] Import `getCurrentWindow` from `@tauri-apps/api/window`.
- [ ] Replace old internal topbar with a global `CustomTitleBar` above sidebar/workspace body.
- [ ] Move brand UI into the titlebar left area.
- [ ] Keep project selector, connection, search, quick action, notification, user controls in titlebar.
- [ ] Add minimize, maximize/restore, close buttons.
- [ ] Add `data-tauri-drag-region` to draggable non-interactive titlebar zones.
- [ ] Add double-click maximize/restore handling on drag zones.

### Task 4: Restyle shell layout and glass titlebar

**Files:**
- Modify: `src/styles/shell.css`

- [ ] Make `.app-shell` a two-row layout: `52px 1fr`.
- [ ] Add `.app-body` grid containing sidebar and workbench.
- [ ] Remove sidebar brand spacing from top navigation.
- [ ] Restyle titlebar controls with dark glass, blur, cyan borders, CTA gradient, green connected glow, and red close hover.
- [ ] Keep responsive behavior usable below 1200px.

### Task 5: Verify

**Files:**
- Test: `tests/titlebar-contract.test.mjs`

- [ ] Run `node tests/titlebar-contract.test.mjs` and expect pass.
- [ ] Run `npm run build` and expect pass.
- [ ] Run `cargo check --manifest-path src-tauri/Cargo.toml` and expect pass.
