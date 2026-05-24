import assert from "node:assert/strict";
import fs from "node:fs";

const historyCenter = fs.readFileSync("src/history/historyCenter.ts", "utf8");
const workbench = fs.readFileSync("src/components/HistoryReportCenter.tsx", "utf8");
const modulePanel = fs.readFileSync("src/components/ModulePanel.tsx", "utf8");
const modulesCss = fs.readFileSync("src/styles/modules.css", "utf8");
const app = fs.readFileSync("src/App.tsx", "utf8");

for (const table of [
  "point_history",
  "alarm_history",
  "communication_history",
  "operation_log",
  "test_report",
  "report_template",
]) {
  assert.match(historyCenter, new RegExp(table), `history core should define SQLite table ${table}`);
}

for (const text of [
  "历史数据与报表中心",
  "趋势查询",
  "告警历史",
  "通信历史",
  "测试报告",
  "报表模板",
  "设备",
  "点位",
  "时间范围",
  "开始时间",
  "结束时间",
  "采样周期",
  "聚合方式",
  "原始值",
  "平均",
  "最大",
  "最小",
  "趋势曲线",
  "柱状图",
  "表格",
  "导出 CSV",
  "导出 Excel",
  "生成日报",
  "生成测试报告",
  "首页自测报告",
]) {
  assert.match(workbench, new RegExp(text), `history center should render ${text}`);
}

assert.match(workbench, /representativeSubsystemPoints/, "history trend UI should expose persisted subsystem point samples as selectable devices/points");

for (const symbol of [
  "LocalHistoryRepository",
  "persistSnapshotToHistory",
  "exportRowsAsCsv",
  "exportRowsAsExcelXml",
  "generateDailyReportHtml",
  "generateTestReportHtml",
  "generateHomeSelfTestReportHtml",
]) {
  assert.match(workbench, new RegExp(symbol), `history UI should use ${symbol}`);
}

assert.match(modulePanel, /<HistoryReportCenter snapshot=\{props\.snapshot\}/, "history nav should route to report center");
assert.match(app, /historyRepositoryRef/, "App should own a durable local history repository ref");
assert.match(app, /persistSnapshotToHistory/, "App should persist snapshot data into history on load");
assert.match(modulesCss, /\.history-center/, "module stylesheet should include history center layout");
assert.match(modulesCss, /\.history-tab/, "module stylesheet should style history tabs");
assert.match(modulesCss, /\.trend-chart/, "module stylesheet should style trend charts");

console.log("history center workbench contract ok");
