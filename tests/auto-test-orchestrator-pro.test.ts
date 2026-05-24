import assert from "node:assert/strict";
import test from "node:test";
import {
  allAutoTestStepTypes,
  createBlankTestCase,
  createSimulatorTestTarget,
  exportReportCsv,
  exportReportHtml,
  exportReportPdf,
  generateTestReport,
  runTestCase,
  type AutoTestTarget,
  type TestCase,
} from "../src/autotest/testOrchestrator";
import { builtInAutoTestTemplates } from "../src/autotest/templates";
import type { DeviceProfile } from "../src/protocol/deviceProfile";

const baseNow = Date.parse("2026-05-24T00:00:00.000Z");

test("creates editable TestCase model and exposes every Pro step type", () => {
  const testCase = createBlankTestCase({ case_id: "case-new", case_name: "新建测试用例", device_type: "PCS" });

  assert.deepEqual(Object.keys(testCase).sort(), [
    "case_id",
    "case_name",
    "device_type",
    "expected",
    "logs",
    "result",
    "retry",
    "steps",
    "tags",
    "timeout",
  ].sort());
  assert.equal(testCase.case_id, "case-new");
  assert.equal(testCase.case_name, "新建测试用例");
  assert.equal(testCase.device_type, "PCS");
  assert.deepEqual(testCase.tags, []);
  assert.deepEqual(testCase.steps, []);
  assert.equal(testCase.timeout, 30_000);
  assert.equal(testCase.retry, 0);
  assert.deepEqual(testCase.expected, {});
  assert.equal(testCase.result.status, "idle");
  assert.deepEqual(testCase.logs, []);

  assert.deepEqual(allAutoTestStepTypes, [
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
  ]);
});

test("runs a configurable flow against a real-device target adapter with read/write/assert/frame/report steps", async () => {
  const frames: string[] = [];
  const memory = new Map<string, unknown>([["active-power", 0], ["run-mode", 1], ["fault-word", 0]]);
  const target: AutoTestTarget = {
    id: "real-pcs-1",
    kind: "real-device",
    deviceInfo: { id: "PCS-01", name: "PCS-01", deviceType: "PCS", protocolVersion: "PCS Modbus V3.13" },
    connect: async () => {
      frames.push("01 03 36 B1 00 02 9B 88");
      return { ok: true, frame: "01 03 36 B1 00 02 9B 88", message: "connected" };
    },
    readPoint: async (point) => ({ ok: true, value: memory.get(point), frame: `READ ${point}` }),
    writePoint: async (point, value) => {
      memory.set(point, value);
      return { ok: true, value, frame: `WRITE ${point}=${String(value)}` };
    },
    getFrames: () => [...frames, "WRITE active-power=500", "READ active-power"],
    captureScreenshot: async () => ({ ok: true, screenshot: "data:image/png;base64,REAL" }),
  };

  const testCase: TestCase = {
    ...createBlankTestCase({ case_id: "real-flow", case_name: "真实设备功率给定", device_type: "PCS" }),
    tags: ["real-device", "power"],
    steps: [
      { step_id: "s1", type: "connect_device", target_device: "PCS-01", on_fail: "stop" },
      { step_id: "s2", type: "write_point", target_device: "PCS-01", point_address: "active-power", value: 500, on_fail: "stop" },
      { step_id: "s3", type: "read_point", target_device: "PCS-01", point_address: "active-power" },
      { step_id: "s4", type: "assert_value", target_device: "PCS-01", point_address: "active-power", value: 500 },
      { step_id: "s5", type: "assert_enum", target_device: "PCS-01", point_address: "run-mode", value: 1, condition: { enum: { "1": "运行" }, label: "运行" } },
      { step_id: "s6", type: "assert_bit", target_device: "PCS-01", point_address: "fault-word", condition: { bit: 0, expected: false } },
      { step_id: "s7", type: "check_frame", target_device: "PCS-01", condition: { contains: "WRITE active-power=500" } },
      { step_id: "s8", type: "capture_screenshot", target_device: "PCS-01" },
      { step_id: "s9", type: "export_report", target_device: "PCS-01" },
    ],
  };

  const result = await runTestCase(testCase, target, { now: () => baseNow });

  assert.equal(result.status, "passed");
  assert.equal(result.stepResults.length, 9);
  assert.equal(result.stepResults.every((step) => step.status === "passed"), true);
  assert.equal(memory.get("active-power"), 500);
  assert.ok(result.logs.some((log) => log.message.includes("报文检查通过")));
  assert.deepEqual(result.screenshots, ["data:image/png;base64,REAL"]);
  assert.ok(result.report);
  assert.equal(result.report?.projectName, "真实设备功率给定");
});

