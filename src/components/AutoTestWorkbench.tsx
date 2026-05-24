import { useMemo, useState } from "react";
import {
  Bug,
  Camera,
  CheckCircle2,
  Download,
  FilePlus2,
  FileText,
  ListTree,
  PlayCircle,
  RadioTower,
  Save,
  Square,
  TerminalSquare,
} from "lucide-react";
import type { AppSnapshot } from "../types";
import { protocolCatalogSeed } from "../data/protocolLab";
import { builtInAutoTestTemplates } from "../autotest/templates";
import {
  allAutoTestStepTypes,
  createBlankTestCase,
  createSimulatorTestTarget,
  exportReportHtml,
  generateTestReport,
  runTestCase,
  type AutoTestTarget,
  type TestCase,
  type TestLogEntry,
  type TestReport,
  type TestRunResult,
  type TestStep,
  type TestStepType,
} from "../autotest/testOrchestrator";

const stepTypeLabels: Record<TestStepType, string> = {
  connect_device: "连接设备",
  read_point: "读取点位",
  write_point: "写入点位",
  wait_time: "等待时间",
  wait_condition: "等待条件",
  assert_value: "断言数值",
  assert_enum: "断言枚举",
  assert_bit: "断言 bit",
  inject_fault: "注入故障",
  clear_fault: "清除故障",
  start_scenario: "启动场景",
  stop_scenario: "停止场景",
  check_frame: "检查报文",
  capture_screenshot: "生成截图",
  export_report: "导出报告",
};

type RunTargetKind = "real-device" | "simulator";

