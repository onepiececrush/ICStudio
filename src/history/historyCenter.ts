import { pointBindingRegistry, type BoundPointTrace } from "../pointBinding/registry";
import type { AppSnapshot, ActivityItem, DeviceStatus, MetricCard, TrendPoint } from "../types";

export const requiredHistoryTables = [
  "point_history",
  "alarm_history",
  "communication_history",
  "operation_log",
  "test_report",
  "report_template",
] as const;

export type HistoryTableName = (typeof requiredHistoryTables)[number];
export type TrendAggregate = "raw" | "avg" | "max" | "min";

export type PointHistorySample = {
  timestamp: number;
  deviceId: string;
  deviceType: string;
  pointId: string;
  pointName: string;
  page: string;
  value: number;
  unit: string;
  quality: string;
  source: string;
};

export type TrendQuery = {
  deviceId: string;
  pointId: string;
  startTime: number;
  endTime: number;
  samplingPeriodMs?: number;
  aggregate: TrendAggregate;
};

export type TrendQueryRow = PointHistorySample & {
  time: string;
  sampleCount: number;
  aggregate: TrendAggregate;
};

export type AlarmSeverity = "critical" | "major" | "minor" | "info";
export type AlarmStatus = "active" | "acked" | "recovered";

export type AlarmHistoryEvent = {
  timestamp: number;
  alarmId: string;
  deviceId: string;
  severity: AlarmSeverity;
  status: AlarmStatus;
  title: string;
  message: string;
  source: string;
};

export type AlarmQuery = {
  startTime?: number;
  endTime?: number;
  deviceId?: string;
  severity?: AlarmSeverity;
  status?: AlarmStatus;
};

export type CommunicationHistoryRecord = {
  timestamp: number;
  channel: string;
  protocol: string;
  requestCount: number;
  successCount: number;
  failureCount: number;
  timeoutCount: number;
  crcErrorCount: number;
  averageLatencyMs: number;
  maxLatencyMs: number;
  successRate: number;
};

export type OperationLogRecord = {
  timestamp: number;
  operator: string;
  action: string;
  target: string;
  result: "success" | "failed" | "info";
  detail: string;
};

export type StoredTestReportDetail = {
  name: string;
  expected: string;
  actual: string;
  result: "passed" | "failed";
  durationMs?: number;
  message?: string;
};

export type StoredTestReport = {
  reportId: string;
  timestamp: number;
  projectName: string;
  protocolVersion: string;
  reportType: "automation-test" | "home-self-test" | "device-debug" | "alarm-statistics" | "communication-quality";
  title: string;
  summary: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  durationMs: number;
  operator: string;
  result: "passed" | "failed";
  details: StoredTestReportDetail[];
};

export type ReportTemplate = {
  templateId: string;
  name: string;
  reportType: StoredTestReport["reportType"];
  description: string;
  sections: string[];
};

export type DailyReportModel = {
  date: string;
  projectName: string;
  protocolVersion: string;
  pointCount: number;
  alarmCount: number;
  criticalAlarmCount: number;
  communicationQuality: number;
  testReportCount: number;
  alarms: AlarmHistoryEvent[];
  communication: CommunicationHistoryRecord[];
  tests: StoredTestReport[];
};

export type SnapshotPersistSummary = {
  pointSamplesWritten: number;
  alarmEventsWritten: number;
  communicationRowsWritten: number;
  operationLogsWritten: number;
  testReportsWritten: number;
};

export type HistoryPersistBatch = {
  pointSamples: PointHistorySample[];
  alarmEvents: AlarmHistoryEvent[];
  communicationRecords: CommunicationHistoryRecord[];
  operationLogs: OperationLogRecord[];
  testReports: StoredTestReport[];
};

type RepositoryOptions = {
  now?: () => number;
};

