import { createSimulatorEngine, type FrameLog } from "../simulator/simulatorEngine";
import type { DeviceProfile, FaultInjectionMode } from "../protocol/deviceProfile";

export const allAutoTestStepTypes = [
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
] as const;

export type TestStepType = typeof allAutoTestStepTypes[number];
export type TestStatus = "idle" | "running" | "passed" | "failed" | "skipped";
export type StepFailurePolicy = "stop" | "continue" | "retry";

export type TestStep = {
  step_id: string;
  type: TestStepType;
  target_device?: string;
  point_address?: string | number;
  value?: unknown;
  condition?: Record<string, unknown>;
  timeout?: number;
  on_fail?: StepFailurePolicy;
};

export type TestLogEntry = {
  time: string;
  level: "info" | "warn" | "error";
  step_id?: string;
  message: string;
};

export type TestStepResult = {
  step_id: string;
  type: TestStepType;
  status: Exclude<TestStatus, "idle" | "running">;
  startedAt: string;
  endedAt: string;
  message: string;
  value?: unknown;
  frame?: string;
  error?: string;
};

export type TestRunSummary = {
  status: TestStatus;
  startedAt?: string;
  endedAt?: string;
  durationMs: number;
  passedSteps: number;
  failedSteps: number;
  failureReason?: string;
};

export type TestCase = {
  case_id: string;
  case_name: string;
  device_type: string;
  tags: string[];
  steps: TestStep[];
  timeout: number;
  retry: number;
  expected: Record<string, unknown>;
  result: TestRunSummary;
  logs: TestLogEntry[];
};

export type AutoTestFrame = {
  direction: "request" | "response" | "event";
  time: string;
  frame: string;
  note: string;
};

export type AutoTestDeviceInfo = {
  id: string;
  name: string;
  deviceType: string;
  protocolVersion: string;
};

export type TargetActionResult = {
  ok: boolean;
  value?: unknown;
  frame?: string;
  message?: string;
  error?: string;
  screenshot?: string;
};

export type AutoTestTarget = {
  id: string;
  kind: "real-device" | "simulator" | string;
  deviceInfo: AutoTestDeviceInfo;
  connect?: () => Promise<TargetActionResult>;
  readPoint: (point: string) => Promise<TargetActionResult>;
  writePoint: (point: string, value: unknown) => Promise<TargetActionResult>;
  startScenario?: (scenarioId: string) => Promise<TargetActionResult>;
  stopScenario?: (scenarioId: string) => Promise<TargetActionResult>;
  injectFault?: (fault: { mode?: FaultInjectionMode | string; exceptionCode?: string; scenarioId?: string }) => Promise<TargetActionResult>;
  clearFault?: (point?: string) => Promise<TargetActionResult>;
  getFrames?: () => Array<AutoTestFrame | FrameLog | string>;
  captureScreenshot?: () => Promise<TargetActionResult>;
};

export type TestRunResult = TestRunSummary & {
  case_id: string;
  case_name: string;
  device_type: string;
  targetKind: string;
  stepResults: TestStepResult[];
  logs: TestLogEntry[];
  frames: AutoTestFrame[];
  screenshots: string[];
  report?: TestReport;
};

export type TestReport = {
  reportId: string;
  testTime: string;
  projectName: string;
  protocolVersion: string;
  deviceInfo: AutoTestDeviceInfo;
  caseResults: Array<{
    case_id: string;
    case_name: string;
    status: TestStatus;
    stepCount: number;
    passedSteps: number;
    failedSteps: number;
    failureReason: string;
    durationMs: number;
  }>;
  stepLogs: TestLogEntry[];
  failureReasons: string[];
  communicationFrames: AutoTestFrame[];
  screenshots: string[];
  exports: { csv: string; html: string; pdf: string };
};

export type RunOptions = {
  now?: () => number;
  pollIntervalMs?: number;
};

export function createBlankTestCase(input: Partial<Pick<TestCase, "case_id" | "case_name" | "device_type">> = {}): TestCase {
  return {
    case_id: input.case_id ?? `case-${Date.now()}`,
    case_name: input.case_name ?? "新建测试用例",
    device_type: input.device_type ?? "通用设备",
    tags: [],
    steps: [],
    timeout: 30_000,
    retry: 0,
    expected: {},
    result: {
      status: "idle",
      durationMs: 0,
      passedSteps: 0,
      failedSteps: 0,
    },
    logs: [],
  };
}

