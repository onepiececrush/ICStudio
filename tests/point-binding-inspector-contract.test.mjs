import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("src/App.tsx", "utf8");
const appShell = fs.readFileSync("src/components/AppShell.tsx", "utf8");
const dashboard = fs.readFileSync("src/components/Dashboard.tsx", "utf8");
const modulePanel = fs.readFileSync("src/components/ModulePanel.tsx", "utf8");
const inspector = fs.readFileSync("src/components/PointBindingInspectorDrawer.tsx", "utf8");
const registry = fs.readFileSync("src/pointBinding/registry.ts", "utf8");
const css = fs.readFileSync("src/styles/point-inspector.css", "utf8");
const appCss = fs.readFileSync("src/App.css", "utf8");

for (const text of [
  "PointBindingInspectorDrawer",
  "点位详情",
  "基本信息",
  "协议信息",
  "当前值",
  "报文来源",
  "最近变化",
  "错误诊断",
  "最后一次请求报文",
  "最后一次响应报文",
  "通信状态",
]) {
  assert.match(inspector, new RegExp(text), `drawer should render ${text}`);
}

for (const field of [
  "deviceInstance",
  "registerAddress",
  "rawRegisterValue",
  "engineeringValue",
  "scale",
  "unit",
  "dataType",
  "lastRequestFrame",
  "lastResponseFrame",
  "lastUpdateTime",
  "communicationStatus",
  "simulatorExpectation",
]) {
  assert.match(registry + inspector, new RegExp(field), `inspector data should include ${field}`);
}

assert.match(app, /useState<PointBindingTrace \| null>/, "App should own selected point trace state");
assert.match(app, /onInspectPoint=\{handleInspectPoint\}/, "App should pass point inspection handler to pages");
assert.match(appShell, /<PointBindingInspectorDrawer trace=\{props\.selectedPointTrace\}/, "AppShell should render the right drawer");
assert.match(dashboard, /onInspectPoint/, "Dashboard should accept point inspection callback");
assert.match(dashboard, /data-point-id/, "Dashboard values should mark clickable point ids");
assert.match(dashboard, /home\.kpi\.active-power/, "Dashboard should bind total active power KPI");
assert.match(dashboard, /home\.pcs\.\$\{module\.id\}/, "PCS matrix card should use per-module binding ids");
assert.match(modulePanel, /monitorPointIds/, "Realtime monitor should render traceable point rows");
assert.match(modulePanel, /parameterPointIds/, "Parameter configuration should render traceable point rows");
assert.match(modulePanel, /pointBindingRegistry/, "Realtime/parameter pages should render actual point values from the registry");
assert.match(modulePanel, /formattedValue/, "Realtime/parameter cards should show formatted data values, not only point ids");
assert.match(modulePanel, /module-value-grid/, "Realtime/parameter pages should use a value grid for clickable data cells");
for (const pointId of [
  "home.health.bms.soc-soh",
  "home.health.liquid-cooling.temperature",
  "home.health.environment.cabinet",
  "home.health.meter.active-power",
  "home.health.transformer.temperature",
  "home.energy.today-charge",
]) {
  assert.match(dashboard, new RegExp(pointId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Dashboard should wire ${pointId} to a clickable value`);
}

for (const [fn, pointId] of [
  ["createPcsCoreMetrics", "home.topology.pcs-total-active-power"],
  ["createBmsMetrics", "home.topology.battery-soc"],
  ["createEnergyStats", "home.energy.today-charge"],
]) {
  const match = dashboard.match(new RegExp(`function ${fn}\\([\\s\\S]*?\\r?\\n}\\r?\\n`));
  assert.ok(match, `Dashboard should define ${fn}`);
  assert.match(match[0], new RegExp(pointId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${fn} should preserve ${pointId} in self-test/loopback mode`);
}
assert.match(app, /setSelectedPointTrace\(trace\)/, "App should show unbound diagnostics instead of closing the drawer for missing bindings");
assert.doesNotMatch(app, /trace\.kind === "bound" \? trace : null/, "App should not discard unbound inspection traces");

assert.match(css, /\.point-inspector-drawer/, "drawer stylesheet should define right drawer");
assert.match(css, /\.trace-clickable/, "traceable values should have a visible clickable style");
assert.match(appCss, /point-inspector\.css/, "App styles should import inspector CSS");

console.log("point binding inspector contract ok");