export const sqliteCreateStatements: Record<HistoryTableName, string> = {
  point_history: `CREATE TABLE IF NOT EXISTS point_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  device_type TEXT NOT NULL,
  point_id TEXT NOT NULL,
  point_name TEXT NOT NULL,
  page TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  quality TEXT NOT NULL,
  source TEXT NOT NULL
);`,
  alarm_history: `CREATE TABLE IF NOT EXISTS alarm_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  alarm_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  source TEXT NOT NULL
);`,
  communication_history: `CREATE TABLE IF NOT EXISTS communication_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  channel TEXT NOT NULL,
  protocol TEXT NOT NULL,
  request_count INTEGER NOT NULL,
  success_count INTEGER NOT NULL,
  failure_count INTEGER NOT NULL,
  timeout_count INTEGER NOT NULL,
  crc_error_count INTEGER NOT NULL,
  average_latency_ms REAL NOT NULL,
  max_latency_ms REAL NOT NULL,
  success_rate REAL NOT NULL
);`,
  operation_log: `CREATE TABLE IF NOT EXISTS operation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  operator TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  result TEXT NOT NULL,
  detail TEXT NOT NULL
);`,
  test_report: `CREATE TABLE IF NOT EXISTS test_report (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id TEXT NOT NULL UNIQUE,
  timestamp INTEGER NOT NULL,
  project_name TEXT NOT NULL,
  protocol_version TEXT NOT NULL,
  report_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  total_cases INTEGER NOT NULL,
  passed_cases INTEGER NOT NULL,
  failed_cases INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  operator TEXT NOT NULL,
  result TEXT NOT NULL,
  details_json TEXT NOT NULL
);`,
  report_template: `CREATE TABLE IF NOT EXISTS report_template (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  report_type TEXT NOT NULL,
  description TEXT NOT NULL,
  sections_json TEXT NOT NULL
);`,
};

export class LocalHistoryRepository {
  private readonly now: () => number;
  private initialized = false;
  private readonly points: PointHistorySample[] = [];
  private readonly alarms: AlarmHistoryEvent[] = [];
  private readonly communication: CommunicationHistoryRecord[] = [];
  private readonly operations: OperationLogRecord[] = [];
  private readonly tests: StoredTestReport[] = [];
  private templates: ReportTemplate[] = [];

  constructor(options: RepositoryOptions = {}) {
    this.now = options.now ?? Date.now;
  }

  initialize(): void {
    if (this.initialized) return;
    this.templates = createDefaultReportTemplates();
    this.initialized = true;
  }

  getCreateTableSql(): string[] {
    return requiredHistoryTables.map((table) => sqliteCreateStatements[table]);
  }

  getReportTemplates(): ReportTemplate[] {
    this.ensureInitialized();
    return this.templates.map(clone);
  }

  writePointSamples(samples: PointHistorySample[]): void {
    this.ensureInitialized();
    this.points.push(...samples.map(normalizePointSample));
    this.points.sort(compareTimestamp);
  }

  queryTrend(query: TrendQuery): TrendQueryRow[] {
    this.ensureInitialized();
    const rows = this.points.filter((sample) =>
      sample.deviceId === query.deviceId &&
      sample.pointId === query.pointId &&
      sample.timestamp >= query.startTime &&
      sample.timestamp <= query.endTime,
    );

    if (query.aggregate === "raw" || !query.samplingPeriodMs || query.samplingPeriodMs <= 0) {
      return rows.map((sample) => ({
        ...sample,
        time: formatDateTime(sample.timestamp),
        sampleCount: 1,
        aggregate: "raw",
      }));
    }

    const aggregate: Exclude<TrendAggregate, "raw"> = query.aggregate;
    const buckets = new Map<number, PointHistorySample[]>();
    for (const sample of rows) {
      const bucketStart = query.startTime + Math.floor((sample.timestamp - query.startTime) / query.samplingPeriodMs) * query.samplingPeriodMs;
      const bucket = buckets.get(bucketStart) ?? [];
      bucket.push(sample);
      buckets.set(bucketStart, bucket);
    }

    return [...buckets.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([timestamp, bucket]) => {
        const first = bucket[0];
        const values = bucket.map((item) => item.value);
        return {
          ...first,
          timestamp,
          value: aggregateValues(values, aggregate),
          time: formatDateTime(timestamp),
          sampleCount: bucket.length,
          aggregate,
        };
      });
  }

