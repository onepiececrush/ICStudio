import { useMemo, useState } from "react";
import {
  BarChart3,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  LineChart,
  RefreshCcw,
} from "lucide-react";
import type { AppSnapshot } from "../types";
import {
  LocalHistoryRepository,
  exportRowsAsCsv,
  exportRowsAsExcelXml,
  generateDailyReportHtml,
  generateHomeSelfTestReportHtml,
  generateTestReportHtml,
  persistSnapshotToHistory,
  representativeSubsystemPoints,
  requiredHistoryTables,
  type StoredTestReport,
  type TrendAggregate,
  type TrendQueryRow,
} from "../history/historyCenter";
import { persistSnapshotToNativeHistory, type NativeHistoryStore } from "../history/nativeHistoryStorage";

type HistoryTab = "趋势查询" | "告警历史" | "通信历史" | "测试报告" | "报表模板";

type HistoryReportCenterProps = {
  snapshot: AppSnapshot;
  repository?: LocalHistoryRepository;
  nativeHistoryStore?: NativeHistoryStore | null;
  nativeDbPath?: string;
};

const tabs: HistoryTab[] = ["趋势查询", "告警历史", "通信历史", "测试报告", "报表模板"];
const aggregates: Array<{ value: TrendAggregate; label: string }> = [
  { value: "raw", label: "原始值" },
  { value: "avg", label: "平均" },
  { value: "max", label: "最大" },
  { value: "min", label: "最小" },
];

