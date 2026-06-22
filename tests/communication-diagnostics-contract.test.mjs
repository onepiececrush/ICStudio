import assert from "node:assert/strict";
import fs from "node:fs";

assert.ok(fs.existsSync("src/components/CommunicationDiagnosticsWorkbench.tsx"), "communication diagnostics workbench component should exist");
assert.ok(fs.existsSync("src/components/communication/RealtimeFramesPanel.tsx"), "realtime frame panel should exist");
assert.ok(fs.existsSync("src/components/communication/seedDiagnostics.ts"), "diagnostic seed builder should exist");
assert.ok(fs.existsSync("src/components/communication/FrameFilterPanel.tsx"), "frame filter panel should exist");
assert.ok(fs.existsSync("src/components/communication/communicationDiagnosticsState.ts"), "communication diagnostics state should exist");

const workbench = fs.readFileSync("src/components/CommunicationDiagnosticsWorkbench.tsx", "utf8");
const realtimePanel = fs.readFileSync("src/components/communication/RealtimeFramesPanel.tsx", "utf8");
const panels = fs.readFileSync("src/components/communication/CommunicationDiagnosticsPanels.tsx", "utf8");
const frameFilterPanel = fs.readFileSync("src/components/communication/FrameFilterPanel.tsx", "utf8");
const diagnosticsState = fs.readFileSync("src/components/communication/communicationDiagnosticsState.ts", "utf8");
const seedDiagnostics = fs.readFileSync("src/components/communication/seedDiagnostics.ts", "utf8");
const modulePanel = fs.readFileSync("src/components/ModulePanel.tsx", "utf8");
const diagnostics = fs.readFileSync("src/communication/diagnostics.ts", "utf8");
const frameView = fs.readFileSync("src/communication/frameView.ts", "utf8");
const communicationCss = fs.readFileSync("src/styles/communication-frames.css", "utf8");
const communicationSource = workbench + realtimePanel + panels + frameFilterPanel + diagnosticsState + frameView;

for (const tab of ["实时报文", "通信统计", "异常诊断", "报文回放", "会话记录"]) {
  assert.match(workbench, new RegExp(tab), `workbench should render tab ${tab}`);
}

for (const field of [
  "时间",
  "方向",
  "读/写",
  "通道",
  "协议",
  "设备地址 / Unit ID",
  "功能码",
  "起始地址",
  "数量",
  "耗时",
  "结果",
  "异常码",
  "原始报文",
  "解析说明",
]) {
  assert.match(communicationSource, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `realtime frame table should include ${field}`);
}

for (const frameTool of [
  "报文搜索与读写筛选",
  "报文搜索",
  "读取报文",
  "写入报文",
  "其他报文",
  "暂停滚动",
  "跟随最新",
  "定位最新",
  "报文详情",
]) {
  assert.match(communicationSource, new RegExp(frameTool), `frame monitor should include ${frameTool}`);
}

for (const metric of [
  "总请求数",
  "成功数",
  "失败数",
  "超时数",
  "CRC 错误数",
  "异常响应数",
  "平均响应时间",
  "最大响应时间",
  "最慢设备",
  "最容易失败地址段",
  "最近 5 分钟成功率曲线",
]) {
  assert.match(communicationSource, new RegExp(metric), `stats should include ${metric}`);
}

for (const diagnosis of [
  "无响应：检查设备地址、串口线、IP、端口",
  "CRC 错误：检查波特率、校验位、线路干扰",
  "异常码 01：非法功能码",
  "异常码 02：非法地址",
  "异常码 03：非法数据值",
  "异常码 04：从站设备故障",
  "响应长度异常：检查数据类型或寄存器数量",
]) {
  assert.match(communicationSource, new RegExp(diagnosis), `diagnosis panel should include ${diagnosis}`);
}

for (const replayFeature of [
  "选择历史报文",
  "修改 Unit ID",
  "修改地址",
  "修改数据",
  "重放到真实设备",
  "重放到内置模拟器",
  "连续回放",
  "按原时间间隔回放",
  "导出为 JSON",
  "导出为 CSV",
]) {
  assert.match(communicationSource, new RegExp(replayFeature), `replay/export should include ${replayFeature}`);
}

for (const sessionField of ["开始时间", "结束时间", "通信配置", "报文数量", "异常数量", "关联工程", "关联协议版本"]) {
  assert.match(communicationSource, new RegExp(sessionField), `session records should include ${sessionField}`);
}

for (const api of [
  "CommunicationDiagnosticsCenter",
  "createDiagnosticSummary",
  "exportFramesAsJson",
  "exportFramesAsCsv",
  "replayFrameToSimulator",
  "filterDiagnosticFrameViews",
  "summarizeDiagnosticFrameOperations",
]) {
  assert.match(communicationSource + seedDiagnostics, new RegExp(api), `communication workbench should use diagnostics API ${api}`);
}

for (const api of [
  "parseModbusTcpFrame",
  "parseModbusRtuFrame",
  "calculateModbusRtuCrc",
  "filterFrames",
  "saveSession",
]) {
  assert.match(diagnostics, new RegExp(api), `diagnostics core should expose/use ${api}`);
}

for (const api of ["getDiagnosticFrameOperation", "diagnosticFrameOperationLabels"]) {
  assert.match(frameView, new RegExp(api), `frame view should expose/use ${api}`);
}

assert.match(seedDiagnostics, /01 06 9C 42 00 7B/, "seed diagnostics should include a write-single-register request");
assert.match(seedDiagnostics, /requestId: writeRequest/, "seed diagnostics should pair the write response");
assert.match(communicationCss, /\.frame-monitor-tools/, "communication frame css should style monitor tools");

assert.match(modulePanel, /import \{ CommunicationDiagnosticsWorkbench \} from "\.\/CommunicationDiagnosticsWorkbench";/, "ModulePanel should import communication diagnostics workbench");
assert.match(modulePanel, /props\.moduleKey === "communication"/, "ModulePanel should branch for communication module");
assert.match(modulePanel, /<CommunicationDiagnosticsWorkbench snapshot=\{props\.snapshot\} \/>/, "communication nav should route to diagnostics workbench");

console.log("communication diagnostics contract ok");