  writeAlarmEvents(events: AlarmHistoryEvent[]): void {
    this.ensureInitialized();
    this.alarms.push(...events.map(clone));
    this.alarms.sort(compareTimestamp);
  }

  queryAlarmHistory(query: AlarmQuery = {}): AlarmHistoryEvent[] {
    this.ensureInitialized();
    return this.alarms.filter((alarm) =>
      inOptionalRange(alarm.timestamp, query.startTime, query.endTime) &&
      (query.deviceId === undefined || alarm.deviceId === query.deviceId) &&
      (query.severity === undefined || alarm.severity === query.severity) &&
      (query.status === undefined || alarm.status === query.status),
    ).map(clone);
  }

  writeCommunicationHistory(records: CommunicationHistoryRecord[]): void {
    this.ensureInitialized();
    this.communication.push(...records.map(clone));
    this.communication.sort(compareTimestamp);
  }

  queryCommunicationHistory(query: { startTime?: number; endTime?: number; channel?: string } = {}): CommunicationHistoryRecord[] {
    this.ensureInitialized();
    return this.communication.filter((record) =>
      inOptionalRange(record.timestamp, query.startTime, query.endTime) &&
      (query.channel === undefined || record.channel === query.channel),
    ).map(clone);
  }

  writeOperationLogs(records: OperationLogRecord[]): void {
    this.ensureInitialized();
    this.operations.push(...records.map(clone));
    this.operations.sort(compareTimestamp);
  }

  queryOperationLogs(query: { startTime?: number; endTime?: number; operator?: string } = {}): OperationLogRecord[] {
    this.ensureInitialized();
    return this.operations.filter((record) =>
      inOptionalRange(record.timestamp, query.startTime, query.endTime) &&
      (query.operator === undefined || record.operator === query.operator),
    ).map(clone);
  }

  writeTestReports(reports: StoredTestReport[]): void {
    this.ensureInitialized();
    for (const report of reports) {
      const index = this.tests.findIndex((item) => item.reportId === report.reportId);
      if (index >= 0) this.tests[index] = clone(report);
      else this.tests.push(clone(report));
    }
    this.tests.sort(compareTimestamp);
  }

  queryTestReports(query: { startTime?: number; endTime?: number; reportType?: StoredTestReport["reportType"]; result?: StoredTestReport["result"] } = {}): StoredTestReport[] {
    this.ensureInitialized();
    return this.tests.filter((report) =>
      inOptionalRange(report.timestamp, query.startTime, query.endTime) &&
      (query.reportType === undefined || report.reportType === query.reportType) &&
      (query.result === undefined || report.result === query.result),
    ).map(clone);
  }

  createDailyReportModel(input: { date: string; projectName: string; protocolVersion: string }): DailyReportModel {
    this.ensureInitialized();
    const startTime = Date.parse(`${input.date}T00:00:00.000Z`);
    const endTime = startTime + 24 * 60 * 60 * 1000 - 1;
    const alarms = this.queryAlarmHistory({ startTime, endTime });
    const communication = this.queryCommunicationHistory({ startTime, endTime });
    const tests = this.queryTestReports({ startTime, endTime });
    const pointCount = this.points.filter((sample) => sample.timestamp >= startTime && sample.timestamp <= endTime).length;
    const successRates = communication.map((record) => record.successRate);

    return {
      date: input.date,
      projectName: input.projectName,
      protocolVersion: input.protocolVersion,
      pointCount,
      alarmCount: alarms.length,
      criticalAlarmCount: alarms.filter((alarm) => alarm.severity === "critical").length,
      communicationQuality: successRates.length ? round2(successRates.reduce((sum, value) => sum + value, 0) / successRates.length) : 100,
      testReportCount: tests.length,
      alarms,
      communication,
      tests,
    };
  }

  private ensureInitialized(): void {
    if (!this.initialized) this.initialize();
    void this.now;
  }
}