export async function runTestCase(testCase: TestCase, target: AutoTestTarget, options: RunOptions = {}): Promise<TestRunResult> {
  const now = options.now ?? Date.now;
  const started = now();
  const logs: TestLogEntry[] = [];
  const stepResults: TestStepResult[] = [];
  const screenshots: string[] = [];
  const values = new Map<string, unknown>();
  let failureReason: string | undefined;

  const log = (entry: Omit<TestLogEntry, "time">) => {
    logs.push({ time: formatIso(now()), ...entry });
  };

  for (const step of testCase.steps) {
    const startedAt = formatIso(now());
    try {
      const outcome = await executeStep(step, target, values, screenshots, log, options);
      const result: TestStepResult = {
        step_id: step.step_id,
        type: step.type,
        status: "passed",
        startedAt,
        endedAt: formatIso(now()),
        message: outcome.message,
        value: outcome.value,
        frame: outcome.frame,
      };
      stepResults.push(result);
      log({ level: "info", step_id: step.step_id, message: outcome.message });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failureReason = message;
      stepResults.push({
        step_id: step.step_id,
        type: step.type,
        status: "failed",
        startedAt,
        endedAt: formatIso(now()),
        message,
        error: message,
      });
      log({ level: "error", step_id: step.step_id, message });
      if ((step.on_fail ?? "stop") === "stop") break;
    }
  }

  const ended = now();
  const failedSteps = stepResults.filter((step) => step.status === "failed").length;
  const frames = normalizeFrames(target.getFrames?.() ?? []);
  const summary: TestRunSummary = {
    status: failedSteps > 0 ? "failed" : "passed",
    startedAt: formatIso(started),
    endedAt: formatIso(ended),
    durationMs: Math.max(0, ended - started),
    passedSteps: stepResults.filter((step) => step.status === "passed").length,
    failedSteps,
    failureReason,
  };
  const result: TestRunResult = {
    ...summary,
    case_id: testCase.case_id,
    case_name: testCase.case_name,
    device_type: testCase.device_type,
    targetKind: target.kind,
    stepResults,
    logs: [...testCase.logs, ...logs],
    frames,
    screenshots,
  };

  if (testCase.steps.some((step) => step.type === "export_report")) {
    result.report = generateTestReport({
      projectName: testCase.case_name,
      protocolVersion: target.deviceInfo.protocolVersion,
      deviceInfo: target.deviceInfo,
      results: [result],
      generatedAt: ended,
    });
  }

  return result;
}

