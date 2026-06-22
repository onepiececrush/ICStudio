import {
  AlertTriangle,
  BarChart3,
  PlayCircle,
  RefreshCw,
  Save,
  Server,
} from "lucide-react";
import type {
  DiagnosticFrameRecord,
  DiagnosticResult,
  DiagnosticSession,
  DiagnosticStats,
} from "../../communication/diagnostics";
import {
  diagnosisForDiagnosticFrame,
  diagnosticFrameResultLabels,
} from "../../communication/frameView";

export type ReplayTarget = "真实设备" | "内置模拟器";

export type ReplayDraft = {
  frameId: string;
  unitId: string;
  address: string;
  dataHex: string;
  target: ReplayTarget;
  continuous: boolean;
  originalInterval: boolean;
};

export type ReplayReceipt = {
  target: ReplayTarget;
  ok: boolean;
  rawFrame: string;
  elapsedMs: number;
  error?: string;
  at: string;
};

const diagnosisRules = [
  "无响应：检查设备地址、串口线、IP、端口",
  "CRC 错误：检查波特率、校验位、线路干扰",
  "异常码 01：非法功能码",
  "异常码 02：非法地址",
  "异常码 03：非法数据值",
  "异常码 04：从站设备故障",
  "响应长度异常：检查数据类型或寄存器数量",
];

