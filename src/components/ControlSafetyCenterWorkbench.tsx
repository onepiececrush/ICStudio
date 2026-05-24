import type { ControlCommandRequest, ControlExecutionResult, ControlOperationLog } from "../control/controlSafetyCenter";
import type { AppSnapshot } from "../types";

type ControlSafetyCenterWorkbenchProps = {
  snapshot: AppSnapshot;
  controlSafetyLogs: ControlOperationLog[];
  onControlSafetyCommand: (request: ControlCommandRequest) => Promise<ControlExecutionResult>;
};

const highRiskTemplates: ControlCommandRequest[] = [
  {
    operation: "start",
    label: "启动",
    deviceId: "pcs-1",
    deviceScope: "pcs",
    requiredPermission: "control:execute",
    address: 40101,
    value: 1,
    expectedReadback: 1,
    allowedStates: ["standby", "stopped", "running"],
    requiresConfirmation: true,
  },
  {
    operation: "stop",
    label: "停止",
    deviceId: "pcs-1",
    deviceScope: "pcs",
    requiredPermission: "control:execute",
    address: 40101,
    value: 0,
    expectedReadback: 0,
    allowedStates: ["running", "standby", "stopped"],
    requiresConfirmation: true,
  },
  {
    operation: "reset",
    label: "复位",
    deviceId: "pcs-1",
    deviceScope: "pcs",
    requiredPermission: "control:execute",
    address: 40102,
    value: 1,
    expectedReadback: 1,
    allowedStates: ["fault", "standby", "stopped", "running"],
    requiresConfirmation: true,
  },
  {
    operation: "emergency-stop",
    label: "急停",
    deviceId: "pcs-1",
    deviceScope: "pcs",
    requiredPermission: "control:execute",
    address: 40103,
    value: 1,
    expectedReadback: 1,
    allowedStates: ["running", "standby", "fault", "stopped"],
    requiresConfirmation: true,
  },
  {
    operation: "active-power-setpoint",
    label: "有功功率给定",
    deviceId: "pcs-1",
    deviceScope: "pcs",
    requiredPermission: "control:power",
    address: 14006,
    value: 500,
    expectedReadback: 500,
    range: { min: -1000, max: 1000, unit: "kW" },
    allowedStates: ["running", "standby"],
    requiresConfirmation: true,
  },
  {
    operation: "reactive-power-setpoint",
    label: "无功功率给定",
    deviceId: "pcs-1",
    deviceScope: "pcs",
    requiredPermission: "control:power",
    address: 14007,
    value: -120,
    expectedReadback: -120,
    range: { min: -500, max: 500, unit: "kvar" },
    allowedStates: ["running", "standby"],
    requiresConfirmation: true,
  },
  {
    operation: "parameter-batch-write",
    label: "参数批量写入",
    deviceId: "pcs-1",
    deviceScope: "parameters",
    requiredPermission: "control:parameters",
    allowedStates: ["standby", "stopped"],
    requiresConfirmation: true,
    batch: [
      { address: 41001, value: 10, expectedReadback: 10, range: { min: 0, max: 100 } },
      { address: 41002, value: 20, expectedReadback: 20, range: { min: 0, max: 100 } },
    ],
  },
  {
    operation: "fault-clear",
    label: "故障清除",
    deviceId: "pcs-1",
    deviceScope: "pcs",
    requiredPermission: "control:execute",
    address: 14003,
    value: 0,
    expectedReadback: 0,
    allowedStates: ["fault", "standby", "running"],
    requiresConfirmation: true,
  },
  {
    operation: "firmware-upgrade",
    label: "固件升级",
    deviceId: "pcs-1",
    deviceScope: "firmware",
    requiredPermission: "control:upgrade",
    address: 45001,
    value: "v2.3.1",
    expectedReadback: "v2.3.1",
    allowedStates: ["standby", "stopped"],
    requiresConfirmation: true,
  },
  {
    operation: "simulator-fault-injection",
    label: "从机模拟故障注入",
    deviceId: "pcs-1",
    deviceScope: "simulator",
    requiredPermission: "simulator:fault",
    address: 16021,
    value: 1,
    expectedReadback: 1,
    allowedStates: ["running", "standby"],
    requiresConfirmation: true,
    selfTestOnly: true,
  },
];

const processChecks = [
  "权限校验",
  "当前连接设备校验",
  "设备状态校验",
  "范围校验",
  "自测模式校验",
  "二次确认",
  "发送写入命令",
  "等待响应",
  "写后回读验证",
  "操作日志记录",
];