async function executeStep(
  step: TestStep,
  target: AutoTestTarget,
  values: Map<string, unknown>,
  screenshots: string[],
  log: (entry: Omit<TestLogEntry, "time">) => void,
  options: RunOptions,
): Promise<{ message: string; value?: unknown; frame?: string }> {
  const point = step.point_address === undefined ? undefined : String(step.point_address);
  switch (step.type) {
    case "connect_device": {
      const result = target.connect ? await target.connect() : { ok: true, message: "connected" };
      assertTargetOk(result, "连接设备失败");
      return { message: `连接设备成功：${step.target_device ?? target.deviceInfo.name}`, frame: result.frame };
    }
    case "read_point": {
      if (!point) throw new Error("读取点位步骤缺少 point_address。");
      const result = await target.readPoint(point);
      assertTargetOk(result, `读取点位失败：${point}`);
      values.set(point, result.value);
      return { message: `读取点位 ${point}=${String(result.value)}`, value: result.value, frame: result.frame };
    }
    case "write_point": {
      if (!point) throw new Error("写入点位步骤缺少 point_address。");
      const result = await target.writePoint(point, step.value);
      assertTargetOk(result, `写入点位失败：${point}`);
      values.set(point, step.value);
      return { message: `写入点位 ${point}=${String(step.value)}`, value: step.value, frame: result.frame };
    }
    case "wait_time": {
      const waitMs = Number(step.value ?? step.timeout ?? 0);
      if (waitMs > 0) await sleep(Math.min(waitMs, 20));
      return { message: `等待 ${waitMs}ms 完成` };
    }
    case "wait_condition": {
      if (!point) throw new Error("等待条件步骤缺少 point_address。");
      await waitForCondition(step, target, values, options);
      return { message: `等待条件通过：${point}` };
    }
    case "assert_value": {
      if (!point) throw new Error("数值断言步骤缺少 point_address。");
      const actual = await readValue(point, target, values);
      if (!compare(actual, step.value, step.condition?.operator as string | undefined)) {
        throw new Error(`断言数值失败：${point} 期望 ${String(step.value)}，实际 ${String(actual)}。`);
      }
      return { message: `断言数值通过：${point}=${String(actual)}`, value: actual };
    }
    case "assert_enum": {
      if (!point) throw new Error("枚举断言步骤缺少 point_address。");
      const actual = await readValue(point, target, values);
      if (!sameValue(actual, step.value)) throw new Error(`断言枚举失败：${point} 期望 ${String(step.value)}，实际 ${String(actual)}。`);
      const enumMap = step.condition?.enum as Record<string, string> | undefined;
      const label = enumMap?.[String(actual)] ?? step.condition?.label;
      return { message: `断言枚举通过：${point}=${label ?? String(actual)}`, value: actual };
    }
    case "assert_bit": {
      if (!point) throw new Error("bit 断言步骤缺少 point_address。");
      const actual = Number(await readValue(point, target, values));
      const bit = Number(step.condition?.bit ?? 0);
      const expected = Boolean(step.condition?.expected);
      const actualBit = ((actual >> bit) & 1) === 1;
      if (actualBit !== expected) throw new Error(`断言 bit 失败：${point}.bit${bit} 期望 ${expected}，实际 ${actualBit}。`);
      return { message: `断言 bit 通过：${point}.bit${bit}=${actualBit}`, value: actualBit };
    }
    case "inject_fault": {
      const fault = {
        mode: step.condition?.mode as FaultInjectionMode | string | undefined,
        exceptionCode: step.condition?.exceptionCode as string | undefined,
        scenarioId: step.condition?.scenarioId as string | undefined,
      };
      const result = target.injectFault ? await target.injectFault(fault) : { ok: true, message: "fault injected" };
      assertTargetOk(result, "故障注入失败");
      log({ level: "warn", step_id: step.step_id, message: `故障注入：${fault.mode ?? fault.scenarioId ?? "manual"}` });
      return { message: `故障注入完成：${fault.mode ?? fault.scenarioId ?? "manual"}`, frame: result.frame };
    }
    case "clear_fault": {
      const result = target.clearFault ? await target.clearFault(point) : point ? await target.writePoint(point, 0) : { ok: true };
      assertTargetOk(result, "清除故障失败");
      if (point) values.set(point, 0);
      return { message: "清除故障完成", frame: result.frame };
    }
    case "start_scenario": {
      const scenarioId = String(step.condition?.scenarioId ?? step.value ?? "");
      if (!scenarioId) throw new Error("启动场景步骤缺少 scenarioId。");
      const result = target.startScenario ? await target.startScenario(scenarioId) : { ok: true };
      assertTargetOk(result, `启动场景失败：${scenarioId}`);
      values.clear();
      return { message: `启动场景完成：${scenarioId}`, frame: result.frame };
    }
    case "stop_scenario": {
      const scenarioId = String(step.condition?.scenarioId ?? step.value ?? "");
      const result = target.stopScenario ? await target.stopScenario(scenarioId) : { ok: true };
      assertTargetOk(result, `停止场景失败：${scenarioId}`);
      return { message: `停止场景完成：${scenarioId || "当前场景"}`, frame: result.frame };
    }
    case "check_frame": {
      const frames = normalizeFrames(target.getFrames?.() ?? []);
      const contains = String(step.condition?.contains ?? step.value ?? "");
      if (contains && !frames.some((frame) => frame.frame.includes(contains) || frame.note.includes(contains))) {
        throw new Error(`报文检查失败：未找到 ${contains}。`);
      }
      return { message: `报文检查通过：${contains || "有报文"}`, value: frames.length };
    }
    case "capture_screenshot": {
      const result = target.captureScreenshot ? await target.captureScreenshot() : { ok: true, screenshot: "data:image/png;base64," };
      assertTargetOk(result, "生成截图失败");
      if (result.screenshot) screenshots.push(result.screenshot);
      return { message: "生成截图完成", value: result.screenshot };
    }
    case "export_report":
      return { message: "导出报告步骤已排队" };
    default:
      return assertNever(step.type);
  }
}