export function HistoryReportCenter({ snapshot, repository, nativeHistoryStore, nativeDbPath }: HistoryReportCenterProps) {
  const fallbackRepository = useMemo(() => createSeededRepository(snapshot), [snapshot]);
  const historyRepository = repository ?? fallbackRepository;
  const [activeTab, setActiveTab] = useState<HistoryTab>("趋势查询");
  const [deviceId, setDeviceId] = useState("dashboard");
  const [pointId, setPointId] = useState(snapshot.metrics[0]?.key ?? "health");
  const [samplingPeriodMs, setSamplingPeriodMs] = useState(60_000);
  const [aggregate, setAggregate] = useState<TrendAggregate>("raw");
  const [startDateTime, setStartDateTime] = useState(() => toDateTimeInput(Date.now() - 24 * 60 * 60 * 1000));
  const [endDateTime, setEndDateTime] = useState(() => toDateTimeInput(Date.now() + 24 * 60 * 60 * 1000));
  const [revision, setRevision] = useState(0);
  const [exportPreview, setExportPreview] = useState("");
  const [nativeWriteState, setNativeWriteState] = useState(nativeDbPath ? `SQLite：${nativeDbPath}` : "SQLite：浏览器内存模式");

  const timeRange = useMemo(() => normalizeTimeRange(startDateTime, endDateTime), [startDateTime, endDateTime, revision]);
  const pointOptions = createPointOptions(snapshot, deviceId);
  const normalizedPointId = pointOptions.some((option) => option.value === pointId) ? pointId : pointOptions[0]?.value ?? pointId;
  const trendRows = historyRepository.queryTrend({
    deviceId,
    pointId: normalizedPointId,
    startTime: timeRange.startTime,
    endTime: timeRange.endTime,
    samplingPeriodMs,
    aggregate,
  });
  const alarms = historyRepository.queryAlarmHistory(timeRange);
  const communications = historyRepository.queryCommunicationHistory(timeRange);
  const testReports = historyRepository.queryTestReports(timeRange);
  const templates = historyRepository.getReportTemplates();

  async function handlePersistSnapshot() {
    const testReports = [createHomeSelfTestReport(snapshot)];
    const input = {
      timestamp: Date.now(),
      operator: snapshot.project.operator,
      testReports,
    };
    persistSnapshotToHistory(historyRepository, snapshot, {
      timestamp: input.timestamp,
      operator: input.operator,
      testReports,
    });
    const nativeSummary = await persistSnapshotToNativeHistory(nativeHistoryStore ?? null, snapshot, input);
    setNativeWriteState(nativeSummary ? `SQLite：${nativeDbPath} · 本次写入 ${nativeSummary.pointSamplesWritten} 点位 / ${nativeSummary.alarmEventsWritten} 告警` : `SQLite：${nativeDbPath || "浏览器内存模式"}`);
    setRevision((current) => current + 1);
  }

  function handleExportCsv() {
    setExportPreview(exportRowsAsCsv(trendRows));
  }

  function handleExportExcel() {
    setExportPreview(exportRowsAsExcelXml("趋势查询", trendRows));
  }

  function handleDailyReport() {
    const model = historyRepository.createDailyReportModel({
      date: new Date().toISOString().slice(0, 10),
      projectName: snapshot.project.name,
      protocolVersion: snapshot.project.protocolVersion,
    });
    setExportPreview(generateDailyReportHtml(model));
  }

  function handleTestReport() {
    setExportPreview(generateTestReportHtml(testReports[0] ?? createAutomationReport(snapshot)));
  }

  function handleHomeSelfTestReport() {
    setExportPreview(generateHomeSelfTestReportHtml(testReports.find((report) => report.reportType === "home-self-test") ?? createHomeSelfTestReport(snapshot)));
  }

  return (
    <section className="history-center module-panel">
      <header className="history-hero">
        <div>
          <span className="eyebrow">LOCAL SQLITE / REPORTING</span>
          <h1>历史数据与报表中心</h1>
          <p>将首页、实时监控、告警、通信统计和测试结果沉淀到本地数据库，支持趋势查询、时间范围筛选、CSV/Excel 导出、日报与测试报告生成。</p>
          <small className="history-db-path">{nativeWriteState}</small>
        </div>
        <div className="history-actions">
          <button className="lab-button primary" type="button" onClick={handlePersistSnapshot}>
            <Database size={17} />写入当前快照
          </button>
          <button className="lab-button" type="button" onClick={handleExportCsv}>
            <Download size={17} />导出 CSV
          </button>
          <button className="lab-button" type="button" onClick={handleExportExcel}>
            <FileSpreadsheet size={17} />导出 Excel
          </button>
          <button className="lab-button" type="button" onClick={handleDailyReport}>
            <FileText size={17} />生成日报
          </button>
        </div>
      </header>

      <div className="history-table-strip glass-panel">
        {requiredHistoryTables.map((table) => (
          <span key={table}>{table}</span>
        ))}
      </div>

      <nav className="history-tabs" aria-label="历史数据与报表 Tab">
        {tabs.map((tab) => (
          <button className={`history-tab ${activeTab === tab ? "active" : ""}`} type="button" onClick={() => setActiveTab(tab)} key={tab}>
            {tab}
          </button>
        ))}
      </nav>

      {activeTab === "趋势查询" ? (
        <TrendQueryTab
          snapshot={snapshot}
          deviceId={deviceId}
          pointId={normalizedPointId}
          pointOptions={pointOptions}
          startDateTime={startDateTime}
          endDateTime={endDateTime}
          samplingPeriodMs={samplingPeriodMs}
          aggregate={aggregate}
          trendRows={trendRows}
          onDeviceChange={(nextDeviceId) => {
            setDeviceId(nextDeviceId);
            setPointId(createPointOptions(snapshot, nextDeviceId)[0]?.value ?? "");
          }}
          onPointChange={setPointId}
          onStartTimeChange={setStartDateTime}
          onEndTimeChange={setEndDateTime}
          onSamplingChange={setSamplingPeriodMs}
          onAggregateChange={setAggregate}
        />
      ) : null}

      {activeTab === "告警历史" ? <AlarmHistoryTab alarms={alarms} /> : null}
      {activeTab === "通信历史" ? <CommunicationHistoryTab communications={communications} /> : null}
      {activeTab === "测试报告" ? (
        <TestReportTab reports={testReports} onGenerateTestReport={handleTestReport} onGenerateHomeSelfTestReport={handleHomeSelfTestReport} />
      ) : null}
      {activeTab === "报表模板" ? <TemplateTab templates={templates} /> : null}

      {exportPreview ? (
        <section className="history-export-preview glass-panel" aria-label="导出与报告预览">
          <div className="panel-title">
            <h2>导出 / 报告预览</h2>
            <button className="mini-button" type="button" onClick={() => setExportPreview("")}>
              <RefreshCcw size={14} />清空
            </button>
          </div>
          <pre>{exportPreview}</pre>
        </section>
      ) : null}
    </section>
  );
}