export function StatsPanel({ stats }: { stats: DiagnosticStats }) {
  const metrics = [
    ["总请求数", stats.totalRequests],
    ["成功数", stats.successCount],
    ["失败数", stats.failureCount],
    ["超时数", stats.timeoutCount],
    ["CRC 错误数", stats.crcErrorCount],
    ["异常响应数", stats.exceptionResponseCount],
    ["平均响应时间", `${stats.averageResponseTimeMs} ms`],
    ["最大响应时间", `${stats.maxResponseTimeMs} ms`],
    ["最慢设备", stats.slowestDevice ? `Unit ${stats.slowestDevice.unitId} / ${stats.slowestDevice.averageResponseTimeMs} ms` : "暂无"],
    ["最容易失败地址段", stats.mostFailureAddressRange ? `${stats.mostFailureAddressRange.range} (${stats.mostFailureAddressRange.failureCount})` : "暂无"],
  ] as const;
  return (
    <section className="lab-card glass-panel">
      <div className="lab-section-title">
        <div>
          <span className="eyebrow"><BarChart3 size={13} /> Statistics</span>
          <h2>通信统计</h2>
          <p>统计维度覆盖成功率、超时、CRC 错误、异常响应、平均/最大响应时间、最慢设备和失败地址段。</p>
        </div>
      </div>
      <div className="communication-stat-grid">
        {metrics.map(([label, value]) => <ProfileFact label={label} value={String(value)} key={label} />)}
      </div>
      <div className="success-curve" aria-label="最近 5 分钟成功率曲线">
        <h3>最近 5 分钟成功率曲线</h3>
        <div className="curve-bars">
          {expandSuccessCurve(stats.recentFiveMinuteSuccessRate).map((point) => (
            <div className="curve-bar" key={point.minute}>
              <span style={{ height: `${Math.max(4, point.successRate)}%` }} />
              <small>{point.minute.slice(-5)}</small>
              <strong>{point.successRate}%</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function DiagnosisPanel({ frames }: { frames: DiagnosticFrameRecord[] }) {
  const abnormalFrames = frames.filter((frame) => ["timeout", "crcError", "exception", "parseError"].includes(frame.result));
  return (
    <section className="lab-card glass-panel">
      <div className="lab-section-title">
        <div>
          <span className="eyebrow"><AlertTriangle size={13} /> Diagnosis</span>
          <h2>异常诊断</h2>
          <p>根据超时、CRC 错误、Modbus 异常码和长度解析异常自动给出处置建议。</p>
        </div>
      </div>
      <div className="diagnosis-grid">
        {diagnosisRules.map((rule) => <article className="diagnosis-card" key={rule}>{rule}</article>)}
      </div>
      <div className="diagnosis-list">
        {abnormalFrames.map((frame) => (
          <article className="diagnosis-event" key={frame.id}>
            <strong>{frame.time} · Unit {frame.unitId ?? "-"} · FC{frame.functionCode ?? "-"}</strong>
            <span>{diagnosisForDiagnosticFrame(frame)}</span>
            <code>{frame.rawFrame}</code>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ReplayPanel(props: ReplayPanelProps) {
  const { frames, replay, selectedFrame, receipt, onReplayChange, onRunReplay } = props;
  const update = (key: keyof ReplayDraft, value: string | boolean) => onReplayChange((current) => ({ ...current, [key]: value }));
  return (
    <section className="lab-card glass-panel">
      <div className="lab-section-title">
        <div>
          <span className="eyebrow"><RefreshCw size={13} /> Replay</span>
          <h2>报文回放</h2>
          <p>选择历史报文，修改 Unit ID、地址和数据后，可重放到真实设备或内置模拟器。</p>
        </div>
      </div>
      <div className="replay-grid">
        <div className="replay-form">
          <label>选择历史报文
            <select value={selectedFrame?.id ?? replay.frameId} onChange={(event) => update("frameId", event.target.value)}>
              {frames.map((frame) => (
                <option value={frame.id} key={frame.id}>{frame.id} · {frame.protocol} · Unit {frame.unitId ?? "-"} · FC{frame.functionCode ?? "-"}</option>
              ))}
            </select>
          </label>
          <label>修改 Unit ID<input inputMode="numeric" value={replay.unitId} onChange={(event) => update("unitId", event.target.value)} placeholder={String(selectedFrame?.unitId ?? "保持原值")} /></label>
          <label>修改地址<input inputMode="numeric" value={replay.address} onChange={(event) => update("address", event.target.value)} placeholder={String(selectedFrame?.startAddress ?? "保持原值")} /></label>
          <label>修改数据<input value={replay.dataHex} onChange={(event) => update("dataHex", event.target.value)} placeholder="修改数据，例如 00 2A" /></label>
          <label>回放目标
            <select value={replay.target} onChange={(event) => update("target", event.target.value as ReplayTarget)}>
              <option value="内置模拟器">重放到内置模拟器</option>
              <option value="真实设备">重放到真实设备</option>
            </select>
          </label>
          <div className="replay-switches">
            <label><input type="checkbox" checked={replay.continuous} onChange={(event) => update("continuous", event.target.checked)} /> 连续回放</label>
            <label><input type="checkbox" checked={replay.originalInterval} onChange={(event) => update("originalInterval", event.target.checked)} /> 按原时间间隔回放</label>
          </div>
          <div className="hero-actions replay-actions">
            <button className="lab-button primary" type="button" onClick={() => onRunReplay("内置模拟器")}><PlayCircle size={17} />重放到内置模拟器</button>
            <button className="lab-button" type="button" onClick={() => onRunReplay("真实设备")}><Server size={17} />重放到真实设备</button>
          </div>
        </div>
        <div className="replay-preview">
          <h3>回放预览</h3>
          <p>导出为 JSON / 导出为 CSV 可在页面顶部直接保存当前筛选后的报文集合。</p>
          <FramePreview frame={selectedFrame} />
          {receipt ? <ReplayReceiptCard receipt={receipt} /> : null}
        </div>
      </div>
    </section>
  );
}

export function SessionsPanel({ sessions, stats, summary }: SessionsPanelProps) {
  return (
    <section className="lab-card glass-panel">
      <div className="lab-section-title">
        <div>
          <span className="eyebrow"><Save size={13} /> Sessions</span>
          <h2>会话记录</h2>
          <p>一次连接过程保存为一个 session，包含开始/结束时间、通信配置、报文数量、异常数量和关联工程信息。</p>
        </div>
      </div>
      <article className="session-summary">
        <strong>通信诊断摘要</strong>
        <span>{summary}</span>
        <small>当前成功率 {formatStatsSuccessRate(stats)}%，最慢设备 {stats.slowestDevice ? `Unit ${stats.slowestDevice.unitId}` : "暂无"}</small>
      </article>
      <div className="communication-table-wrap memory-table-wrap">
        <table className="communication-table memory-table">
          <thead>
            <tr>
              <th>开始时间</th>
              <th>结束时间</th>
              <th>通信配置</th>
              <th>报文数量</th>
              <th>异常数量</th>
              <th>关联工程</th>
              <th>关联协议版本</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => <SessionRow session={session} key={session.id} />)}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ResultBadge({ result }: { result: DiagnosticResult }) {
  return <span className={`result-badge result-${result}`}>{diagnosticFrameResultLabels[result]}</span>;
}

export function ProfileFact({ label, value, tone }: { label: string; value: string; tone?: "valid" | "warning" | "error" }) {
  return <div className={tone ? `profile-fact tone-${tone}` : "profile-fact"}><span>{label}</span><strong>{value}</strong></div>;
}

export function formatStatsSuccessRate(stats: DiagnosticStats) {
  return stats.totalRequests === 0 ? "0.0" : ((stats.successCount / stats.totalRequests) * 100).toFixed(1);
}

type ReplayPanelProps = {
  frames: DiagnosticFrameRecord[];
  replay: ReplayDraft;
  selectedFrame?: DiagnosticFrameRecord;
  receipt: ReplayReceipt | null;
  onReplayChange: (updater: ReplayDraft | ((current: ReplayDraft) => ReplayDraft)) => void;
  onRunReplay: (target: ReplayTarget) => void;
};

type SessionsPanelProps = {
  sessions: DiagnosticSession[];
  stats: DiagnosticStats;
  summary: string;
};

function FramePreview({ frame }: { frame?: DiagnosticFrameRecord }) {
  if (!frame) return <p>暂无可回放报文。</p>;
  return (
    <article className="frame-preview">
      <strong>{frame.protocol} {frame.direction === "request" ? "请求" : "响应"} · Unit {frame.unitId ?? "-"} · FC{frame.functionCode ?? "-"}</strong>
      <span>地址 {frame.startAddress ?? "-"} · 数量 {frame.quantity ?? "-"} · {diagnosticFrameResultLabels[frame.result]}</span>
      <code>{frame.rawFrame}</code>
      <small>{frame.description}</small>
    </article>
  );
}

function ReplayReceiptCard({ receipt }: { receipt: ReplayReceipt }) {
  return (
    <article className={receipt.ok ? "replay-receipt ok" : "replay-receipt failed"}>
      <strong>{receipt.at} · {receipt.target} · {receipt.ok ? "发送成功" : "发送失败"}</strong>
      <span>耗时 {receipt.elapsedMs} ms</span>
      <code>{receipt.rawFrame}</code>
      {receipt.error ? <small>{receipt.error}</small> : null}
    </article>
  );
}

function SessionRow({ session }: { session: DiagnosticSession }) {
  return (
    <tr>
      <td>{formatTimestamp(session.startTime)}</td>
      <td>{formatTimestamp(session.endTime)}</td>
      <td>{session.connectionConfig}</td>
      <td>{session.frameCount}</td>
      <td>{session.exceptionCount}</td>
      <td>{session.project}</td>
      <td>{session.protocolVersion}</td>
    </tr>
  );
}

function expandSuccessCurve(points: Array<{ minute: string; successRate: number }>) {
  if (points.length >= 5) return points.slice(-5);
  const last = points[points.length - 1] ?? { minute: "00:00", successRate: 0 };
  return Array.from({ length: 5 }, (_, index) => ({ ...last, minute: `${last.minute}-${index + 1}`, successRate: index < 4 ? Math.max(0, last.successRate - (4 - index) * 8) : last.successRate }));
}

function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toISOString().replace("T", " ").replace("Z", "");
}