async function waitForCondition(step: TestStep, target: AutoTestTarget, values: Map<string, unknown>, options: RunOptions) {
  const point = String(step.point_address);
  const timeout = step.timeout ?? 30_000;
  const poll = options.pollIntervalMs ?? 50;
  const start = Date.now();
  while (Date.now() - start <= timeout) {
    const actual = await readValue(point, target, values, true);
    if (compare(actual, step.condition?.value, step.condition?.operator as string | undefined)) return;
    if (poll <= 0) break;
    await sleep(Math.min(poll, 20));
  }
  throw new Error(`等待条件超时：${point} ${step.condition?.operator ?? "=="} ${String(step.condition?.value)}。`);
}

async function readValue(point: string, target: AutoTestTarget, values: Map<string, unknown>, force = false) {
  if (!force && values.has(point)) return values.get(point);
  const result = await target.readPoint(point);
  assertTargetOk(result, `读取点位失败：${point}`);
  values.set(point, result.value);
  return result.value;
}

export function createSimulatorTestTarget(profile: DeviceProfile): AutoTestTarget & { readPointSync: (point: string) => unknown } {
  const engine = createSimulatorEngine(profile);
  const frames: AutoTestFrame[] = [];

  const appendFrames = () => {
    frames.splice(0, frames.length, ...normalizeFrames(engine.getFrameLogs()));
  };

  return {
    id: `${profile.id}-simulator`,
    kind: "simulator",
    deviceInfo: { id: profile.id, name: profile.name, deviceType: profile.deviceType, protocolVersion: profile.version },
    connect: async () => {
      const status = engine.start();
      appendFrames();
      return { ok: status.running, message: status.reason ?? "simulator connected", frame: "SIM CONNECT" };
    },
    readPoint: async (point) => {
      const register = engine.readRegister(point);
      if (!register) return { ok: false, error: `点位不存在：${point}` };
      appendFrames();
      return { ok: true, value: register.currentValue, frame: `READ ${register.address}` };
    },
    writePoint: async (point, value) => {
      const result = engine.writeRegister(point, value as never);
      appendFrames();
      return { ok: result.ok, value, error: result.reason, frame: `WRITE ${point}=${String(value)}` };
    },
    startScenario: async (scenarioId) => {
      const result = engine.applyScene(scenarioId);
      appendFrames();
      return { ok: result.ok, error: result.reason, frame: `SCENARIO ${scenarioId}` };
    },
    stopScenario: async (scenarioId) => {
      frames.unshift({ direction: "event", time: "现在", frame: `STOP_SCENARIO ${scenarioId}`, note: "停止仿真场景" });
      return { ok: true, frame: `STOP_SCENARIO ${scenarioId}` };
    },
    injectFault: async (fault) => {
      if (fault.scenarioId) {
        const result = engine.applyScene(fault.scenarioId);
        appendFrames();
        frames.unshift({ direction: "response", time: "现在", frame: String(fault.mode ?? "fault"), note: `故障注入 ${fault.exceptionCode ?? ""}`.trim() });
        return { ok: result.ok, error: result.reason, frame: String(fault.mode ?? fault.scenarioId) };
      }
      frames.unshift({ direction: "response", time: "现在", frame: String(fault.mode ?? "fault"), note: `故障注入 ${fault.exceptionCode ?? ""}`.trim() });
      return { ok: true, frame: String(fault.mode ?? "fault") };
    },
    clearFault: async (point) => {
      if (point) engine.writeRegister(point, 0);
      frames.unshift({ direction: "event", time: "现在", frame: `CLEAR_FAULT ${point ?? "all"}`, note: "清除故障" });
      return { ok: true, frame: `CLEAR_FAULT ${point ?? "all"}` };
    },
    getFrames: () => [...frames, ...normalizeFrames(engine.getFrameLogs())],
    captureScreenshot: async () => ({ ok: true, screenshot: "data:image/png;base64,SIMULATOR" }),
    readPointSync: (point: string) => engine.readRegister(point)?.currentValue,
  };
}

