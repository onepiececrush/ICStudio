import assert from "node:assert/strict";
import test from "node:test";
import type { DeviceTemplate, PointModel, ProtocolModel } from "../src/protocol/pointModel";
import {
  bindScadaWidgetToPoint,
  createScadaRealtimeValuesFromSnapshot,
  createScadaRealtimeView,
  createScadaSelfTestValues,
  deserializeScadaPage,
  generateScadaWorkspaceFromPoints,
  serializeScadaPage,
  updateScadaWidgetLayout,
} from "../src/scada/pageGenerator";
import type { AppSnapshot } from "../src/types";

function point(overrides: Partial<PointModel>): PointModel {
  return {
    point_id: "point",
    device_type: "PCS",
    area: "holding_register",
    address: 40001,
    name: "点位",
    data_type: "uint16",
    word_count: 1,
    byte_order: "AB",
    scale: 1,
    offset: 0,
    unit: "",
    rw: "R",
    min: 0,
    max: 100,
    default_value: 0,
    enum_map: {},
    bit_define: {},
    remark: "",
    group: "遥测",
    page: "PCS 实时数据页",
    poll_cycle: 1000,
    simulate_rule: "fixed",
    ...overrides,
  };
}

const pcsPoints = [
  point({
    point_id: "pcs-run-state",
    address: 40002,
    name: "运行状态",
    group: "状态",
    enum_map: { "0": "待机", "1": "运行", "2": "故障" },
    min: 0,
    max: 2,
    default_value: 1,
  }),
  point({
    point_id: "pcs-active-power",
    address: 40006,
    name: "总有功功率",
    data_type: "int16",
    unit: "kW",
    min: -500,
    max: 500,
    default_value: 125.5,
    group: "遥测",
    simulate_rule: "sine",
  }),
  point({
    point_id: "pcs-dc-voltage",
    address: 40031,
    name: "直流电压",
    unit: "V",
    min: 0,
    max: 1200,
    default_value: 768.2,
    group: "遥测",
  }),
  point({
    point_id: "pcs-fault-word",
    address: 40003,
    name: "故障字",
    data_type: "uint16",
    group: "告警",
    bit_define: { "0": "一般告警", "1": "严重故障" },
    default_value: 0,
  }),
  point({
    point_id: "pcs-start-command",
    address: 40101,
    name: "启动命令",
    data_type: "bool",
    group: "控制",
    rw: "W",
    default_value: false,
  }),
  point({
    point_id: "pcs-power-setpoint",
    address: 40102,
    name: "功率设定",
    data_type: "int16",
    unit: "kW",
    group: "控制",
    rw: "R/W",
    min: -500,
    max: 500,
    default_value: 0,
  }),
  point({
    point_id: "bms-soc",
    device_type: "BMS",
    page: "BMS 实时数据页",
    address: 25609,
    name: "SOC",
    unit: "%",
    min: 0,
    max: 100,
    default_value: 72.6,
    group: "遥测",
  }),
  point({
    point_id: "liquid-out-temp",
    device_type: "液冷",
    page: "液冷页",
    address: 13122,
    name: "出水温度",
    data_type: "int16",
    unit: "℃",
    min: -20,
    max: 70,
    default_value: 24.8,
    group: "遥测",
  }),
] satisfies PointModel[];

const protocolModel: ProtocolModel = {
  id: "eve-pcs-v313",
  name: "EVE PCS Modbus",
  version: "3.13",
  vendor: "EVE",
  device_type: "PCS",
  source_file: "pcs.xlsx",
  point_count: pcsPoints.length,
  points: pcsPoints,
};

const deviceTemplate: DeviceTemplate = {
  id: "pcs-template",
  name: "PCS 设备模板",
  device_type: "PCS",
  protocol_id: protocolModel.id,
  pointIds: pcsPoints.map((item) => item.point_id),
};

