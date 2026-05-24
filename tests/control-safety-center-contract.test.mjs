import assert from "node:assert/strict";
import fs from "node:fs";

const core = fs.readFileSync("src/control/controlSafetyCenter.ts", "utf8");
const app = fs.readFileSync("src/App.tsx", "utf8");
const shell = fs.readFileSync("src/components/AppShell.tsx", "utf8");
const modulePanel = fs.readFileSync("src/components/ModulePanel.tsx", "utf8");
const dashboard = fs.readFileSync("src/components/Dashboard.tsx", "utf8");
const workbench = fs.readFileSync("src/components/ControlSafetyCenterWorkbench.tsx", "utf8");
const modulesCss = fs.readFileSync("src/styles/modules.css", "utf8");

for (const operation of [
  "start",
  "stop",
  "reset",
  "emergency-stop",
  "active-power-setpoint",
  "reactive-power-setpoint",
  "parameter-batch-write",
  "fault-clear",
  "firmware-upgrade",
  "simulator-fault-injection",
]) {
  assert.match(core + workbench, new RegExp(operation), `safety center should guard ${operation}`);
}

for (const label of [
  "启动",
  "停止",
  "复位",
  "急停",
  "有功功率给定",
  "无功功率给定",
  "参数批量写入",
  "故障清除",
  "固件升级",
  "从机模拟故障注入",
  "权限校验",
  "范围校验",
  "设备状态校验",
  "二次确认",
  "写后回读验证",
  "操作日志",
  "真实设备模式",
  "自测模式",
]) {
  assert.match(workbench + shell + dashboard, new RegExp(label), `UI should show ${label}`);
}

for (const field of ["time", "user", "operation", "device", "address", "writeValue", "beforeValue", "afterValue", "result", "failureReason"]) {
  assert.match(core + workbench, new RegExp(field), `operation log should include ${field}`);
}

assert.match(app, /createControlSafetyCenter/, "App must execute dashboard and titlebar high-risk commands through safety center");
assert.match(app, /executeSafetyWrappedCommand/, "App should centralize wrapped command execution");
assert.match(app, /handleConnectHomeDevice[\s\S]*executeSafetyWrappedCommand[\s\S]*connect_home_modbus_dashboard/, "home device connect must be safety-wrapped before backend invoke");
assert.match(app, /handleDisconnectHomeDevice[\s\S]*executeSafetyWrappedCommand[\s\S]*disconnect_home_modbus_dashboard/, "home device disconnect must be safety-wrapped before backend invoke");
assert.match(shell, /onEmergencyStop/, "global emergency stop button should call safety wrapper");
assert.match(dashboard, /controlSafetyLogs/, "dashboard operation panel should display safety logs");
assert.match(modulePanel, /<ControlSafetyCenterWorkbench/, "control-related modules should route to safety center workbench");
assert.match(modulesCss, /\.control-safety-center/, "module stylesheet should style safety center");
assert.match(modulesCss, /\.safety-log-table/, "module stylesheet should style operation log table");

console.log("control safety center contract ok");