test("runs simulator flow with wait condition, scenario control, fault injection/clear and frame checks", async () => {
  const profile: DeviceProfile = {
    schemaVersion: "device-profile/v1",
    id: "sim-profile",
    name: "模拟 PCS Profile",
    version: "1.0.0",
    deviceType: "PCS",
    vendor: "Lab",
    communicationType: "Modbus TCP",
    createdAt: "2026-05-24T00:00:00.000Z",
    source: { kind: "json", fileName: "sim.json" },
    registers: [
      { id: "run-mode", address: 40001, name: "运行模式", functionCode: 3, access: "readWrite", dataType: "uint16", length: 1, scale: 1, unit: "", range: { min: 0, max: 5 }, enum: [{ value: 1, label: "运行" }, { value: 4, label: "故障" }], bits: [], description: "", group: "状态", currentValue: 0 },
      { id: "active-power", address: 40002, name: "功率", functionCode: 6, access: "readWrite", dataType: "int16", length: 1, scale: 1, unit: "kW", range: { min: -1000, max: 1000 }, enum: [], bits: [], description: "", group: "控制", currentValue: 0 },
      { id: "fault-word", address: 40003, name: "故障字", functionCode: 3, access: "readWrite", dataType: "bitfield", length: 1, scale: 1, unit: "", range: { min: 0, max: 65535 }, enum: [], bits: [{ bit: 0, label: "故障" }], description: "", group: "告警", currentValue: 0 },
    ],
    scenarios: [
      { id: "pcs-start", name: "PCS 启动", description: "进入运行", steps: [{ registerId: "run-mode", strategy: "fixed", value: 1 }, { registerId: "active-power", strategy: "fixed", value: 100 }], faultInjection: { mode: "none" } },
      { id: "pcs-fault", name: "PCS 故障", description: "注入故障", steps: [{ registerId: "run-mode", strategy: "fixed", value: 4 }, { registerId: "fault-word", strategy: "fixed", value: 1 }], faultInjection: { mode: "exceptionCode", exceptionCode: "0x03" } },
    ],
  };
  const target = createSimulatorTestTarget(profile);
  const testCase: TestCase = {
    ...createBlankTestCase({ case_id: "sim-flow", case_name: "模拟闭环", device_type: "PCS" }),
    steps: [
      { step_id: "s1", type: "connect_device", target_device: "PCS-SIM" },
      { step_id: "s2", type: "start_scenario", target_device: "PCS-SIM", condition: { scenarioId: "pcs-start" } },
      { step_id: "s3", type: "wait_condition", target_device: "PCS-SIM", point_address: "run-mode", condition: { operator: "==", value: 1 }, timeout: 1000 },
      { step_id: "s4", type: "assert_value", target_device: "PCS-SIM", point_address: "active-power", value: 100 },
      { step_id: "s5", type: "inject_fault", target_device: "PCS-SIM", condition: { mode: "exceptionCode", exceptionCode: "0x03", scenarioId: "pcs-fault" } },
      { step_id: "s6", type: "assert_bit", target_device: "PCS-SIM", point_address: "fault-word", condition: { bit: 0, expected: true } },
      { step_id: "s7", type: "check_frame", target_device: "PCS-SIM", condition: { contains: "exceptionCode" } },
      { step_id: "s8", type: "clear_fault", target_device: "PCS-SIM", point_address: "fault-word" },
      { step_id: "s9", type: "stop_scenario", target_device: "PCS-SIM", condition: { scenarioId: "pcs-start" } },
    ],
  };

  const result = await runTestCase(testCase, target, { now: () => baseNow, pollIntervalMs: 0 });

  assert.equal(result.status, "passed");
  assert.equal(target.readPointSync("fault-word"), 0);
  assert.ok(result.logs.some((log) => log.message.includes("故障注入")));
  assert.ok(result.frames.some((frame) => frame.frame.includes("exceptionCode")));
});