export function ControlSafetyCenterWorkbench({ snapshot, controlSafetyLogs, onControlSafetyCommand }: ControlSafetyCenterWorkbenchProps) {
  const mode = snapshot.loopbackDashboard?.selfTestMode ? "自测模式" : "真实设备模式";
  const latestResult = controlSafetyLogs[0]?.result === "success" ? "最近执行成功" : controlSafetyLogs[0]?.failureReason || "等待执行";

  return (
    <section className="control-safety-center" aria-label="控制命令安全中心">
      <header className="control-safety-hero glass-panel">
        <div>
          <span className="eyebrow">Control Command Safety Center</span>
          <h1>控制命令安全中心</h1>
          <p>所有启动、停止、复位、急停、功率给定、参数写入、固件升级和从机模拟故障注入都必须经过权限校验、范围校验、设备状态校验、二次确认、写后回读验证和操作日志记录。</p>
        </div>
        <div className="safety-mode-card">
          <span>{mode}</span>
          <strong>{snapshot.connection.endpoint}</strong>
          <small>{snapshot.connection.status} · {latestResult}</small>
        </div>
      </header>

      <section className="safety-check-grid glass-panel" aria-label="安全流程">
        {processChecks.map((check, index) => (
          <article key={check}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{check}</strong>
            <small>{checkDetail(check)}</small>
          </article>
        ))}
      </section>

      <section className="safety-operation-grid" aria-label="高危操作">
        {highRiskTemplates.map((template) => (
          <article className="safety-operation-card glass-panel" key={template.operation}>
            <div>
              <span>{template.operation}</span>
              <strong>{template.label}</strong>
              <small>设备 {template.deviceId} · 范围 {template.deviceScope} · 地址 {template.address ?? template.batch?.map((item) => item.address).join("/")}</small>
            </div>
            <p>{operationDescription(template)}</p>
            <button className="lab-button danger" type="button" onClick={() => { void onControlSafetyCommand(template); }}>
              执行安全命令
            </button>
          </article>
        ))}
      </section>

      <section className="safety-log-panel glass-panel" aria-label="操作日志">
        <div className="lab-section-title">
          <div>
            <h2>操作日志</h2>
            <p>字段：时间、用户、操作类型、设备、地址、写入值、写入前值、写入后值、结果、失败原因。</p>
          </div>
        </div>
        <div className="safety-log-table-wrap">
          <table className="safety-log-table">
            <thead>
              <tr>
                <th>时间</th><th>用户</th><th>操作类型</th><th>设备</th><th>模式</th><th>地址</th><th>写入值</th><th>写入前值</th><th>写入后值</th><th>结果</th><th>失败原因</th>
              </tr>
            </thead>
            <tbody>
              {controlSafetyLogs.length === 0 ? (
                <tr><td colSpan={11}>暂无操作日志</td></tr>
              ) : controlSafetyLogs.map((log, index) => (
                <tr className={log.result === "success" ? "success" : "failed"} key={`${log.time}-${log.operation}-${log.address}-${index}`}>
                  <td>{log.time}</td>
                  <td>{log.user}</td>
                  <td>{log.operation}</td>
                  <td>{log.device}</td>
                  <td>{log.mode === "self-test" ? "自测模式" : "真实设备模式"}</td>
                  <td>{log.address}</td>
                  <td>{String(log.writeValue ?? "")}</td>
                  <td>{String(log.beforeValue ?? "")}</td>
                  <td>{String(log.afterValue ?? "")}</td>
                  <td>{log.result === "success" ? "成功" : "失败"}</td>
                  <td>{log.failureReason || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function checkDetail(check: string) {
  if (check.includes("权限")) return "用户必须具备该操作对应 permission。";
  if (check.includes("连接")) return "设备 ID、连接状态、写入范围必须匹配。";
  if (check.includes("状态")) return "按运行/待机/故障/升级等状态白名单执行。";
  if (check.includes("范围")) return "功率给定和参数写入执行 min/max 检查。";
  if (check.includes("自测")) return "真实设备模式与自测模式明显区分。";
  if (check.includes("确认")) return "启动/停止/复位等高危动作必须二次确认。";
  if (check.includes("回读")) return "写入后读取目标地址并比对期望值。";
  return "失败时记录明确原因并停止链路。";
}

function operationDescription(template: ControlCommandRequest) {
  if (template.batch?.length) return `批量写入 ${template.batch.length} 个地址，逐项记录写入前后值。`;
  if (template.range) return `范围 ${template.range.min} ~ ${template.range.max}${template.range.unit ? ` ${template.range.unit}` : ""}，写后期望 ${String(template.expectedReadback ?? template.value)}。`;
  if (template.selfTestOnly) return "仅允许在自测模式执行，禁止误打到真实设备。";
  return `写入值 ${String(template.value)}，写后期望 ${String(template.expectedReadback ?? template.value)}。`;
}
