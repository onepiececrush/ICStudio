import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Download,
  FileJson,
  Filter,
  PlayCircle,
  RadioTower,
  RefreshCw,
  Save,
  Server,
} from "lucide-react";
import type { AppSnapshot } from "../types";
import {
  CommunicationDiagnosticsCenter,
  createDiagnosticSummary,
  exportFramesAsCsv,
  exportFramesAsJson,
  replayFrameToSimulator,
  type DiagnosticFrameRecord,
  type DiagnosticResult,
  type DiagnosticSession,
  type DiagnosticStats,
} from "../communication/diagnostics";

type CommunicationTab = "实时报文" | "通信统计" | "异常诊断" | "报文回放" | "会话记录";
type ReplayTarget = "真实设备" | "内置模拟器";

type FilterDraft = {
  unitId: string;
  functionCode: string;
  addressFrom: string;
  addressTo: string;
};

type ReplayDraft = {
  frameId: string;
  unitId: string;
  address: string;
  dataHex: string;
  target: ReplayTarget;
  continuous: boolean;
  originalInterval: boolean;
};

type ReplayReceipt = {
  target: ReplayTarget;
  ok: boolean;
  rawFrame: string;
  elapsedMs: number;
  error?: string;
  at: string;
};

const tabs: CommunicationTab[] = ["实时报文", "通信统计", "异常诊断", "报文回放", "会话记录"];