test("ships documented built-in templates as editable configurable cases", () => {
  assert.deepEqual(builtInAutoTestTemplates.map((template) => template.case_name), [
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
  ]);
  assert.equal(builtInAutoTestTemplates.every((template) => template.steps.length >= 3), true);
  assert.ok(builtInAutoTestTemplates.flatMap((template) => template.steps).some((step) => step.type === "inject_fault"));
  assert.ok(builtInAutoTestTemplates.flatMap((template) => template.steps).some((step) => step.type === "check_frame"));
  assert.ok(builtInAutoTestTemplates.flatMap((template) => template.steps).some((step) => step.type === "export_report"));
});

test("generates reports with required metadata, logs, frames, screenshots and CSV/HTML/PDF exports", async () => {
  const testCase = createBlankTestCase({ case_id: "report-case", case_name: "报告用例", device_type: "PCS" });
  const run = await runTestCase(
    {
      ...testCase,
      steps: [
        { step_id: "s1", type: "connect_device", target_device: "PCS-01" },
        { step_id: "s2", type: "capture_screenshot", target_device: "PCS-01" },
      ],
    },
    fakePassingTarget(),
    { now: () => baseNow },
  );
  const report = generateTestReport({
    projectName: "EVE储能项目",
    protocolVersion: "PCS Modbus V3.13 / BMS V1.06",
    deviceInfo: { id: "PCS-01", name: "PCS-01", deviceType: "PCS", protocolVersion: "PCS Modbus V3.13" },
    results: [run],
    generatedAt: baseNow,
  });

  assert.equal(report.testTime, "2026-05-24T00:00:00.000Z");
  assert.equal(report.projectName, "EVE储能项目");
  assert.equal(report.protocolVersion, "PCS Modbus V3.13 / BMS V1.06");
  assert.equal(report.deviceInfo.deviceType, "PCS");
  assert.equal(report.caseResults[0].case_id, "report-case");
  assert.ok(report.stepLogs.length >= 2);
  assert.equal(report.failureReasons.length, 0);
  assert.ok(report.communicationFrames.length >= 1);
  assert.deepEqual(report.screenshots, ["data:image/png;base64,FAKE"]);

  assert.match(exportReportCsv(report), /用例ID,用例名称,状态,步骤数,失败原因/);
  assert.match(exportReportHtml(report), /EVE储能项目/);
  assert.match(exportReportPdf(report), /^%PDF-ICStudio-AutoTest/);
});

function fakePassingTarget(): AutoTestTarget {
  return {
    id: "fake",
    kind: "real-device",
    deviceInfo: { id: "PCS-01", name: "PCS-01", deviceType: "PCS", protocolVersion: "PCS Modbus V3.13" },
    connect: async () => ({ ok: true, frame: "01 03 00 00 00 01 84 0A" }),
    readPoint: async () => ({ ok: true, value: 1, frame: "READ OK" }),
    writePoint: async (_point, value) => ({ ok: true, value, frame: "WRITE OK" }),
    getFrames: () => [{ direction: "request" as const, time: "现在", frame: "01 03 00 00 00 01 84 0A", note: "connect" }],
    captureScreenshot: async () => ({ ok: true, screenshot: "data:image/png;base64,FAKE" }),
  };
}