test("generates SCADA workspace pages and required widget/binding JSON from protocol points", () => {
  const workspace = generateScadaWorkspaceFromPoints({
    protocolModel,
    deviceTemplate,
    pointModels: pcsPoints,
    deviceInstances: [
      { id: "pcs-1", name: "PCS #1", deviceType: "PCS" },
      { id: "bms-1", name: "BMS #1", deviceType: "BMS" },
      { id: "lcs-1", name: "液冷 #1", deviceType: "液冷" },
    ],
    includeHomeSummary: true,
  });

  assert.equal(workspace.schemaVersion, "scada-workspace/v1");
  assert.deepEqual(
    workspace.pages.map((page) => page.page_name),
    ["首页摘要页", "PCS 实时数据页", "BMS 实时数据页", "液冷页"],
  );

  const pcsPage = workspace.pages.find((page) => page.page_name === "PCS 实时数据页");
  assert.ok(pcsPage);
  assert.equal(pcsPage.page_id, "scada-pcs-realtime");
  assert.equal(pcsPage.device_type, "PCS");
  assert.deepEqual(Object.keys(pcsPage).sort(), [
    "actions",
    "bindings",
    "device_type",
    "layout",
    "page_id",
    "page_name",
    "schemaVersion",
    "styles",
    "widgets",
  ]);

  const widgetTypes = new Set(pcsPage.widgets.map((widget) => widget.type));
  for (const required of [
    "card",
    "table",
    "gauge",
    "status-light",
    "trend",
    "bar-chart",
    "device-node",
    "energy-flow",
    "topology",
    "alarm-list",
    "button",
    "input",
  ]) {
    assert.equal(widgetTypes.has(required), true, `${required} widget should be generated`);
  }

  const powerBinding = pcsPage.bindings.find((binding) => binding.pointId === "pcs-active-power");
  assert.ok(powerBinding);
  assert.equal(powerBinding.deviceInstanceId, "pcs-1");
  assert.equal(powerBinding.pointAddress, 40006);
  assert.equal(powerBinding.unit, "kW");
  assert.equal(powerBinding.displayFormat, "0.0");
  assert.deepEqual(powerBinding.alarmRules[0], { operator: ">", threshold: 500, level: "high", message: "总有功功率 高于 500kW" });

  const statusBinding = pcsPage.bindings.find((binding) => binding.pointId === "pcs-run-state");
  assert.ok(statusBinding);
  assert.deepEqual(statusBinding.enumMap, { "0": "待机", "1": "运行", "2": "故障" });
  assert.deepEqual(statusBinding.colorRules.map((rule) => rule.color), ["gray", "green", "red"]);
});

test("updates drag layout, binds a widget to another point, and round-trips saved page JSON", () => {
  const workspace = generateScadaWorkspaceFromPoints({
    protocolModel,
    deviceTemplate,
    pointModels: pcsPoints,
    deviceInstances: [{ id: "pcs-1", name: "PCS #1", deviceType: "PCS" }],
  });
  const page = workspace.pages.find((candidate) => candidate.page_name === "PCS 实时数据页");
  assert.ok(page);

  const moved = updateScadaWidgetLayout(page, "widget-card-pcs-active-power", { x: 8, y: 5, w: 4, h: 3 });
  const movedWidget = moved.widgets.find((widget) => widget.id === "widget-card-pcs-active-power");
  assert.deepEqual(movedWidget?.layout, { x: 8, y: 5, w: 4, h: 3 });
  assert.notDeepEqual(page.widgets.find((widget) => widget.id === "widget-card-pcs-active-power")?.layout, movedWidget?.layout);

  const rebound = bindScadaWidgetToPoint(moved, "widget-card-pcs-active-power", {
    point: pcsPoints.find((item) => item.point_id === "pcs-power-setpoint")!,
    deviceInstanceId: "pcs-1",
    displayFormat: "0.00",
    colorRules: [{ when: "value < 0", color: "blue", label: "充电" }],
    alarmRules: [{ operator: "<", threshold: -500, level: "critical", message: "设定超下限" }],
  });
  const widget = rebound.widgets.find((item) => item.id === "widget-card-pcs-active-power");
  assert.deepEqual(widget?.bindingIds, ["binding-widget-card-pcs-active-power-pcs-power-setpoint"]);
  const binding = rebound.bindings.find((item) => item.id === widget?.bindingIds[0]);
  assert.equal(binding?.pointId, "pcs-power-setpoint");
  assert.equal(binding?.displayFormat, "0.00");
  assert.equal(binding?.unit, "kW");

  const reopened = deserializeScadaPage(serializeScadaPage(rebound));
  assert.deepEqual(reopened, rebound);
});