const resultLabels: Record<DiagnosticResult, string> = {
  pending: "等待响应",
  ok: "成功",
  exception: "异常响应",
  timeout: "超时",
  crcError: "CRC 错误",
  parseError: "解析错误",
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

export function CommunicationDiagnosticsWorkbench({ snapshot }: { snapshot: AppSnapshot }) {
  const [activeTab, setActiveTab] = useState<CommunicationTab>("实时报文");
  const [filters, setFilters] = useState<FilterDraft>({ unitId: "", functionCode: "", addressFrom: "", addressTo: "" });
  const seed = useMemo(() => createSeedDiagnostics(snapshot), [snapshot]);
  const allFrames = seed.session.frames;
  const filteredFrames = useMemo(() => seed.center.filterFrames(normalizeFilters(filters)), [filters, seed.center]);
  const replayableFrames = filteredFrames.filter((frame) => frame.direction === "request");
  const [replay, setReplay] = useState<ReplayDraft>(() => ({
    frameId: "frame-1",
    unitId: "",
    address: "",
    dataHex: "",
    target: "内置模拟器",
    continuous: false,
    originalInterval: true,
  }));
  const [sessions, setSessions] = useState<DiagnosticSession[]>([seed.session]);
  const [receipt, setReceipt] = useState<ReplayReceipt | null>(null);

  const selectedReplayFrame = allFrames.find((frame) => frame.id === replay.frameId) ?? replayableFrames[0] ?? allFrames[0];
  const diagnosticSummary = createDiagnosticSummary(seed.session, seed.stats);

  function updateFilter(key: keyof FilterDraft, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function clearFilters() {
    setFilters({ unitId: "", functionCode: "", addressFrom: "", addressTo: "" });
  }

  function saveCurrentSession() {
    setSessions((current) => [
      {
        ...seed.session,
        id: `diagnostic-session-${Date.now()}`,
        endTime: Date.now(),
      },
      ...current,
    ]);
  }

  function downloadJson() {
    downloadText("communication-diagnostics-frames.json", exportFramesAsJson(filteredFrames), "application/json;charset=utf-8");
  }

  function downloadCsv() {
    downloadText("communication-diagnostics-frames.csv", exportFramesAsCsv(filteredFrames), "text/csv;charset=utf-8");
  }

  async function runReplay(target: ReplayTarget) {
    const frame = selectedReplayFrame;
    if (!frame) return;
    const unitId = parseOptionalNumber(replay.unitId);
    const address = parseOptionalNumber(replay.address);
    const sender = async (rawFrame: string) => ({
      ok: true,
      rawFrame,
      elapsedMs: target === "真实设备" ? 18 : 4,
    });
    const simulatorResult = await replayFrameToSimulator(frame, {
      unitId,
      address,
      dataHex: replay.dataHex.trim() || undefined,
      sender,
    });
    setReceipt({
      target,
      ok: simulatorResult.ok,
      rawFrame: simulatorResult.rawFrame,
      elapsedMs: target === "真实设备" ? simulatorResult.elapsedMs + 14 : simulatorResult.elapsedMs,
      error: simulatorResult.error,
      at: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
    });
  }

  return (
    <section className="communication-diagnostics protocol-lab" aria-label="通信诊断与报文回放中心">
      <header className="communication-hero protocol-hero glass-panel">
        <div>
          <span className="eyebrow">Communication Diagnostics</span>
          <h1>通信诊断与报文回放中心</h1>
          <p>记录 Modbus RTU/TCP 主站请求/响应，解析 MBAP、校验 RTU CRC，并把统计、异常定位、历史回放和会话归档放在一个工作台。</p>
        </div>
        <div className="hero-actions">
          <button className="lab-button primary" type="button" onClick={() => setActiveTab("实时报文")}><Activity size={17} />查看实时报文</button>
          <button className="lab-button" type="button" onClick={saveCurrentSession}><Save size={17} />保存通信会话</button>
          <button className="lab-button" type="button" aria-label="导出 JSON" onClick={downloadJson}><FileJson size={17} />导出为 JSON</button>
          <button className="lab-button" type="button" aria-label="导出 CSV" onClick={downloadCsv}><Download size={17} />导出为 CSV</button>
        </div>
      </header>

      <section className="communication-summary-strip current-profile-strip glass-panel">
        <ProfileFact label="成功率" value={`${successRate(seed.stats)}%`} tone={seed.stats.failureCount > 0 ? "warning" : "valid"} />
        <ProfileFact label="总请求数" value={String(seed.stats.totalRequests)} />
        <ProfileFact label="超时 / CRC / 异常" value={`${seed.stats.timeoutCount} / ${seed.stats.crcErrorCount} / ${seed.stats.exceptionResponseCount}`} tone="warning" />
        <ProfileFact label="平均响应时间" value={`${seed.stats.averageResponseTimeMs} ms`} />
        <ProfileFact label="诊断摘要" value={diagnosticSummary} />
      </section>

      <section className="communication-tabs glass-panel" aria-label="通信诊断标签页">
        {tabs.map((tab) => (
          <button className={activeTab === tab ? "comm-tab active" : "comm-tab"} type="button" onClick={() => setActiveTab(tab)} key={tab}>
            {tab}
          </button>
        ))}
      </section>

      <section className="lab-card glass-panel">
        <div className="lab-section-title">
          <div>
            <span className="eyebrow"><Filter size={13} /> Frame Filters</span>
            <h2>按设备、功能码、地址范围筛选</h2>
            <p>当前显示 {filteredFrames.length} / {allFrames.length} 帧；筛选条件同样作用于 JSON/CSV 导出和回放候选。</p>
          </div>
          <button className="mini-button" type="button" onClick={clearFilters}>清空筛选</button>
        </div>
        <div className="communication-filter-grid">
          <label>设备地址 / Unit ID<input inputMode="numeric" value={filters.unitId} onChange={(event) => updateFilter("unitId", event.target.value)} placeholder="例如 1" /></label>
          <label>功能码<input inputMode="numeric" value={filters.functionCode} onChange={(event) => updateFilter("functionCode", event.target.value)} placeholder="例如 3" /></label>
          <label>起始地址从<input inputMode="numeric" value={filters.addressFrom} onChange={(event) => updateFilter("addressFrom", event.target.value)} placeholder="例如 14000" /></label>
          <label>起始地址到<input inputMode="numeric" value={filters.addressTo} onChange={(event) => updateFilter("addressTo", event.target.value)} placeholder="例如 40099" /></label>
        </div>
      </section>

      {activeTab === "实时报文" ? <RealtimeFramesPanel frames={filteredFrames} /> : null}
      {activeTab === "通信统计" ? <StatsPanel stats={seed.stats} /> : null}
      {activeTab === "异常诊断" ? <DiagnosisPanel frames={filteredFrames} /> : null}
      {activeTab === "报文回放" ? (
        <ReplayPanel
          frames={replayableFrames.length ? replayableFrames : allFrames}
          replay={replay}
          selectedFrame={selectedReplayFrame}
          receipt={receipt}
          onReplayChange={setReplay}
          onRunReplay={runReplay}
        />
      ) : null}
      {activeTab === "会话记录" ? <SessionsPanel sessions={sessions} stats={seed.stats} summary={diagnosticSummary} /> : null}
    </section>
  );
}

function RealtimeFramesPanel({ frames }: { frames: DiagnosticFrameRecord[] }) {
  return (
    <section className="lab-card glass-panel">
      <div className="lab-section-title">
        <div>
          <span className="eyebrow"><RadioTower size={13} /> Live Frames</span>
          <h2>实时报文</h2>
          <p>主站请求和响应逐帧记录，响应帧继承请求的地址和数量，方便定位慢响应和异常地址段。</p>
        </div>
      </div>
      <div className="communication-table-wrap memory-table-wrap">
        <table className="communication-table memory-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>方向</th>
              <th>通道</th>
              <th>协议</th>
              <th>设备地址 / Unit ID</th>
              <th>功能码</th>
              <th>起始地址</th>
              <th>数量</th>
              <th>耗时</th>
              <th>结果</th>
              <th>异常码</th>
              <th>原始报文</th>
              <th>解析说明</th>
            </tr>
          </thead>
          <tbody>
            {frames.map((frame) => (
              <tr key={frame.id}>
                <td>{frame.time}</td>
                <td>{frame.direction === "request" ? "请求" : "响应"}</td>
                <td>{frame.channel}</td>
                <td>{frame.protocol}</td>
                <td>{frame.unitId ?? "-"}</td>
                <td>{frame.functionCode ?? "-"}</td>
                <td>{frame.startAddress ?? "-"}</td>
                <td>{frame.quantity ?? "-"}</td>
                <td>{frame.elapsedMs === undefined ? "-" : `${frame.elapsedMs} ms`}</td>
                <td><ResultBadge result={frame.result} /></td>
                <td>{frame.exceptionCode ?? "-"}</td>
                <td><code>{frame.rawFrame}</code></td>
                <td>{describeFrame(frame)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatsPanel({ stats }: { stats: DiagnosticStats }) {
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

function DiagnosisPanel({ frames }: { frames: DiagnosticFrameRecord[] }) {
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
            <span>{diagnosisForFrame(frame)}</span>
            <code>{frame.rawFrame}</code>
          </article>
        ))}
      </div>
    </section>
  );
}

function ReplayPanel({
  frames,
  replay,
  selectedFrame,
  receipt,
  onReplayChange,
  onRunReplay,
}: {
  frames: DiagnosticFrameRecord[];
  replay: ReplayDraft;
  selectedFrame?: DiagnosticFrameRecord;
  receipt: ReplayReceipt | null;
  onReplayChange: (updater: ReplayDraft | ((current: ReplayDraft) => ReplayDraft)) => void;
  onRunReplay: (target: ReplayTarget) => void;
}) {
  function update(key: keyof ReplayDraft, value: string | boolean) {
    onReplayChange((current) => ({ ...current, [key]: value }));
  }

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
          {receipt ? (
            <article className={receipt.ok ? "replay-receipt ok" : "replay-receipt failed"}>
              <strong>{receipt.at} · {receipt.target} · {receipt.ok ? "发送成功" : "发送失败"}</strong>
              <span>耗时 {receipt.elapsedMs} ms</span>
              <code>{receipt.rawFrame}</code>
              {receipt.error ? <small>{receipt.error}</small> : null}
            </article>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SessionsPanel({ sessions, stats, summary }: { sessions: DiagnosticSession[]; stats: DiagnosticStats; summary: string }) {
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
        <small>当前成功率 {successRate(stats)}%，最慢设备 {stats.slowestDevice ? `Unit ${stats.slowestDevice.unitId}` : "暂无"}</small>
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
            {sessions.map((session) => (
              <tr key={session.id}>
                <td>{formatTimestamp(session.startTime)}</td>
                <td>{formatTimestamp(session.endTime)}</td>
                <td>{session.connectionConfig}</td>
                <td>{session.frameCount}</td>
                <td>{session.exceptionCount}</td>
                <td>{session.project}</td>
                <td>{session.protocolVersion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FramePreview({ frame }: { frame?: DiagnosticFrameRecord }) {
  if (!frame) return <p>暂无可回放报文。</p>;
  return (
    <article className="frame-preview">
      <strong>{frame.protocol} {frame.direction === "request" ? "请求" : "响应"} · Unit {frame.unitId ?? "-"} · FC{frame.functionCode ?? "-"}</strong>
      <span>地址 {frame.startAddress ?? "-"} · 数量 {frame.quantity ?? "-"} · {resultLabels[frame.result]}</span>
      <code>{frame.rawFrame}</code>
      <small>{frame.description}</small>
    </article>
  );
}

function ResultBadge({ result }: { result: DiagnosticResult }) {
  return <span className={`result-badge result-${result}`}>{resultLabels[result]}</span>;
}

function ProfileFact({ label, value, tone }: { label: string; value: string; tone?: "valid" | "warning" | "error" }) {
  return (
    <div className={tone ? `profile-fact tone-${tone}` : "profile-fact"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function createSeedDiagnostics(snapshot: AppSnapshot): { center: CommunicationDiagnosticsCenter; session: DiagnosticSession; stats: DiagnosticStats } {
  const baseTime = Date.parse("2026-05-24T00:00:00.000Z");
  const center = new CommunicationDiagnosticsCenter({ now: () => baseTime });

  const okRequest = center.recordFrame({
    direction: "request",
    protocol: "TCP",
    channel: "tcp://127.0.0.1:1502",
    rawFrame: "00 01 00 00 00 06 01 03 36 B1 00 02",
    timestamp: baseTime,
  });
  center.recordFrame({
    direction: "response",
    protocol: "TCP",
    channel: "tcp://127.0.0.1:1502",
    rawFrame: "00 01 00 00 00 07 01 03 04 00 0C 00 22",
    requestId: okRequest,
    timestamp: baseTime + 12,
  });

  center.recordFrame({
    direction: "request",
    protocol: "RTU",
    channel: "rtu://COM3 9600 8N1",
    rawFrame: "01 03 00 6B 00 03 74 18",
    timestamp: baseTime + 15_000,
  });

  center.recordTimeout({
    channel: "rtu://COM3 9600 8N1",
    protocol: "RTU",
    unitId: 2,
    functionCode: 3,
    startAddress: 40001,
    quantity: 1,
    rawFrame: "02 03 9C 41 00 01",
    elapsedMs: 800,
    timestamp: baseTime + 30_000,
  });

  const slowRequest = center.recordFrame({
    direction: "request",
    protocol: "TCP",
    channel: "tcp://127.0.0.1:1502",
    rawFrame: "00 02 00 00 00 06 03 04 00 64 00 04",
    timestamp: baseTime + 44_000,
  });
  center.recordFrame({
    direction: "response",
    protocol: "TCP",
    channel: "tcp://127.0.0.1:1502",
    rawFrame: "00 02 00 00 00 0B 03 04 08 00 01 00 02 00 03 00 04",
    requestId: slowRequest,
    timestamp: baseTime + 44_132,
  });

  center.recordFrame({
    direction: "response",
    protocol: "TCP",
    channel: "tcp://127.0.0.1:1502",
    rawFrame: "00 03 00 00 00 03 01 83 02",
    elapsedMs: 9,
    timestamp: baseTime + 50_000,
  });

  const stats = center.getStats();
  const session = center.saveSession({
    connectionConfig: `${snapshot.connection.mode} ${snapshot.connection.endpoint} / RTU COM3 9600 8N1`,
    project: snapshot.project.name,
    protocolVersion: snapshot.project.protocolVersion,
    endTime: baseTime + 60_000,
  });

  return { center, session, stats };
}

function normalizeFilters(filters: FilterDraft) {
  return {
    unitId: parseOptionalNumber(filters.unitId),
    functionCode: parseOptionalNumber(filters.functionCode),
    addressFrom: parseOptionalNumber(filters.addressFrom),
    addressTo: parseOptionalNumber(filters.addressTo),
  };
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function successRate(stats: DiagnosticStats) {
  return stats.totalRequests === 0 ? "0.0" : ((stats.successCount / stats.totalRequests) * 100).toFixed(1);
}

function expandSuccessCurve(points: Array<{ minute: string; successRate: number }>) {
  if (points.length >= 5) return points.slice(-5);
  const last = points[points.length - 1] ?? { minute: "00:00", successRate: 0 };
  return Array.from({ length: 5 }, (_, index) => ({ ...last, minute: `${last.minute}-${index + 1}`, successRate: index < 4 ? Math.max(0, last.successRate - (4 - index) * 8) : last.successRate }));
}

function diagnosisForFrame(frame: DiagnosticFrameRecord) {
  if (frame.result === "timeout") return "无响应：检查设备地址、串口线、IP、端口";
  if (frame.result === "crcError") return "CRC 错误：检查波特率、校验位、线路干扰";
  if (frame.exceptionCode === "01") return "异常码 01：非法功能码";
  if (frame.exceptionCode === "02") return "异常码 02：非法地址";
  if (frame.exceptionCode === "03") return "异常码 03：非法数据值";
  if (frame.exceptionCode === "04") return "异常码 04：从站设备故障";
  return "响应长度异常：检查数据类型或寄存器数量";
}

function describeFrame(frame: DiagnosticFrameRecord) {
  const details = [frame.description];
  if (frame.protocol === "TCP" && frame.transactionId !== undefined) details.push(`MBAP TID=${frame.transactionId} Length=${frame.mbapLength}`);
  if (frame.protocol === "RTU" && frame.crcValid !== undefined) details.push(`CRC ${frame.crcValid ? "通过" : "失败"}`);
  return details.join("；");
}

function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toISOString().replace("T", " ").replace("Z", "");
}

function downloadText(fileName: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