function TrendQueryTab({
  snapshot,
  deviceId,
  pointId,
  pointOptions,
  startDateTime,
  endDateTime,
  samplingPeriodMs,
  aggregate,
  trendRows,
  onDeviceChange,
  onPointChange,
  onStartTimeChange,
  onEndTimeChange,
  onSamplingChange,
  onAggregateChange,
}: {
  snapshot: AppSnapshot;
  deviceId: string;
  pointId: string;
  pointOptions: Array<{ value: string; label: string }>;
  startDateTime: string;
  endDateTime: string;
  samplingPeriodMs: number;
  aggregate: TrendAggregate;
  trendRows: TrendQueryRow[];
  onDeviceChange: (deviceId: string) => void;
  onPointChange: (pointId: string) => void;
  onStartTimeChange: (dateTime: string) => void;
  onEndTimeChange: (dateTime: string) => void;
  onSamplingChange: (samplingPeriodMs: number) => void;
  onAggregateChange: (aggregate: TrendAggregate) => void;
}) {
  const maxValue = Math.max(...trendRows.map((row) => Math.abs(row.value)), 1);
  return (
    <div className="history-grid">
      <section className="history-filter-card glass-panel">
        <div className="panel-title">
          <h2>趋势查询</h2>
          <span className="panel-status status-select">时间范围：自定义</span>
        </div>
        <div className="history-filter-grid">
          <label>
            <span>设备</span>
            <select value={deviceId} onChange={(event) => onDeviceChange(event.target.value)}>
              {createDeviceOptions(snapshot).map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            <span>点位</span>
            <select value={pointId} onChange={(event) => onPointChange(event.target.value)}>
              {pointOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            <span>开始时间</span>
            <input type="datetime-local" value={startDateTime} onChange={(event) => onStartTimeChange(event.target.value)} />
          </label>
          <label>
            <span>结束时间</span>
            <input type="datetime-local" value={endDateTime} onChange={(event) => onEndTimeChange(event.target.value)} />
          </label>
          <label>
            <span>采样周期</span>
            <select value={samplingPeriodMs} onChange={(event) => onSamplingChange(Number(event.target.value))}>
              <option value={0}>原始采样</option>
              <option value={60_000}>1 分钟</option>
              <option value={300_000}>5 分钟</option>
              <option value={900_000}>15 分钟</option>
            </select>
          </label>
          <label>
            <span>聚合方式</span>
            <select value={aggregate} onChange={(event) => onAggregateChange(event.target.value as TrendAggregate)}>
              {aggregates.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="history-chart-card glass-panel">
        <div className="panel-title">
          <h2><LineChart size={18} />趋势曲线</h2>
          <span className="panel-status status-success">{trendRows.length} 点</span>
        </div>
        <div className="trend-chart" aria-label="趋势曲线">
          {trendRows.map((row, index) => (
            <i
              key={`${row.timestamp}-${index}`}
              style={{ left: `${trendRows.length <= 1 ? 50 : (index / (trendRows.length - 1)) * 100}%`, bottom: `${Math.max(8, (Math.abs(row.value) / maxValue) * 82)}%` }}
              title={`${row.time} ${row.value}${row.unit}`}
            />
          ))}
        </div>
      </section>

      <section className="history-chart-card glass-panel">
        <div className="panel-title">
          <h2><BarChart3 size={18} />柱状图</h2>
          <span className="panel-status status-neutral">{aggregates.find((item) => item.value === aggregate)?.label}</span>
        </div>
        <div className="bar-chart" aria-label="柱状图">
          {trendRows.map((row, index) => (
            <span key={`${row.timestamp}-${index}`} style={{ height: `${Math.max(8, (Math.abs(row.value) / maxValue) * 100)}%` }}>
              <b>{formatCompact(row.value)}</b>
            </span>
          ))}
        </div>
      </section>

      <section className="history-table-card glass-panel">
        <div className="panel-title">
          <h2>表格</h2>
          <span className="panel-status status-link">CSV / Excel 数据源</span>
        </div>
        <DataTable
          headers={["时间", "设备", "点位", "数值", "单位", "页面", "质量"]}
          rows={trendRows.map((row) => [row.time, row.deviceId, row.pointName, formatCompact(row.value), row.unit, row.page, row.quality])}
        />
      </section>
    </div>
  );
}

function AlarmHistoryTab({ alarms }: { alarms: ReturnType<LocalHistoryRepository["queryAlarmHistory"]> }) {
  return (
    <section className="history-table-card glass-panel">
      <div className="panel-title">
        <h2>告警历史</h2>
        <span className="panel-status status-danger">{alarms.length} 条</span>
      </div>
      <DataTable
        headers={["时间", "设备", "等级", "状态", "标题", "来源"]}
        rows={alarms.map((alarm) => [formatTime(alarm.timestamp), alarm.deviceId, alarm.severity, alarm.status, alarm.title, alarm.source])}
      />
    </section>
  );
}

function CommunicationHistoryTab({ communications }: { communications: ReturnType<LocalHistoryRepository["queryCommunicationHistory"]> }) {
  return (
    <section className="history-table-card glass-panel">
      <div className="panel-title">
        <h2>通信历史</h2>
        <span className="panel-status status-success">通信统计</span>
      </div>
      <DataTable
        headers={["时间", "通道", "协议", "请求", "成功", "失败", "超时", "CRC", "平均耗时", "最大耗时", "成功率"]}
        rows={communications.map((row) => [formatTime(row.timestamp), row.channel, row.protocol, row.requestCount, row.successCount, row.failureCount, row.timeoutCount, row.crcErrorCount, row.averageLatencyMs, row.maxLatencyMs, `${row.successRate}%`])}
      />
    </section>
  );
}

function TestReportTab({
  reports,
  onGenerateTestReport,
  onGenerateHomeSelfTestReport,
}: {
  reports: StoredTestReport[];
  onGenerateTestReport: () => void;
  onGenerateHomeSelfTestReport: () => void;
}) {
  return (
    <section className="history-table-card glass-panel">
      <div className="panel-title">
        <h2>测试报告</h2>
        <span className="panel-status status-link">自动化测试结果 / 首页自测结果</span>
      </div>
      <div className="history-inline-actions">
        <button className="lab-button" type="button" onClick={onGenerateTestReport}>生成测试报告</button>
        <button className="lab-button" type="button" onClick={onGenerateHomeSelfTestReport}>首页自测报告</button>
      </div>
      <DataTable
        headers={["时间", "类型", "标题", "通过", "失败", "耗时", "结果", "操作员"]}
        rows={reports.map((report) => [formatTime(report.timestamp), report.reportType, report.title, report.passedCases, report.failedCases, `${report.durationMs}ms`, report.result, report.operator])}
      />
    </section>
  );
}

function TemplateTab({ templates }: { templates: ReturnType<LocalHistoryRepository["getReportTemplates"]> }) {
  return (
    <section className="template-grid">
      {templates.map((template) => (
        <article className="template-card glass-panel" key={template.templateId}>
          <span>{template.reportType}</span>
          <strong>{template.name}</strong>
          <p>{template.description}</p>
          <small>{template.sections.join(" / ")}</small>
        </article>
      ))}
    </section>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: Array<Array<string | number>> }) {
  return (
    <div className="history-table-wrap">
      <table>
        <thead>
          <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, index) => (
            <tr key={`${row.join("-")}-${index}`}>
              {row.map((cell, cellIndex) => <td key={`${cellIndex}-${String(cell)}`}>{cell}</td>)}
            </tr>
          )) : (
            <tr><td colSpan={headers.length}>暂无历史数据，请点击“写入当前快照”。</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function createSeededRepository(snapshot: AppSnapshot) {
  const repository = new LocalHistoryRepository();
  repository.initialize();
  persistSnapshotToHistory(repository, snapshot, {
    timestamp: Date.now(),
    operator: snapshot.project.operator,
    testReports: [createAutomationReport(snapshot), createHomeSelfTestReport(snapshot)],
  });
  return repository;
}

function createDeviceOptions(snapshot: AppSnapshot) {
  const options = [
    { value: "dashboard", label: "首页核心 KPI" },
    { value: "dashboard-trend", label: "首页趋势曲线" },
    ...snapshot.devices.map((device) => ({ value: device.name, label: `${device.name} / ${device.deviceType}` })),
    ...(snapshot.loopbackDashboard ? [{ value: "home-loopback", label: "首页自测模拟器" }] : []),
  ];
  for (const point of representativeSubsystemPoints) {
    if (!options.some((option) => option.value === point.deviceId)) {
      options.push({ value: point.deviceId, label: `${point.deviceId} / ${point.deviceType}` });
    }
  }
  return options;
}

function createPointOptions(snapshot: AppSnapshot, deviceId: string) {
  if (deviceId === "dashboard") {
    return snapshot.metrics.map((metric) => ({ value: metric.key, label: metric.label }));
  }
  if (deviceId === "dashboard-trend") {
    return [
      { value: "power", label: "功率趋势" },
      { value: "soc", label: "SOC 趋势" },
      { value: "quality", label: "通信质量趋势" },
    ];
  }
  if (deviceId === "home-loopback") {
    return snapshot.loopbackDashboard?.values.map((value) => ({ value: value.address, label: value.name })) ?? [];
  }
  return uniqueOptions([
    ...(snapshot.devices.some((device) => device.name === deviceId) ? [{ value: "quality", label: "通信质量" }] : []),
    ...representativeSubsystemPoints
      .filter((point) => point.deviceId === deviceId)
      .map((point) => ({ value: point.pointId, label: point.pointName })),
  ]);
}

function createAutomationReport(snapshot: AppSnapshot): StoredTestReport {
  return {
    reportId: `automation-${snapshot.project.name}`,
    timestamp: Date.now(),
    projectName: snapshot.project.name,
    protocolVersion: snapshot.project.protocolVersion,
    reportType: "automation-test",
    title: "自动化测试报告",
    summary: "自动化测试结果已归档，可用于测试报告生成。",
    totalCases: 5,
    passedCases: 5,
    failedCases: 0,
    durationMs: 42_000,
    operator: snapshot.project.operator,
    result: "passed",
    details: snapshot.activities.slice(0, 3).map((activity) => ({
      name: activity.title,
      expected: "执行成功",
      actual: activity.detail,
      result: activity.tone === "red" ? "failed" : "passed",
    })),
  };
}

function createHomeSelfTestReport(snapshot: AppSnapshot): StoredTestReport {
  const rows = snapshot.loopbackDashboard?.verificationRows ?? [];
  const passedCases = rows.filter((row) => row.result === "通过").length || 3;
  const totalCases = rows.length || 3;
  return {
    reportId: `home-self-test-${snapshot.project.name}`,
    timestamp: Date.now(),
    projectName: snapshot.project.name,
    protocolVersion: snapshot.project.protocolVersion,
    reportType: "home-self-test",
    title: "首页自测报告",
    summary: `首页自测结果 ${passedCases}/${totalCases} 通过。`,
    totalCases,
    passedCases,
    failedCases: Math.max(0, totalCases - passedCases),
    durationMs: 18_000,
    operator: snapshot.project.operator,
    result: passedCases === totalCases ? "passed" : "failed",
    details: rows.length ? rows.map((row) => ({
      name: row.component,
      expected: row.expectedValue,
      actual: row.displayValue || row.parsedValue,
      result: row.result === "通过" ? "passed" : "failed",
      message: row.error,
    })) : [
      { name: "通信链路", expected: "可连接", actual: snapshot.connection.status, result: snapshot.connection.status.includes("异常") ? "failed" : "passed" },
      { name: "首页核心 KPI", expected: "可读取", actual: `${snapshot.metrics.length} 项`, result: "passed" },
      { name: "实时监控", expected: "可归档", actual: `${snapshot.devices.length} 台设备`, result: "passed" },
    ],
  };
}

function formatCompact(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toISOString().replace("T", " ").replace("Z", "");
}

function normalizeTimeRange(startDateTime: string, endDateTime: string) {
  const startTime = parseDateTimeInput(startDateTime, 0);
  const endTime = parseDateTimeInput(endDateTime, Date.now() + 24 * 60 * 60 * 1000);
  return startTime <= endTime ? { startTime, endTime } : { startTime: endTime, endTime: startTime };
}

function parseDateTimeInput(value: string, fallback: number) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : fallback;
}

function toDateTimeInput(timestamp: number) {
  const local = new Date(timestamp - new Date(timestamp).getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function uniqueOptions(options: Array<{ value: string; label: string }>) {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (seen.has(option.value)) return false;
    seen.add(option.value);
    return true;
  });
}
