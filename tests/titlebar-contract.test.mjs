import assert from "node:assert/strict";
import fs from "node:fs";

const tauriConfig = JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json", "utf8"));
const tauriCapability = JSON.parse(fs.readFileSync("src-tauri/capabilities/default.json", "utf8"));
const appShell = fs.readFileSync("src/components/AppShell.tsx", "utf8");
const shellCss = fs.readFileSync("src/styles/shell.css", "utf8");

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

assert.match(appShell, /@tauri-apps\/api\/window/, "AppShell should import Tauri window APIs");
assert.match(appShell, /function CustomTitleBar/, "AppShell should define a custom titlebar component");
assert.match(appShell, /className="app-titlebar"/, "AppShell should render the custom titlebar");
assert.match(appShell, /className="app-body"/, "Sidebar and workbench should live below titlebar in app-body");
assert.match(appShell, /data-tauri-drag-region/, "Titlebar should mark draggable regions");
assert.match(appShell, /titlebar-drag-source/, "Static titlebar widgets should also be draggable");
assert.match(appShell, /toggleMaximize/, "Titlebar should support maximize\/restore");
assert.match(appShell, /minimize/, "Titlebar should support minimize");
assert.match(appShell, /close/, "Titlebar should support close");
assert.match(appShell, /onDoubleClick=\{handleToggleMaximize\}/, "Drag areas should support double-click maximize\/restore");

assert.match(shellCss, /--titlebar-height:\s*52px/, "CSS should define a 52px titlebar height");
assert.match(shellCss, /grid-template-rows:\s*var\(--titlebar-height\) minmax\(0, 1fr\)/, "App shell should reserve a top titlebar row");
assert.match(shellCss, /\.app-titlebar\s*\{/, "CSS should style the custom titlebar");
assert.match(shellCss, /backdrop-filter:\s*blur/, "Titlebar glass style should use backdrop blur");
assert.match(shellCss, /\.titlebar-drag-source/, "CSS should preserve draggable titlebar widgets");
assert.match(shellCss, /\.window-control\.close:hover/, "Close button should have custom hover styling");
assert.match(shellCss, /\.window-control:not\(\.close\):hover/, "Minimize\/maximize controls should have custom hover styling");
assert.match(shellCss, /\.status-dot/, "Connected state should keep a glowing status dot");

console.log("titlebar contract ok");
