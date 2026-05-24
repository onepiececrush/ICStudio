import assert from "node:assert/strict";
import test from "node:test";
import { mockSnapshot } from "../src/data/mockSnapshot";
import {
  LocalHistoryRepository,
  exportRowsAsCsv,
  exportRowsAsExcelXml,
  generateDailyReportHtml,
  generateHomeSelfTestReportHtml,
  generateTestReportHtml,
  buildHistoryPersistBatch,
  persistSnapshotToHistory,
  requiredHistoryTables,
  type AlarmHistoryEvent,
  type CommunicationHistoryRecord,
  type PointHistorySample,
  type StoredTestReport,
} from "../src/history/historyCenter";

const baseTime = Date.parse("2026-05-24T08:00:00.000Z");

test("local history repository writes required records and queries point trends by time range and aggregation", () => {
  const repository = new LocalHistoryRepository({ now: () => baseTime });
  repository.initialize();

  assert.deepEqual(requiredHistoryTables, [
    "point_history",
    "alarm_history",
    "communication_history",
    "operation_log",
    "test_report",
    "report_template",
  ]);

  const samples: PointHistorySample[] = [
    pointSample("PCS-01", "active-power", baseTime, 100),
    pointSample("PCS-01", "active-power", baseTime + 20_000, 140),
    pointSample("PCS-01", "active-power", baseTime + 80_000, 180),
    pointSample("BMS-01", "soc", baseTime + 20_000, 72.6),
  ];
  repository.writePointSamples(samples);

  const rawTrend = repository.queryTrend({
    deviceId: "PCS-01",
    pointId: "active-power",
    startTime: baseTime,
    endTime: baseTime + 90_000,
    aggregate: "raw",
  });
  assert.deepEqual(rawTrend.map((row) => row.value), [100, 140, 180]);

  const minuteAverage = repository.queryTrend({
    deviceId: "PCS-01",
    pointId: "active-power",
    startTime: baseTime,
    endTime: baseTime + 120_000,
    samplingPeriodMs: 60_000,
    aggregate: "avg",
  });
  assert.deepEqual(minuteAverage.map((row) => row.value), [120, 180]);
  assert.equal(minuteAverage[0].sampleCount, 2);

  const alarms: AlarmHistoryEvent[] = [
    {
      timestamp: baseTime + 10_000,
      alarmId: "alarm-pcs-over-temp",
      deviceId: "PCS-03",
      severity: "critical",
      status: "active",
      title: "PCS3 模块过温故障",
      message: "温度超过阈值",
      source: "首页告警中心",
    },
    {
      timestamp: baseTime + 70_000,
      alarmId: "alarm-bms-soc-low",
      deviceId: "BMS-01",
      severity: "major",
      status: "recovered",
      title: "BMS SOC 过低",
      message: "SOC 低于阈值后恢复",
      source: "实时监控",
    },
  ];
  repository.writeAlarmEvents(alarms);

  const criticalAlarms = repository.queryAlarmHistory({
    startTime: baseTime,
    endTime: baseTime + 60_000,
    severity: "critical",
  });
  assert.equal(criticalAlarms.length, 1);
  assert.equal(criticalAlarms[0].title, "PCS3 模块过温故障");

  const communication: CommunicationHistoryRecord = {
    timestamp: baseTime + 5_000,
    channel: "tcp://127.0.0.1:1502",
    protocol: "Modbus TCP",
    requestCount: 120,
    successCount: 118,
    failureCount: 2,
    timeoutCount: 1,
    crcErrorCount: 0,
    averageLatencyMs: 12.4,
    maxLatencyMs: 86,
    successRate: 98.33,
  };
  repository.writeCommunicationHistory([communication]);
  assert.equal(repository.queryCommunicationHistory({ startTime: baseTime, endTime: baseTime + 10_000 })[0].successRate, 98.33);

  repository.writeOperationLogs([
    { timestamp: baseTime + 15_000, operator: "admin", action: "设置有功功率 1000kW", target: "PCS", result: "success", detail: "参数下发" },
  ]);
  assert.equal(repository.queryOperationLogs({ startTime: baseTime, endTime: baseTime + 30_000 })[0].action, "设置有功功率 1000kW");
});