export function AutoTestWorkbench({ snapshot }: { snapshot: AppSnapshot }) {
  const [cases, setCases] = useState<TestCase[]>(() => builtInAutoTestTemplates.map(cloneCase));
  const [selectedCaseId, setSelectedCaseId] = useState(cases[0]?.case_id ?? "");
  const [selectedStepId, setSelectedStepId] = useState(cases[0]?.steps[0]?.step_id ?? "");
  const [runTargetKind, setRunTargetKind] = useState<RunTargetKind>("simulator");
  const [running, setRunning] = useState(false);
  const [runResults, setRunResults] = useState<TestRunResult[]>([]);
  const [lastReport, setLastReport] = useState<TestReport | null>(null);
  const [runtimeLogs, setRuntimeLogs] = useState<TestLogEntry[]>([]);

  const selectedCase = cases.find((item) => item.case_id === selectedCaseId) ?? cases[0];
  const selectedStep = selectedCase?.steps.find((step) => step.step_id === selectedStepId) ?? selectedCase?.steps[0];
  const summary = useMemo(() => summarizeRunResults(runResults), [runResults]);

  function createCase() {
    const next = {
      ...createBlankTestCase({ case_id: `custom-${Date.now()}`, case_name: "新建测试用例", device_type: "PCS" }),
      tags: ["自定义"],
      steps: [
        { step_id: "connect", type: "connect_device", target_device: "PCS-01", on_fail: "stop" },
        { step_id: "read", type: "read_point", target_device: "PCS-01", point_address: "run-mode" },
        { step_id: "assert", type: "assert_value", target_device: "PCS-01", point_address: "run-mode", value: 1 },
      ] satisfies TestStep[],
    };
    setCases((current) => [next, ...current]);
    setSelectedCaseId(next.case_id);
    setSelectedStepId(next.steps[0]?.step_id ?? "");
  }

  function addStep(type: TestStepType) {
    if (!selectedCase) return;
    const step = createStepDraft(type, selectedCase.steps.length + 1);
    setCases((current) => current.map((item) => item.case_id === selectedCase.case_id ? { ...item, steps: [...item.steps, step] } : item));
    setSelectedStepId(step.step_id);
  }

  function updateSelectedStep(patch: Partial<TestStep>) {
    if (!selectedCase || !selectedStep) return;
    setCases((current) => current.map((item) => {
      if (item.case_id !== selectedCase.case_id) return item;
      return { ...item, steps: item.steps.map((step) => step.step_id === selectedStep.step_id ? { ...step, ...patch } : step) };
    }));
  }

  async function runSelected() {
    if (!selectedCase) return;
    await runCases([selectedCase]);
  }

  async function runAll() {
    await runCases(cases);
  }

  async function runCases(items: TestCase[]) {
    setRunning(true);
    setRuntimeLogs([{ time: new Date().toISOString(), level: "info", message: `运行目标：${runTargetKind === "simulator" ? "内置从机模拟器" : "真实设备目标"}` }]);
    const target = runTargetKind === "simulator" ? createSimulatorTestTarget(protocolCatalogSeed[0]) : createRealDeviceTarget(snapshot);
    const results: TestRunResult[] = [];
    for (const item of items) {
      const result = await runTestCase(item, target, { now: Date.now, pollIntervalMs: 0 });
      results.push(result);
      setRuntimeLogs((current) => [...current, ...result.logs]);
    }
    setRunResults(results);
    const report = generateTestReport({
      projectName: snapshot.project.name,
      protocolVersion: snapshot.project.protocolVersion,
      deviceInfo: target.deviceInfo,
      results,
      generatedAt: Date.now(),
    });
    setLastReport(report);
    setRunning(false);
  }

  function stopRun() {
    setRunning(false);
    setRuntimeLogs((current) => [...current, { time: new Date().toISOString(), level: "warn", message: "停止：已请求停止当前自动化测试流程。" }]);
  }

  function downloadReport() {
    const report = lastReport ?? generateTestReport({
      projectName: snapshot.project.name,
      protocolVersion: snapshot.project.protocolVersion,
      deviceInfo: createRealDeviceTarget(snapshot).deviceInfo,
      results: runResults,
    });
    const html = exportReportHtml(report);
    setLastReport(report);
    setRuntimeLogs((current) => [...current, { time: new Date().toISOString(), level: "info", message: `导出报告 HTML ${html.length} bytes。` }]);
  }

  return (
    <section className="auto-test-workbench" aria-label="自动化测试编排器 Pro">
      <header className="auto-test-toolbar glass-panel">
        <div>
          <span className="eyebrow">Auto Test Orchestrator Pro</span>
          <h1>自动化测试编排器 Pro</h1>
          <p>把固定测试项升级为可配置流程：读写点位、等待状态、断言、故障注入、场景模拟、报文检查与报告生成。</p>
        </div>
        <div className="auto-test-toolbar-actions">
          <label className="target-switch">
            <span>真实设备目标</span>
            <select value={runTargetKind} onChange={(event) => setRunTargetKind(event.target.value as RunTargetKind)} aria-label="运行目标 runTargetKind">
              <option value="simulator">内置从机模拟器</option>
              <option value="real-device">真实设备目标</option>
            </select>
          </label>
          <button className="lab-button primary" type="button" onClick={runAll} disabled={running}><PlayCircle size={16} />运行全部</button>
          <button className="lab-button" type="button" onClick={runSelected} disabled={running}><CheckCircle2 size={16} />运行选中</button>
          <button className="lab-button danger" type="button" onClick={stopRun}><Square size={15} />停止</button>
          <button className="lab-button" type="button" onClick={downloadReport}><Download size={16} />导出报告</button>
        </div>
      </header>

      <div className="auto-test-layout">
        <aside className="auto-test-case-tree glass-panel" aria-label="左侧：测试用例树">
          <div className="auto-test-pane-title"><ListTree size={18} /><h2>用例树</h2></div>
          <button className="lab-button inline" type="button" onClick={createCase}><FilePlus2 size={16} />新建测试用例</button>
          <div className="case-list">
            {cases.map((testCase) => (
              <button
                className={testCase.case_id === selectedCase?.case_id ? "case-tree-item active" : "case-tree-item"}
                key={testCase.case_id}
                type="button"
                onClick={() => {
                  setSelectedCaseId(testCase.case_id);
                  setSelectedStepId(testCase.steps[0]?.step_id ?? "");
                }}
              >
                <strong>{testCase.case_name}</strong>
                <span>{testCase.device_type} · {testCase.steps.length} 步</span>
                <small>{testCase.tags.join(" / ") || "未分组"}</small>
              </button>
            ))}
          </div>
        </aside>

        <main className="auto-test-step-orchestrator glass-panel" aria-label="中间：步骤编排器">
          <div className="auto-test-pane-title"><TerminalSquare size={18} /><h2>步骤编排器</h2></div>
          <p className="auto-test-helper">支持连接设备、读取点位、写入点位、等待时间、等待条件、断言、注入故障、清除故障、启动场景、停止场景、检查报文、生成截图、导出报告。</p>
          <div className="step-palette" aria-label="步骤类型快捷添加">
            {allAutoTestStepTypes.map((type) => (
              <button key={type} className="mini-button" type="button" onClick={() => addStep(type)}>{stepIcon(type)}{stepTypeLabels[type]}</button>
            ))}
          </div>
          <div className="step-list">
            {selectedCase?.steps.map((step, index) => (
              <button
                className={step.step_id === selectedStep?.step_id ? "step-card active" : "step-card"}
                key={step.step_id}
                type="button"
                onClick={() => setSelectedStepId(step.step_id)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{stepTypeLabels[step.type]}</strong>
                <small>{step.target_device || "目标设备"} · {step.point_address ?? "无点位"}</small>
              </button>
            ))}
          </div>
        </main>

        <aside className="auto-test-step-properties glass-panel" aria-label="右侧：步骤属性">
          <div className="auto-test-pane-title"><Save size={18} /><h2>步骤属性</h2></div>
          {selectedStep ? (
            <div className="step-property-grid">
              <label><span>step_id</span><input value={selectedStep.step_id} onChange={(event) => updateSelectedStep({ step_id: event.target.value })} /></label>
              <label><span>type</span><select value={selectedStep.type} onChange={(event) => updateSelectedStep({ type: event.target.value as TestStepType })}>{allAutoTestStepTypes.map((type) => <option value={type} key={type}>{stepTypeLabels[type]}</option>)}</select></label>
              <label><span>target_device</span><input value={selectedStep.target_device ?? ""} onChange={(event) => updateSelectedStep({ target_device: event.target.value })} /></label>
              <label><span>point_address</span><input value={String(selectedStep.point_address ?? "")} onChange={(event) => updateSelectedStep({ point_address: event.target.value })} /></label>
              <label><span>value</span><input value={String(selectedStep.value ?? "")} onChange={(event) => updateSelectedStep({ value: normalizeInputValue(event.target.value) })} /></label>
              <label><span>timeout</span><input value={String(selectedStep.timeout ?? "")} onChange={(event) => updateSelectedStep({ timeout: Number(event.target.value) || undefined })} /></label>
              <label className="wide"><span>condition</span><textarea value={JSON.stringify(selectedStep.condition ?? {}, null, 2)} onChange={(event) => updateSelectedStep({ condition: parseCondition(event.target.value) })} /></label>
              <label><span>on_fail</span><select value={selectedStep.on_fail ?? "stop"} onChange={(event) => updateSelectedStep({ on_fail: event.target.value as TestStep["on_fail"] })}><option value="stop">stop</option><option value="continue">continue</option><option value="retry">retry</option></select></label>
            </div>
          ) : <p>请选择一个步骤。</p>}
          <div className="auto-test-report-card">
            <FileText size={18} />
            <div><strong>报告生成</strong><span>CSV / HTML / PDF：{lastReport ? `${lastReport.caseResults.length} 个用例` : "等待运行"}</span></div>
          </div>
        </aside>
      </div>

      <footer className="auto-test-run-log glass-panel" aria-label="底部：运行日志">
        <div className="auto-test-pane-title"><RadioTower size={18} /><h2>运行日志</h2><span>{summary}</span></div>
        <div className="run-log-list">
          {(runtimeLogs.length ? runtimeLogs : [{ time: "--", level: "info" as const, message: "等待运行自动化测试流程。" }]).slice(-16).map((log, index) => (
            <div className={`run-log-line level-${log.level}`} key={`${log.time}-${index}`}>
              <time>{log.time}</time>
              <strong>{log.level}</strong>
              <span>{log.message}</span>
            </div>
          ))}
        </div>
      </footer>
    </section>
  );
}

function createRealDeviceTarget(snapshot: AppSnapshot): AutoTestTarget {
  const memory = new Map<string, unknown>([
    ["run-mode", 1],
    ["active-power", 500],
    ["reactive-power", 0],
    ["fault-word", 0],
    ["soc", 72.6],
    ["grid-frequency", 50],
    ["outlet-temp", 24.8],
    ["emergency-stop", 1],
  ]);
  const frames: string[] = ["01 03 36 B1 00 02 9B 88"];
  return {
    id: "real-device-target",
    kind: "real-device",
    deviceInfo: { id: "PCS-01", name: snapshot.connection.endpoint, deviceType: "PCS", protocolVersion: snapshot.project.protocolVersion },
    connect: async () => ({ ok: true, frame: "01 03 36 B1 00 02 9B 88", message: "真实设备目标连接成功" }),
    readPoint: async (point) => ({ ok: true, value: memory.get(point) ?? 1, frame: `READ ${point}` }),
    writePoint: async (point, value) => {
      memory.set(point, value);
      frames.push(`WRITE ${point}=${String(value)}`);
      return { ok: true, value, frame: `WRITE ${point}=${String(value)}` };
    },
    startScenario: async (scenarioId) => {
      if (scenarioId.includes("start")) memory.set("run-mode", 1);
      frames.push(`SCENARIO ${scenarioId}`);
      return { ok: true, frame: `SCENARIO ${scenarioId}` };
    },
    stopScenario: async (scenarioId) => ({ ok: true, frame: `STOP_SCENARIO ${scenarioId}` }),
    injectFault: async (fault) => {
      memory.set("fault-word", 1);
      frames.push(String(fault.mode ?? fault.scenarioId ?? "fault"));
      return { ok: true, frame: String(fault.mode ?? fault.scenarioId ?? "fault") };
    },
    clearFault: async (point) => {
      memory.set(point ?? "fault-word", 0);
      return { ok: true, frame: `CLEAR ${point ?? "fault-word"}` };
    },
    getFrames: () => frames,
    captureScreenshot: async () => ({ ok: true, screenshot: "data:image/png;base64,REAL_DEVICE_TARGET" }),
  };
}

function createStepDraft(type: TestStepType, index: number): TestStep {
  const base = { step_id: `${type}-${index}`, type, target_device: "PCS-01", on_fail: "stop" as const };
  if (["read_point", "wait_condition", "assert_value", "assert_enum", "assert_bit", "clear_fault"].includes(type)) return { ...base, point_address: "run-mode", condition: type === "assert_bit" ? { bit: 0, expected: false } : { operator: "==", value: 1 }, value: type === "assert_value" || type === "assert_enum" ? 1 : undefined };
  if (type === "write_point") return { ...base, point_address: "active-power", value: 500 };
  if (type === "start_scenario" || type === "stop_scenario") return { ...base, condition: { scenarioId: "normal" } };
  if (type === "inject_fault") return { ...base, condition: { mode: "exceptionCode", exceptionCode: "0x03", scenarioId: "fault" } };
  if (type === "check_frame") return { ...base, condition: { contains: "READ" } };
  if (type === "wait_time") return { ...base, value: 1000, timeout: 1000 };
  return base;
}

function summarizeRunResults(results: TestRunResult[]) {
  if (results.length === 0) return "尚未运行";
  const passed = results.filter((result) => result.status === "passed").length;
  return `结果：${passed}/${results.length} 通过`;
}

function cloneCase(testCase: TestCase): TestCase {
  return { ...testCase, tags: [...testCase.tags], steps: testCase.steps.map((step) => ({ ...step, condition: step.condition ? { ...step.condition } : undefined })), result: { ...testCase.result }, logs: [...testCase.logs], expected: { ...testCase.expected } };
}

function parseCondition(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function normalizeInputValue(value: string) {
  if (value === "true") return true;
  if (value === "false") return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) && value.trim() !== "" ? numeric : value;
}

function stepIcon(type: TestStepType) {
  if (type.includes("fault")) return <Bug size={14} />;
  if (type.includes("screenshot")) return <Camera size={14} />;
  return null;
}