test("links realtime communication values and self-test simulated data into widget view models", () => {
  const workspace = generateScadaWorkspaceFromPoints({
    protocolModel,
    deviceTemplate,
    pointModels: pcsPoints,
    deviceInstances: [{ id: "pcs-1", name: "PCS #1", deviceType: "PCS" }],
  });
  const page = workspace.pages.find((candidate) => candidate.page_name === "PCS 实时数据页");
  assert.ok(page);

  const view = createScadaRealtimeView(page, {
    "pcs-run-state": { value: 1, quality: "good", timestamp: "2026-05-24T00:00:00.000Z" },
    "pcs-active-power": { value: 126.45, quality: "good", timestamp: "2026-05-24T00:00:00.000Z" },
    "pcs-fault-word": { value: 2, quality: "alarm", timestamp: "2026-05-24T00:00:00.000Z" },
  });

  const status = view.widgets.find((widget) => widget.id === "widget-status-pcs-run-state");
  assert.equal(status?.displayValue, "运行");
  assert.equal(status?.tone, "green");
  assert.equal(status?.quality, "good");

  const power = view.widgets.find((widget) => widget.id === "widget-card-pcs-active-power");
  assert.equal(power?.displayValue, "126.5 kW");
  assert.equal(power?.rawValue, 126.45);

  const selfTestValues = createScadaSelfTestValues(page, { tick: 3, timestamp: "2026-05-24T00:00:03.000Z" });
  for (const binding of page.bindings) {
    assert.ok(selfTestValues[binding.pointId], `${binding.pointId} should have simulated data`);
    assert.equal(selfTestValues[binding.pointId].quality, "simulated");
  }

  const simulatedView = createScadaRealtimeView(page, selfTestValues);
  assert.equal(simulatedView.selfTest, true);
  assert.equal(simulatedView.widgets.every((widget) => widget.stale === false), true);
});

test("maps AppSnapshot loopback communication values into SCADA realtime bindings by point address", () => {
  const workspace = generateScadaWorkspaceFromPoints({
    protocolModel,
    deviceTemplate,
    pointModels: pcsPoints,
    deviceInstances: [{ id: "pcs-1", name: "PCS #1", deviceType: "PCS" }],
  });
  const page = workspace.pages.find((candidate) => candidate.page_name === "PCS 实时数据页");
  assert.ok(page);

  const snapshot: AppSnapshot = {
    project: { name: "SCADA 联动测试", protocolVersion: "PCS V3.13", operator: "tester" },
    connection: { mode: "Modbus TCP", endpoint: "127.0.0.1:1502", status: "已连接", latencyMs: 8, successRate: 99.9 },
    metrics: [],
    devices: [],
    activities: [],
    trends: [],
    loopbackDashboard: {
      selfTestMode: false,
      endpoint: "127.0.0.1:1502",
      connectionStatus: "已连接",
      values: [
        {
          address: "40006",
          name: "总有功功率",
          expectedValue: "0x0142",
          engineeringValue: 321.5,
          displayValue: "321.5",
          unit: "kW",
        },
        {
          address: "40002",
          name: "运行状态",
          expectedValue: "0x0002",
          engineeringValue: 2,
          displayValue: "故障",
          unit: "",
        },
      ],
      pcsModules: [],
      verificationRows: [],
      severeAlarmCount: 1,
      generalAlarmCount: 0,
      communicationAlarmCount: 0,
      logs: [],
    },
  };

  const values = createScadaRealtimeValuesFromSnapshot(page, snapshot, "2026-05-24T01:02:03.000Z");
  assert.equal(values["pcs-active-power"].value, 321.5);
  assert.equal(values["pcs-active-power"].quality, "good");
  assert.equal(values["pcs-run-state"].value, 2);

  const view = createScadaRealtimeView(page, values);
  assert.equal(view.widgets.find((widget) => widget.id === "widget-card-pcs-active-power")?.displayValue, "321.5 kW");
  assert.equal(view.widgets.find((widget) => widget.id === "widget-status-pcs-run-state")?.displayValue, "故障");
  assert.equal(view.widgets.find((widget) => widget.id === "widget-status-pcs-run-state")?.tone, "red");
});