test("exports CSV and Excel XML and generates daily, test, and home self-test HTML reports", () => {
  const repository = new LocalHistoryRepository({ now: () => baseTime });
  repository.initialize();
  repository.writePointSamples([
    pointSample("PCS-01", "active-power", baseTime, 1250, { pointName: "总有功功率", unit: "kW", page: "首页" }),
    pointSample("BMS-01", "soc", baseTime, 72.6, { pointName: "SOC", unit: "%", page: "实时监控" }),
  ]);
  repository.writeAlarmEvents([
    {
      timestamp: baseTime,
      alarmId: "alarm-1",
      deviceId: "PCS-03",
      severity: "critical",
      status: "active",
      title: "PCS3 模块过温故障",
      message: "温度超过阈值",
      source: "首页告警中心",
    },
  ]);
  repository.writeCommunicationHistory([
    {
      timestamp: baseTime,
      channel: "tcp://127.0.0.1:1502",
      protocol: "Modbus TCP",
      requestCount: 50,
      successCount: 49,
      failureCount: 1,
      timeoutCount: 1,
      crcErrorCount: 0,
      averageLatencyMs: 10.5,
      maxLatencyMs: 55,
      successRate: 98,
    },
  ]);

  const testReport: StoredTestReport = {
    reportId: "test-report-home-loopback",
    timestamp: baseTime,
    projectName: "EVE储能项目",
    protocolVersion: "PCS Modbus V3.13 / BMS V1.06",
    reportType: "home-self-test",
    title: "首页自测报告",
    summary: "首页闭环自测 3/3 通过",
    totalCases: 3,
    passedCases: 3,
    failedCases: 0,
    durationMs: 18_000,
    operator: "admin",
    result: "passed",
    details: [
      { name: "通信链路", expected: "可连接", actual: "127.0.0.1:1502", result: "passed" },
      { name: "总有功功率", expected: "1250 kW", actual: "1250 kW", result: "passed" },
    ],
  };
  repository.writeTestReports([testReport]);

  const csv = exportRowsAsCsv(repository.queryTrend({ deviceId: "PCS-01", pointId: "active-power", startTime: baseTime - 1, endTime: baseTime + 1, aggregate: "raw" }));
  assert.match(csv, /时间,设备,点位,数值,单位,页面,质量/);
  assert.match(csv, /PCS-01,总有功功率,1250,kW,首页/);

  const excel = exportRowsAsExcelXml("趋势查询", repository.queryTrend({ deviceId: "BMS-01", pointId: "soc", startTime: baseTime - 1, endTime: baseTime + 1, aggregate: "raw" }));
  assert.match(excel, /<Workbook/);
  assert.match(excel, /SOC/);

  const dailyReport = generateDailyReportHtml(repository.createDailyReportModel({
    date: "2026-05-24",
    projectName: "EVE储能项目",
    protocolVersion: "PCS Modbus V3.13 / BMS V1.06",
  }));
  assert.match(dailyReport, /日报/);
  assert.match(dailyReport, /PCS3 模块过温故障/);
  assert.match(dailyReport, /通信质量/);

  const testReportHtml = generateTestReportHtml(testReport);
  assert.match(testReportHtml, /首页自测报告/);
  assert.match(testReportHtml, /3\/3/);

  const selfTestHtml = generateHomeSelfTestReportHtml(testReport);
  assert.match(selfTestHtml, /首页自测结果/);
  assert.match(selfTestHtml, /通信链路/);
});

test("persists dashboard, real-time monitor, alarm, communication, operation, and test results from app snapshots", () => {
  const repository = new LocalHistoryRepository({ now: () => baseTime });
  repository.initialize();

  const summary = persistSnapshotToHistory(repository, mockSnapshot, {
    timestamp: baseTime,
    operator: "admin",
    testReports: [
      {
        reportId: "auto-test-001",
        timestamp: baseTime,
        projectName: mockSnapshot.project.name,
        protocolVersion: mockSnapshot.project.protocolVersion,
        reportType: "automation-test",
        title: "自动化测试报告",
        summary: "5 项通过",
        totalCases: 5,
        passedCases: 5,
        failedCases: 0,
        durationMs: 42_000,
        operator: "admin",
        result: "passed",
        details: [],
      },
    ],
  });

  assert.ok(summary.pointSamplesWritten >= mockSnapshot.metrics.length + mockSnapshot.devices.length + mockSnapshot.trends.length * 3);
  assert.ok(summary.alarmEventsWritten >= 1);
  assert.equal(summary.communicationRowsWritten, 1);
  assert.ok(summary.operationLogsWritten >= mockSnapshot.activities.length);
  assert.equal(summary.testReportsWritten, 1);

  const dashboardHealth = repository.queryTrend({
    deviceId: "dashboard",
    pointId: "health",
    startTime: baseTime - 1,
    endTime: baseTime + 1,
    aggregate: "raw",
  });
  assert.equal(dashboardHealth[0].page, "首页");

  const deviceQuality = repository.queryTrend({
    deviceId: "PCS-01",
    pointId: "quality",
    startTime: baseTime - 1,
    endTime: baseTime + 1,
    aggregate: "raw",
  });
  assert.equal(deviceQuality[0].page, "实时监控");

  assert.equal(repository.queryTestReports({ reportType: "automation-test" })[0].title, "自动化测试报告");
});

test("builds a serializable native SQLite persist batch from app snapshots", () => {
  const batch = buildHistoryPersistBatch(mockSnapshot, {
    timestamp: baseTime,
    operator: "admin",
    testReports: [],
  });

  assert.ok(batch.pointSamples.some((sample) => sample.deviceId === "dashboard" && sample.pointId === "health"));
  assert.ok(batch.pointSamples.some((sample) => sample.deviceId === "PCS-01" && sample.page === "实时监控"));
  const persistedDeviceTypes = new Set(batch.pointSamples.map((sample) => sample.deviceType));
  for (const deviceType of ["PCS", "BMS", "液冷", "动环", "电表", "箱变"]) {
    assert.ok(persistedDeviceTypes.has(deviceType), `batch should persist representative ${deviceType} point samples`);
  }
  assert.ok(batch.alarmEvents.some((event) => event.title.includes("PCS-02")));
  assert.equal(batch.communicationRecords[0].channel, mockSnapshot.connection.endpoint);
  assert.ok(batch.operationLogs.length >= mockSnapshot.activities.length);
  assert.deepEqual(Object.keys(batch).sort(), [
    "alarmEvents",
    "communicationRecords",
    "operationLogs",
    "pointSamples",
    "testReports",
  ]);
});

function pointSample(
  deviceId: string,
  pointId: string,
  timestamp: number,
  value: number,
  overrides: Partial<PointHistorySample> = {},
): PointHistorySample {
  return {
    timestamp,
    deviceId,
    deviceType: deviceId.split("-")[0],
    pointId,
    pointName: pointId,
    page: "实时监控",
    value,
    unit: "kW",
    quality: "good",
    source: "test",
    ...overrides,
  };
}