export function buildHistoryPersistBatch(
  snapshot: AppSnapshot,
  input: { timestamp: number; operator: string; testReports?: StoredTestReport[] },
): HistoryPersistBatch {
  const pointSamples = [
    ...snapshot.metrics.map((metric) => metricToPointSample(metric, input.timestamp)),
    ...snapshot.devices.map((device) => deviceToPointSample(device, input.timestamp)),
    ...registryRepresentativePointSamples(input.timestamp),
    ...trendPointsToSamples(snapshot.trends, input.timestamp),
    ...loopbackToPointSamples(snapshot, input.timestamp),
    ...subsystemToPointSamples(input.timestamp),
  ];
  const alarmEvents = activitiesToAlarmEvents(snapshot.activities, input.timestamp);
  if (snapshot.loopbackDashboard && snapshot.loopbackDashboard.severeAlarmCount + snapshot.loopbackDashboard.generalAlarmCount + snapshot.loopbackDashboard.communicationAlarmCount > 0) {
    alarmEvents.push({
      timestamp: input.timestamp,
      alarmId: "home-loopback-current-alarms",
      deviceId: "dashboard",
      severity: snapshot.loopbackDashboard.severeAlarmCount > 0 ? "critical" : "major",
      status: "active",
      title: "首页自测当前告警",
      message: `严重 ${snapshot.loopbackDashboard.severeAlarmCount} / 一般 ${snapshot.loopbackDashboard.generalAlarmCount} / 通信 ${snapshot.loopbackDashboard.communicationAlarmCount}`,
      source: "首页",
    });
  }
  const communicationRecords: CommunicationHistoryRecord[] = [{
    timestamp: input.timestamp,
    channel: snapshot.connection.endpoint,
    protocol: snapshot.connection.mode,
    requestCount: 100,
    successCount: Math.round(snapshot.connection.successRate),
    failureCount: Math.max(0, 100 - Math.round(snapshot.connection.successRate)),
    timeoutCount: snapshot.connection.status.includes("异常") ? 1 : 0,
    crcErrorCount: 0,
    averageLatencyMs: snapshot.connection.latencyMs,
    maxLatencyMs: snapshot.connection.latencyMs,
    successRate: snapshot.connection.successRate,
  }];
  const operationLogs = snapshot.activities.map((activity, index) => activityToOperationLog(activity, input.timestamp + index, input.operator));
  const testReports = input.testReports ?? [];
  return {
    pointSamples: pointSamples.map(clone),
    alarmEvents: alarmEvents.map(clone),
    communicationRecords: communicationRecords.map(clone),
    operationLogs: operationLogs.map(clone),
    testReports: testReports.map(clone),
  };
}

export function persistSnapshotToHistory(
  repository: LocalHistoryRepository,
  snapshot: AppSnapshot,
  input: { timestamp: number; operator: string; testReports?: StoredTestReport[] },
): SnapshotPersistSummary {
  const batch = buildHistoryPersistBatch(snapshot, input);
  repository.writePointSamples(batch.pointSamples);
  repository.writeAlarmEvents(batch.alarmEvents);
  repository.writeCommunicationHistory(batch.communicationRecords);
  repository.writeOperationLogs(batch.operationLogs);
  repository.writeTestReports(batch.testReports);

  return {
    pointSamplesWritten: batch.pointSamples.length,
    alarmEventsWritten: batch.alarmEvents.length,
    communicationRowsWritten: batch.communicationRecords.length,
    operationLogsWritten: batch.operationLogs.length,
    testReportsWritten: batch.testReports.length,
  };
}

export function exportRowsAsCsv(rows: TrendQueryRow[]): string {
  const header = ["时间", "设备", "点位", "数值", "单位", "页面", "质量"];
  const body = rows.map((row) => [
    row.time,
    row.deviceId,
    row.pointName,
    formatNumeric(row.value),
    row.unit,
    row.page,
    row.quality,
  ]);
  return `${[header, ...body].map((line) => line.map(csvCell).join(",")).join("\n")}\n`;
}

