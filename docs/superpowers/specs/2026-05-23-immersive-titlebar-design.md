# Immersive Custom Titlebar Design

## Goal
Replace the native desktop title bar with a frameless Tauri window and a 52px custom dark glass titlebar that matches ICStudio's industrial dark-blue glass UI.

## Window configuration
- Tauri window uses `decorations: false` to hide the native frame/titlebar.
- Tauri window keeps `resizable: true` so users can resize from window edges.
- Existing size, min size, title, and bundle configuration remain unchanged.

## React structure
- `AppShell` owns a new global `CustomTitleBar` above the app body.
- The app root uses two rows: titlebar (`52px`) and body (`1fr`).
- Sidebar and workspace live under the titlebar, so the navigation no longer starts at the window top.
- Existing dashboard/module content remains unchanged.

## Titlebar behavior
- Titlebar has three zones: brand left, command center middle, actions/window controls right.
- Drag regions use `data-tauri-drag-region` on non-interactive containers.
- Interactive controls are normal buttons/inputs and are not drag regions.
- Double-clicking titlebar drag areas toggles maximize/restore.
- Window buttons call Tauri APIs: minimize, toggle maximize, close.
- In browser-only dev mode, Tauri calls fail safely without breaking the UI.

## Visual system
- Titlebar, sidebar, controls, and cards share deep blue glass styling, translucent surfaces, subtle cyan borders, blur, and glow.
- Connected state uses a green glowing dot.
- Quick action is the main CTA.
- Notification/user/window controls are glass widgets.
- Close hover uses translucent red; minimize/maximize hover use cyan-blue glass.

## Verification
- Static contract test checks Tauri frameless config, AppShell titlebar structure, drag markers, window control wiring, and CSS titlebar/body layout.
- Build checks TypeScript and production Vite output.
- Cargo check verifies Tauri config/code remains valid.
