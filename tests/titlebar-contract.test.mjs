import assert from "node:assert/strict";
import fs from "node:fs";

const tauriConfig = JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json", "utf8"));
const tauriCapability = JSON.parse(fs.readFileSync("src-tauri/capabilities/default.json", "utf8"));
const appShell = fs.readFileSync("src/components/AppShell.tsx", "utf8");
const customTitlebar = fs.readFileSync("src/components/CustomTitleBar.tsx", "utf8");
const globalFrameDrawer = fs.readFileSync("src/components/GlobalFrameLogDrawer.tsx", "utf8");
const globalFrameView = fs.readFileSync("src/simulator/globalFrameLogView.ts", "utf8");
const shellCss = fs.readFileSync("src/styles/shell.css", "utf8");
const globalFrameCss = fs.readFileSync("src/styles/global-frame.css", "utf8");

const mainWindow = tauriConfig.app.windows[0];
assert.equal(mainWindow.decorations, false, "Tauri main window should hide native decorations");
assert.equal(mainWindow.resizable, true, "Frameless Tauri window should remain resizable");
assert.equal(mainWindow.backgroundColor, "#071528", "Frameless Tauri window should use the app background as its native clear color");

const permissions = new Set(tauriCapability.permissions);
[
  "core:window:allow-start-dragging",
  "core:window:allow-minimize",
  "core:window:allow-toggle-maximize",
  "core:window:allow-close",
].forEach((permission) => {
  assert.ok(permissions.has(permission), `Tauri capability should allow ${permission}`);
});

assert.match(appShell, /CustomTitleBar/, "AppShell should render the custom titlebar component");
assert.match(customTitlebar, /@tauri-apps\/api\/window/, "CustomTitleBar should import Tauri window APIs");
assert.match(customTitlebar, /function CustomTitleBar/, "CustomTitleBar should define a custom titlebar component");
assert.match(customTitlebar, /className="app-titlebar"/, "CustomTitleBar should render the custom titlebar");
assert.match(appShell, /className="app-body"/, "Sidebar and workbench should live below titlebar in app-body");
assert.match(customTitlebar, /data-tauri-drag-region/, "Titlebar should mark draggable regions");
assert.match(customTitlebar, /titlebar-drag-source/, "Static titlebar widgets should also be draggable");
assert.match(customTitlebar, /toggleMaximize/, "Titlebar should support maximize\/restore");
assert.match(customTitlebar, /minimize/, "Titlebar should support minimize");
assert.match(customTitlebar, /close/, "Titlebar should support close");
assert.match(customTitlebar, /onDoubleClick=\{handleToggleMaximize\}/, "Drag areas should support double-click maximize\/restore");

assert.match(shellCss, /--titlebar-height:\s*52px/, "CSS should define a 52px titlebar height");
assert.match(shellCss, /grid-template-rows:\s*var\(--titlebar-height\) minmax\(0, 1fr\)/, "App shell should reserve a top titlebar row");
assert.match(shellCss, /\.app-titlebar\s*\{/, "CSS should style the custom titlebar");
assert.match(shellCss, /backdrop-filter:\s*blur/, "Titlebar glass style should use backdrop blur");
assert.match(shellCss, /\.titlebar-drag-source/, "CSS should preserve draggable titlebar widgets");
assert.match(shellCss, /\.window-control\.close:hover/, "Close button should have custom hover styling");
assert.match(shellCss, /\.window-control:not\(\.close\):hover/, "Minimize\/maximize controls should have custom hover styling");
assert.match(shellCss, /\.status-dot/, "Connected state should keep a glowing status dot");
assert.match(globalFrameDrawer, /groupGlobalFrameLogViews/, "Global titlebar frame drawer should use the global frame view model");
assert.match(globalFrameDrawer, /placeholder="搜索报文 \/ 地址 \/ FC10"/, "Global titlebar frame drawer should expose frame search");
assert.match(globalFrameDrawer, /暂停刷新/, "Global titlebar frame drawer should allow freezing fast-moving logs");
assert.match(globalFrameDrawer, /读取报文/, "Global titlebar frame drawer should render a read stream");
assert.match(globalFrameDrawer, /写入报文/, "Global titlebar frame drawer should render a write stream");
assert.match(globalFrameView, /WRITE_FUNCTION_CODES/, "Global frame view should classify write function codes centrally");
assert.match(globalFrameView, /0x10/, "Global frame view should treat Modbus 0x10 as a write function");
assert.match(globalFrameCss, /\.global-frame-stream/, "Global titlebar frame drawer should have split stream layout styles");

const noDragSelectors = Array.from(shellCss.matchAll(/([^{}]+)\{\s*[^{}]*-webkit-app-region:\s*no-drag\s*;[^{}]*\}/g))
  .flatMap((match) => match[1].split(","))
  .map((selector) => selector.trim());

[
  ".titlebar-command-center",
  ".titlebar-actions",
].forEach((selector) => {
  assert.ok(
    !noDragSelectors.includes(selector),
    `${selector} should not be no-drag because it contains draggable titlebar status widgets`,
  );
});

[
  ".window-controls",
  ".window-control",
  ".quick-action",
  ".frame-log-button",
  ".emergency-stop",
  ".search-box input",
].forEach((selector) => {
  assert.ok(noDragSelectors.includes(selector), `${selector} should remain no-drag`);
});

console.log("titlebar contract ok");
