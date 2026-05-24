import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("src/App.tsx", "utf8");
const dashboard = fs.readFileSync("src/components/Dashboard.tsx", "utf8");
const modulePanel = fs.readFileSync("src/components/ModulePanel.tsx", "utf8");
const workbench = fs.readFileSync("src/components/AlarmRuleEngineWorkbench.tsx", "utf8");
const engine = fs.readFileSync("src/alarm/alarmRuleEngine.ts", "utf8");
const css = fs.readFileSync("src/styles/modules.css", "utf8");

for (const model of ["AlarmRule", "AlarmEvent", "alarmLevel", "triggerCondition", "recoverCondition", "delayMs", "autoRecover", "enabled"]) {
  assert.match(engine, new RegExp(model), `engine should expose ${model}`);
}

for (const deviceType of ["PCS", "BMS", "液冷", "动环", "电表", "箱变"]) {
  assert.match(engine, new RegExp(deviceType), `default rules should cover ${deviceType}`);
}

for (const text of ["当前告警", "历史告警", "告警规则", "告警统计", "确认", "恢复", "屏蔽", "抑制", "筛选", "导出"]) {
  assert.match(workbench, new RegExp(text), `alarm page should render ${text}`);
}
assert.match(workbench, /filterAlarmEvents\(events, filters\)/, "alarm page should apply level/status/device/keyword filters");

assert.match(app, /useState<AlarmEngineState>/, "App should own alarm engine state so recovery/history survive polling");
assert.match(app, /evaluateAlarmSnapshot/, "App should feed point snapshots into alarm engine");
assert.match(dashboard, /alarmState/, "Dashboard should receive unified alarm state");
assert.match(dashboard, /getAlarmCenterSummary/, "Home alarm center should derive counts from unified alarm engine");
assert.match(dashboard, /pcsModuleStates/, "PCS matrix should color modules from alarm engine state");

assert.match(dashboard, /const alarmSummary = getAlarmCenterSummary\(alarmState\)/, "Dashboard should derive one alarm summary from engine state");
assert.match(dashboard, /<KpiGrid[^>]*alarmSummary=\{alarmSummary\}/s, "KPI alarm card should use unified alarm summary even during loopback self-test");
assert.match(dashboard, /<PCSMatrixPanel[^>]*alarmSummary=\{alarmSummary\}/s, "PCS matrix should use unified alarm summary even during loopback self-test");
assert.match(dashboard, /<AlarmCenterPanel alarmSummary=\{alarmSummary\}/, "Home alarm center should not fall back to loopback alarm counters");
assert.match(dashboard, /currentCounts\.提示/, "Home alarm counts should include the unified 提示 level rather than synthetic communication counters");
assert.match(dashboard, /function createRecentAlarms\(alarmSummary: AlarmCenterSummary\)/, "Recent home alarms should depend only on unified alarm summary");
assert.doesNotMatch(dashboard, /alarms\.length \? alarms : recentAlarms/, "Home alarm center should not fall back to static mock recent alarms");
assert.match(modulePanel, /<AlarmRuleEngineWorkbench/, "events nav should route to the alarm rule engine workbench");
assert.match(css, /alarm-workbench/, "module styles should include alarm workbench layout");

console.log("alarm rule engine contract ok");
