import assert from "node:assert/strict";
import fs from "node:fs";

const workbench = fs.readFileSync("src/components/AutoTestWorkbench.tsx", "utf8");
const modulePanel = fs.readFileSync("src/components/ModulePanel.tsx", "utf8");
const css = fs.readFileSync("src/styles/modules.css", "utf8");
const orchestrator = fs.readFileSync("src/autotest/testOrchestrator.ts", "utf8");
const templates = fs.readFileSync("src/autotest/templates.ts", "utf8");

for (const text of [
  "自动化测试编排器 Pro",
  "用例树",
  "步骤编排器",
  "步骤属性",
  "运行日志",
  "运行全部",
  "运行选中",
  "停止",
  "导出报告",
  "新建测试用例",
  "读取点位",
  "写入点位",
  "断言数值",
  "断言枚举",
  "断言 bit",
  "注入故障",
  "清除故障",
  "启动场景",
  "停止场景",
  "检查报文",
  "生成截图",
  "真实设备目标",
  "内置从机模拟器",
]) {
  assert.match(workbench, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `workbench should render ${text}`);
}

for (const token of [
  "builtInAutoTestTemplates",
  "createBlankTestCase",
  "runTestCase",
  "createSimulatorTestTarget",
  "generateTestReport",
  "exportReportHtml",
  "runTargetKind",
]) {
  assert.match(workbench, new RegExp(token), `workbench should wire ${token}`);
}

for (const stepType of [
  "connect_device",
  "read_point",
  "write_point",
  "wait_time",
  "wait_condition",
  "assert_value",
  "assert_enum",
  "assert_bit",
  "inject_fault",
  "clear_fault",
  "start_scenario",
  "stop_scenario",
  "check_frame",
  "capture_screenshot",
  "export_report",
]) {
  assert.match(orchestrator + workbench, new RegExp(stepType), `step type ${stepType} should be supported in core/UI`);
}

for (const templateName of [
  "PMU 通信测试",
  "PCS 在线测试",
  "PCS 启动测试",
  "PCS 停止测试",
  "PCS 功率给定测试",
  "BMS 数据范围测试",
  "液冷通信测试",
  "动环急停测试",
  "故障恢复测试",
  "首页自测模拟闭环测试",
]) {
  assert.match(templates + workbench, new RegExp(templateName), `template ${templateName} should be available`);
}

assert.match(modulePanel, /import \{ AutoTestWorkbench \}/, "ModulePanel should import AutoTestWorkbench");
assert.match(modulePanel, /moduleKey === "autotest"/, "ModulePanel should route autotest module");
assert.match(modulePanel, /<AutoTestWorkbench snapshot=\{props\.snapshot\}/, "AutoTestWorkbench should receive snapshot");

for (const klass of [
  ".auto-test-workbench",
  ".auto-test-toolbar",
  ".auto-test-layout",
  ".auto-test-case-tree",
  ".auto-test-step-orchestrator",
  ".auto-test-step-properties",
  ".auto-test-run-log",
]) {
  assert.match(css, new RegExp(klass.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `CSS should define ${klass}`);
}

console.log("auto test workbench contract ok");