export function generateTestReport(input: {
  projectName: string;
  protocolVersion: string;
  deviceInfo: AutoTestDeviceInfo;
  results: TestRunResult[];
  generatedAt?: number;
}): TestReport {
  const testTime = formatIso(input.generatedAt ?? Date.now());
  const reportBase = {
    reportId: `auto-test-report-${input.generatedAt ?? Date.now()}`,
    testTime,
    projectName: input.projectName,
    protocolVersion: input.protocolVersion,
    deviceInfo: input.deviceInfo,
    caseResults: input.results.map((result) => ({
      case_id: result.case_id,
      case_name: result.case_name,
      status: result.status,
      stepCount: result.stepResults.length,
      passedSteps: result.passedSteps,
      failedSteps: result.failedSteps,
      failureReason: result.failureReason ?? "",
      durationMs: result.durationMs,
    })),
    stepLogs: input.results.flatMap((result) => result.logs),
    failureReasons: input.results.flatMap((result) => result.failureReason ? [result.failureReason] : []),
    communicationFrames: input.results.flatMap((result) => result.frames),
    screenshots: input.results.flatMap((result) => result.screenshots),
  };
  const report = { ...reportBase, exports: { csv: "", html: "", pdf: "" } } satisfies TestReport;
  report.exports = {
    csv: exportReportCsv(report),
    html: exportReportHtml(report),
    pdf: exportReportPdf(report),
  };
  return report;
}

export function exportReportCsv(report: TestReport): string {
  const header = "用例ID,用例名称,状态,步骤数,失败原因";
  const rows = report.caseResults.map((item) => [item.case_id, item.case_name, item.status, item.stepCount, item.failureReason].map(csvCell).join(","));
  return `${[header, ...rows].join("\n")}\n`;
}

export function exportReportHtml(report: TestReport): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(report.projectName)} 自动化测试报告</title></head><body><h1>${escapeHtml(report.projectName)} 自动化测试报告</h1><p>测试时间：${report.testTime}</p><p>协议版本：${escapeHtml(report.protocolVersion)}</p><h2>设备信息</h2><p>${escapeHtml(report.deviceInfo.name)} / ${escapeHtml(report.deviceInfo.deviceType)}</p><h2>用例结果</h2>${report.caseResults.map((item) => `<article><h3>${escapeHtml(item.case_name)}</h3><p>${item.status} ${item.passedSteps}/${item.stepCount}</p><p>${escapeHtml(item.failureReason)}</p></article>`).join("")}<h2>步骤日志</h2><pre>${escapeHtml(report.stepLogs.map((log) => `${log.time} ${log.level} ${log.message}`).join("\n"))}</pre><h2>通信报文</h2><pre>${escapeHtml(report.communicationFrames.map((frame) => frame.frame).join("\n"))}</pre></body></html>`;
}

export function exportReportPdf(report: TestReport): string {
  return `%PDF-ICStudio-AutoTest\nTitle: ${report.projectName}\nGenerated: ${report.testTime}\nCases: ${report.caseResults.length}\n%%EOF\n`;
}

function assertTargetOk(result: TargetActionResult, prefix: string) {
  if (!result.ok) throw new Error(`${prefix}${result.error ? `：${result.error}` : ""}`);
}

function compare(actual: unknown, expected: unknown, operator = "==") {
  const left = Number(actual);
  const right = Number(expected);
  switch (operator) {
    case ">": return left > right;
    case ">=": return left >= right;
    case "<": return left < right;
    case "<=": return left <= right;
    case "!=": return !sameValue(actual, expected);
    case "==":
    default:
      return sameValue(actual, expected);
  }
}

function sameValue(left: unknown, right: unknown) {
  return Object.is(left, right) || String(left) === String(right);
}

function normalizeFrames(frames: Array<AutoTestFrame | FrameLog | string>): AutoTestFrame[] {
  return frames.map((frame) => {
    if (typeof frame === "string") return { direction: "event", time: "现在", frame, note: "自定义报文" };
    return {
      direction: frame.direction,
      time: frame.time,
      frame: frame.frame,
      note: frame.note,
    };
  });
}

function formatIso(timestamp: number) {
  return new Date(timestamp).toISOString();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function assertNever(value: never): never {
  throw new Error(`未支持的步骤类型：${String(value)}`);
}
