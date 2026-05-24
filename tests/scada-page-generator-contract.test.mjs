import assert from "node:assert/strict";
import fs from "node:fs";

const modulePanel = fs.readFileSync("src/components/ModulePanel.tsx", "utf8");
const designer = fs.readFileSync("src/components/ScadaPageDesigner.tsx", "utf8");
const generator = fs.readFileSync("src/scada/pageGenerator.ts", "utf8");
const seed = fs.readFileSync("src/data/scadaSeed.ts", "utf8");
const css = fs.readFileSync("src/styles/scada.css", "utf8");
const appCss = fs.readFileSync("src/App.css", "utf8");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

assert.match(modulePanel, /<ScadaPageDesigner snapshot=\{props\.snapshot\} \/>/, "scada nav should render the generator/designer workbench");

for (const text of [
  "组态页面生成器",
  "协议点位自动生成",
  "组件库",
  "画布",
  "属性面板",
  "点位绑定和事件脚本",
  "保存配置",
  "重新打开",
  "自测模拟数据",
]) {
  assert.match(designer, new RegExp(text), `designer should render ${text}`);
}

for (const type of [
  "card",
  "table",
  "gauge",
  "status-light",
  "trend",
  "bar-chart",
  "alarm-list",
  "device-node",
  "energy-flow",
  "topology",
  "button",
  "input",
]) {
  assert.match(generator + designer, new RegExp(`["']${type}["']`), `SCADA should support ${type}`);
}

for (const api of [
  "generateScadaWorkspaceFromPoints",
  "updateScadaWidgetLayout",
  "bindScadaWidgetToPoint",
  "serializeScadaPage",
  "deserializeScadaPage",
  "createScadaRealtimeView",
  "createScadaSelfTestValues",
]) {
  assert.match(generator + designer, new RegExp(api), `SCADA should expose/use ${api}`);
}

for (const pageName of [
  "PCS 实时数据页",
  "BMS 实时数据页",
  "液冷页",
  "动环页",
  "电表页",
  "箱变页",
  "首页摘要页",
]) {
  assert.match(seed + generator, new RegExp(pageName), `seed/generated pages should include ${pageName}`);
}

for (const interaction of [
  "onDragStart",
  "onDrop",
  "draggable",
  "selectedWidgetId",
  "handleBindSelectedWidget",
  "savedJson",
  "handleReopenSavedPage",
  "setSelfTestMode",
]) {
  assert.match(designer, new RegExp(interaction), `designer should implement ${interaction}`);
}

for (const style of [
  ".scada-designer",
  ".scada-component-library",
  ".scada-canvas",
  ".scada-property-panel",
  ".scada-binding-dock",
  ".scada-widget",
  ".scada-widget.selected",
]) {
  assert.match(css, new RegExp(style.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `style should define ${style}`);
}

assert.match(appCss, /scada\.css/, "App styles should import SCADA stylesheet");
assert.match(packageJson.scripts["test:contract"], /scada-page-generator-contract\.test\.mjs/, "contract tests should include SCADA page generator");

console.log("scada page generator contract ok");