export function exportRowsAsExcelXml(sheetName: string, rows: TrendQueryRow[]): string {
  const safeSheet = xmlEscape(sheetName);
  const csvRows = [
    ["时间", "设备", "点位", "数值", "单位", "页面", "质量"],
    ...rows.map((row) => [row.time, row.deviceId, row.pointName, formatNumeric(row.value), row.unit, row.page, row.quality]),
  ];
  const tableRows = csvRows.map((row) =>
    `<Row>${row.map((cell) => `<Cell><Data ss:Type="${typeof cell === "number" ? "Number" : "String"}">${xmlEscape(String(cell))}</Data></Cell>`).join("")}</Row>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="${safeSheet}">
    <Table>${tableRows}</Table>
  </Worksheet>
</Workbook>
`;
}

export function generateDailyReportHtml(model: DailyReportModel): string {
  return htmlDocument(`${model.projectName} 日报`, `
    <h1>${htmlEscape(model.projectName)} 日报</h1>
    <p>日期：${htmlEscape(model.date)} · 协议：${htmlEscape(model.protocolVersion)}</p>
    <section><h2>运行概览</h2><p>历史点位 ${model.pointCount} 条，告警 ${model.alarmCount} 条，严重告警 ${model.criticalAlarmCount} 条。</p></section>
    <section><h2>通信质量</h2><p>平均成功率 ${model.communicationQuality}% ，记录 ${model.communication.length} 条。</p></section>
    <section><h2>告警历史</h2>${renderTable(["时间", "设备", "等级", "标题", "状态"], model.alarms.map((alarm) => [formatDateTime(alarm.timestamp), alarm.deviceId, alarm.severity, alarm.title, alarm.status]))}</section>
    <section><h2>测试报告</h2><p>生成测试报告 ${model.testReportCount} 份。</p></section>
  `);
}

export function generateTestReportHtml(report: StoredTestReport): string {
  return htmlDocument(report.title, `
    <h1>${htmlEscape(report.title)}</h1>
    <p>${htmlEscape(report.projectName)} · ${htmlEscape(report.protocolVersion)} · ${formatDateTime(report.timestamp)}</p>
    <section><h2>摘要</h2><p>${htmlEscape(report.summary)}（${report.passedCases}/${report.totalCases} 通过，耗时 ${report.durationMs}ms）</p></section>
    <section><h2>步骤明细</h2>${renderTable(["名称", "期望", "实际", "结果"], report.details.map((detail) => [detail.name, detail.expected, detail.actual, detail.result]))}</section>
  `);
}

export function generateHomeSelfTestReportHtml(report: StoredTestReport): string {
  return htmlDocument("首页自测结果", `
    <h1>首页自测结果</h1>
    <p>${htmlEscape(report.title)} · ${report.passedCases}/${report.totalCases} 通过</p>
    <section><h2>闭环校验</h2>${renderTable(["检查项", "期望", "实际", "结果"], report.details.map((detail) => [detail.name, detail.expected, detail.actual, detail.result]))}</section>
  `);
}

function createDefaultReportTemplates(): ReportTemplate[] {
  return [
    { templateId: "device-debug", name: "设备调试报告", reportType: "device-debug", description: "设备接线、通信、点位与参数调试记录。", sections: ["项目信息", "设备信息", "点位趋势", "调试结论"] },
    { templateId: "automation-test", name: "自动化测试报告", reportType: "automation-test", description: "自动化用例执行结果与失败原因。", sections: ["测试概览", "用例结果", "步骤日志", "通信报文"] },
    { templateId: "alarm-statistics", name: "告警统计报告", reportType: "alarm-statistics", description: "告警等级、设备、时段统计。", sections: ["告警概览", "Top 告警", "恢复情况"] },
    { templateId: "communication-quality", name: "通信质量报告", reportType: "communication-quality", description: "通信成功率、延迟、异常码和失败地址段。", sections: ["质量概览", "延迟趋势", "异常诊断"] },
    { templateId: "home-self-test", name: "首页自测报告", reportType: "home-self-test", description: "首页 KPI、PCS 矩阵和闭环模拟自测结果。", sections: ["首页 KPI", "自测步骤", "结果判定"] },
  ];
}

function metricToPointSample(metric: MetricCard, timestamp: number): PointHistorySample {
  return {
    timestamp,
    deviceId: "dashboard",
    deviceType: "dashboard",
    pointId: metric.key,
    pointName: metric.label,
    page: "首页",
    value: parseNumeric(metric.value),
    unit: metric.unit,
    quality: metric.tone === "red" ? "alarm" : "good",
    source: metric.helper,
  };
}

function deviceToPointSample(device: DeviceStatus, timestamp: number): PointHistorySample {
  return {
    timestamp,
    deviceId: device.name,
    deviceType: device.deviceType,
    pointId: "quality",
    pointName: "通信质量",
    page: "实时监控",
    value: parseNumeric(device.quality),
    unit: "%",
    quality: device.connection.includes("在线") || device.connection.includes("连接") ? "good" : "bad",
    source: device.runtime,
  };
}

function registryRepresentativePointSamples(timestamp: number): PointHistorySample[] {
  const requiredDeviceTypes = ["PCS", "BMS", "液冷", "动环", "电表", "箱变"];
  const samples: PointHistorySample[] = [];
  for (const deviceType of requiredDeviceTypes) {
    const trace = Object.values(pointBindingRegistry).find((entry): entry is BoundPointTrace =>
      entry.kind === "bound" && inferDeviceTypeFromTrace(entry) === deviceType,
    );
    if (!trace) continue;
    samples.push({
      timestamp,
      deviceId: trace.deviceInstance,
      deviceType,
      pointId: trace.pointId,
      pointName: trace.displayName,
      page: trace.pageName,
      value: parseNumeric(trace.engineeringValue),
      unit: trace.unit,
      quality: trace.communicationStatus.includes("正常") ? "good" : "bad",
      source: `${trace.registerAddress}`,
    });
  }
  return samples;
}

function inferDeviceTypeFromTrace(trace: BoundPointTrace): string {
  const text = `${trace.deviceInstance} ${trace.displayName} ${trace.pointId}`;
  if (/PCS/i.test(text)) return "PCS";
  if (/BMS/i.test(text)) return "BMS";
  if (/液冷|liquid/i.test(text)) return "液冷";
  if (/动环|ENV|environment/i.test(text)) return "动环";
  if (/电表|METER|meter/i.test(text)) return "电表";
  if (/箱变|TR-|transformer/i.test(text)) return "箱变";
  return "";
}

function trendPointsToSamples(trends: TrendPoint[], timestamp: number): PointHistorySample[] {
  const start = timestamp - Math.max(0, trends.length - 1) * 60_000;
  return trends.flatMap((trend, index) => {
    const sampleTime = start + index * 60_000;
    return [
      trendSample(sampleTime, "power", "功率趋势", trend.power, "kW", trend.time),
      trendSample(sampleTime, "soc", "SOC 趋势", trend.soc, "%", trend.time),
      trendSample(sampleTime, "quality", "通信质量趋势", trend.quality, "%", trend.time),
    ];
  });
}

function trendSample(timestamp: number, pointId: string, pointName: string, value: number, unit: string, label: string): PointHistorySample {
  return {
    timestamp,
    deviceId: "dashboard-trend",
    deviceType: "dashboard",
    pointId,
    pointName,
    page: "首页",
    value,
    unit,
    quality: "good",
    source: label,
  };
}

function loopbackToPointSamples(snapshot: AppSnapshot, timestamp: number): PointHistorySample[] {
  const loopback = snapshot.loopbackDashboard;
  if (!loopback) return [];
  const valueSamples = loopback.values.map((value) => ({
    timestamp,
    deviceId: "home-loopback",
    deviceType: "simulator",
    pointId: value.address,
    pointName: value.name,
    page: "首页",
    value: value.engineeringValue,
    unit: value.unit,
    quality: "simulated",
    source: value.displayValue,
  }));
  const pcsSamples = loopback.pcsModules.map((module) => ({
    timestamp,
    deviceId: `PCS-${String(module.id).padStart(2, "0")}`,
    deviceType: "PCS",
    pointId: "module-power",
    pointName: "PCS 模块功率",
    page: "首页",
    value: parseNumeric(module.power),
    unit: "kW",
    quality: module.hasFault ? "alarm" : "good",
    source: module.state,
  }));
  return [...valueSamples, ...pcsSamples];
}

function subsystemToPointSamples(timestamp: number): PointHistorySample[] {
  return representativeSubsystemPoints.map((point) => ({
    timestamp,
    deviceId: point.deviceId,
    deviceType: point.deviceType,
    pointId: point.pointId,
    pointName: point.pointName,
    page: "实时监控",
    value: point.value,
    unit: point.unit,
    quality: point.quality ?? "good",
    source: point.source,
  }));
}

export const representativeSubsystemPoints: Array<Omit<PointHistorySample, "timestamp" | "page">> = [
  {
    deviceId: "PCS-01",
    deviceType: "PCS",
    pointId: "module-state",
    pointName: "PCS 模块状态",
    value: 1,
    unit: "",
    quality: "good",
    source: "14002 并网运行",
  },
  {
    deviceId: "PCS-01",
    deviceType: "PCS",
    pointId: "module-active-power",
    pointName: "PCS 模块有功功率",
    value: 92,
    unit: "kW",
    quality: "good",
    source: "15001 基址模块功率",
  },
  {
    deviceId: "PCS-01",
    deviceType: "PCS",
    pointId: "module-max-temp",
    pointName: "PCS 模块最高温度",
    value: 36.5,
    unit: "℃",
    quality: "good",
    source: "15011~15020 温度点",
  },
  {
    deviceId: "BMS-01",
    deviceType: "BMS",
    pointId: "soc",
    pointName: "BMS SOC",
    value: 72.6,
    unit: "%",
    quality: "good",
    source: "25609",
  },
  {
    deviceId: "BMS-01",
    deviceType: "BMS",
    pointId: "soh",
    pointName: "BMS SOH",
    value: 98.1,
    unit: "%",
    quality: "good",
    source: "25611",
  },
  {
    deviceId: "BMS-01",
    deviceType: "BMS",
    pointId: "voltage",
    pointName: "BMS 总电压",
    value: 768.2,
    unit: "V",
    quality: "good",
    source: "25605",
  },
  {
    deviceId: "BMS-01",
    deviceType: "BMS",
    pointId: "current",
    pointName: "BMS 总电流",
    value: -325.4,
    unit: "A",
    quality: "good",
    source: "25606",
  },
  {
    deviceId: "LC-01",
    deviceType: "液冷",
    pointId: "outlet-temp",
    pointName: "液冷出水温度",
    value: 24.8,
    unit: "℃",
    quality: "good",
    source: "13122",
  },
  {
    deviceId: "LC-01",
    deviceType: "液冷",
    pointId: "outlet-pressure",
    pointName: "液冷出水压力",
    value: 0.42,
    unit: "MPa",
    quality: "good",
    source: "13126",
  },
  {
    deviceId: "LC-01",
    deviceType: "液冷",
    pointId: "pump-speed",
    pointName: "液冷水泵转速",
    value: 2860,
    unit: "rpm",
    quality: "good",
    source: "13001",
  },
  {
    deviceId: "LC-01",
    deviceType: "液冷",
    pointId: "alarm-level",
    pointName: "液冷告警等级",
    value: 0,
    unit: "",
    quality: "good",
    source: "13039/13134",
  },
  {
    deviceId: "ENV-01",
    deviceType: "动环",
    pointId: "cabinet-temp",
    pointName: "柜内温度",
    value: 28.4,
    unit: "℃",
    quality: "good",
    source: "13209",
  },
  {
    deviceId: "ENV-01",
    deviceType: "动环",
    pointId: "cabinet-humidity",
    pointName: "柜内湿度",
    value: 46,
    unit: "%",
    quality: "good",
    source: "13210",
  },
  {
    deviceId: "ENV-01",
    deviceType: "动环",
    pointId: "di-status",
    pointName: "DI 状态",
    value: 0,
    unit: "",
    quality: "good",
    source: "13201 门禁闭合 · 烟感正常",
  },
  {
    deviceId: "ENV-01",
    deviceType: "动环",
    pointId: "alarm-status",
    pointName: "动环报警",
    value: 0,
    unit: "",
    quality: "good",
    source: "13205/13206 无活动报警",
  },
  {
    deviceId: "METER-01",
    deviceType: "电表",
    pointId: "active-power",
    pointName: "电表总有功功率",
    value: 1248.4,
    unit: "kW",
    quality: "good",
    source: "13224",
  },
  {
    deviceId: "METER-01",
    deviceType: "电表",
    pointId: "power-factor",
    pointName: "电表功率因数",
    value: 0.98,
    unit: "PF",
    quality: "good",
    source: "13225",
  },
  {
    deviceId: "METER-01",
    deviceType: "电表",
    pointId: "forward-active-energy",
    pointName: "正向有功电能",
    value: 824.6,
    unit: "MWh",
    quality: "good",
    source: "13232",
  },
  {
    deviceId: "TR-01",
    deviceType: "箱变",
    pointId: "winding-temp",
    pointName: "箱变绕组温度",
    value: 61.4,
    unit: "℃",
    quality: "good",
    source: "13523",
  },
  {
    deviceId: "TR-01",
    deviceType: "箱变",
    pointId: "high-side-current",
    pointName: "高压侧电流",
    value: 34.1,
    unit: "A",
    quality: "good",
    source: "13501",
  },
  {
    deviceId: "TR-01",
    deviceType: "箱变",
    pointId: "low-side-voltage",
    pointName: "低压侧电压",
    value: 660.2,
    unit: "V",
    quality: "good",
    source: "13504",
  },
];

function activitiesToAlarmEvents(activities: ActivityItem[], timestamp: number): AlarmHistoryEvent[] {
  return activities
    .filter((activity) => /告警|故障|异常|保护/.test(activity.title))
    .map((activity, index) => {
      const severity = activity.tone === "red" ? "critical" : activity.tone === "orange" ? "major" : "minor";
      return {
        timestamp: timestamp + index,
        alarmId: `activity-alarm-${index + 1}`,
        deviceId: inferDeviceId(activity.title),
        severity,
        status: activity.title.includes("恢复") ? "recovered" : "active",
        title: activity.title.replace(/^告警:\s*/, ""),
        message: activity.detail,
        source: "活动列表",
      };
    });
}

function activityToOperationLog(activity: ActivityItem, timestamp: number, operator: string): OperationLogRecord {
  return {
    timestamp,
    operator,
    action: activity.title,
    target: activity.detail.split("/")[0]?.trim() || "系统",
    result: activity.tone === "red" ? "failed" : "success",
    detail: `${activity.detail} · ${activity.time}`,
  };
}

function normalizePointSample(sample: PointHistorySample): PointHistorySample {
  return { ...sample, value: Number.isFinite(sample.value) ? sample.value : 0 };
}

function aggregateValues(values: number[], aggregate: Exclude<TrendAggregate, "raw">): number {
  if (aggregate === "max") return Math.max(...values);
  if (aggregate === "min") return Math.min(...values);
  return round2(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function inOptionalRange(timestamp: number, startTime?: number, endTime?: number): boolean {
  return (startTime === undefined || timestamp >= startTime) && (endTime === undefined || timestamp <= endTime);
}

function parseNumeric(value: string): number {
  const cleaned = value.replace(/,/g, "");
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function inferDeviceId(text: string): string {
  const match = text.match(/\b(PCS|BMS|PMU|EMS|液冷|动环|电表|箱变)[-\s#]*(\d+)?/i);
  if (!match) return "system";
  return match[2] ? `${match[1].toUpperCase()}-${match[2].padStart(2, "0")}` : match[1].toUpperCase();
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toISOString().replace("T", " ").replace("Z", "");
}

function formatNumeric(value: number): string {
  return Number.isInteger(value) ? String(value) : String(round2(value));
}

function compareTimestamp<T extends { timestamp: number }>(left: T, right: T): number {
  return left.timestamp - right.timestamp;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function csvCell(value: unknown): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function htmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function htmlDocument(title: string, body: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>${htmlEscape(title)}</title></head>
<body>${body}</body>
</html>
`;
}

function renderTable(headers: string[], rows: string[][]): string {
  const head = `<thead><tr>${headers.map((header) => `<th>${htmlEscape(header)}</th>`).join("")}</tr></thead>`;
  const body = `<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${htmlEscape(String(cell))}</td>`).join("")}</tr>`).join("")}</tbody>`;
  return `<table>${head}${body}</table>`;
}
