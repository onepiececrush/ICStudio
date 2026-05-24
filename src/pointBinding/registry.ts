export type PointDiagnosticSeverity = "info" | "warning" | "error";

export type PointDiagnosticCode =
  | "OK"
  | "NO_BINDING"
  | "POINT_UNREAD"
  | "SCALE_MISSING"
  | "TYPE_PARSE_FAILED"
  | "COMM_TIMEOUT"
  | "OUT_OF_RANGE"
  | "UNIT_MISMATCH";

export type PointDiagnostic = {
  code: PointDiagnosticCode;
  severity: PointDiagnosticSeverity;
  message: string;
};

export type SimulatorExpectation = {
  expectedEngineeringValue: string;
  actualEngineeringValue: string;
  delta: string;
  status: "match" | "mismatch" | "not-configured";
};

export type PointChange = {
  time: string;
  rawRegisterValue: string;
  engineeringValue: string;
  formattedValue: string;
  note: string;
};

export type BoundPointTrace = {
  kind: "bound";
  pointId: string;
  componentId: string;
  pageName: string;
  displayName: string;
  deviceInstance: string;
  protocolVersion: string;
  registerAddress: number | string;
  functionCode: number | string;
  dataType: string;
  byteOrder: string;
  scale: number | string;
  offset: number | string;
  unit: string;
  rawRegisterValue: string;
  engineeringValue: string;
  formattedValue: string;
  lastUpdateTime: string;
  lastRequestFrame: string;
  lastResponseFrame: string;
  latencyMs: number | string;
  communicationStatus: string;
  diagnostics: PointDiagnostic[];
  recentChanges: PointChange[];
  simulatorExpectation?: SimulatorExpectation;
};

export type UnboundPointTrace = {
  kind: "unbound";
  pointId: string;
  displayName: string;
  diagnostics: PointDiagnostic[];
};

export type UnboundPointBindingTrace = UnboundPointTrace;

export type PointBindingTrace = BoundPointTrace | UnboundPointTrace;

export const diagnosticLabels: Record<PointDiagnosticCode, string> = {
  OK: "链路正常",
  NO_BINDING: "无绑定点位",
  POINT_UNREAD: "点位未读取",
  SCALE_MISSING: "协议倍率缺失",
  TYPE_PARSE_FAILED: "类型解析失败",
  COMM_TIMEOUT: "通信超时",
  OUT_OF_RANGE: "值越限",
  UNIT_MISMATCH: "单位不一致",
};

const protocolVersion = "PCS Modbus V3.13 / BMS V1.06";

function hexByte(value: number) {
  return (value & 0xff).toString(16).toUpperCase().padStart(2, "0");
}

function requestFrame(address: number, quantity = 1, unitId = 1, functionCode = 3) {
  const start = Math.max(0, address - 1);
  return `${hexByte(unitId)} ${hexByte(functionCode)} ${hexByte(start >> 8)} ${hexByte(start)} 00 ${hexByte(quantity)} AA 55`;
}

function responseFrame(raw: number | string, quantity = 1, unitId = 1, functionCode = 3) {
  const numeric = typeof raw === "number" && Number.isFinite(raw) ? raw : Number(String(raw).replace(/[^\d-]/g, "")) || 0;
  const high = hexByte(numeric >> 8);
  const low = hexByte(numeric);
  const payload = Array.from({ length: Math.max(1, quantity) }, (_, index) => (index === 0 ? `${high} ${low}` : "00 00")).join(" ");
  return `${hexByte(unitId)} ${hexByte(functionCode)} ${hexByte(quantity * 2)} ${payload} 55 AA`;
}

function okDiagnostic(message = "采集、解析、倍率和显示格式一致。") {
  return [{ code: "OK", severity: "info", message }] satisfies PointDiagnostic[];
}

function changes(value: Pick<BoundPointTrace, "rawRegisterValue" | "engineeringValue" | "formattedValue">, previousRaw?: string): PointChange[] {
  return [
    {
      time: "14:35:40",
      rawRegisterValue: value.rawRegisterValue,
      engineeringValue: value.engineeringValue,
      formattedValue: value.formattedValue,
      note: "最近一次轮询刷新",
    },
    {
      time: "14:35:39",
      rawRegisterValue: previousRaw ?? value.rawRegisterValue,
      engineeringValue: value.engineeringValue,
      formattedValue: value.formattedValue,
      note: "上一轮工程值对比",
    },
  ];
}

type TraceInput = Omit<BoundPointTrace, "kind" | "protocolVersion" | "byteOrder" | "offset" | "lastRequestFrame" | "lastResponseFrame" | "lastUpdateTime" | "latencyMs" | "diagnostics" | "recentChanges"> &
  Partial<Pick<BoundPointTrace, "protocolVersion" | "byteOrder" | "offset" | "lastRequestFrame" | "lastResponseFrame" | "lastUpdateTime" | "latencyMs" | "diagnostics" | "recentChanges">>;

function trace(input: TraceInput): BoundPointTrace {
  const address = typeof input.registerAddress === "number" ? input.registerAddress : Number(input.registerAddress) || 0;
  const quantity = ["uint32", "int32", "float", "float32"].includes(input.dataType) ? 2 : 1;
  const normalized: BoundPointTrace = {
    kind: "bound",
    protocolVersion,
    byteOrder: "AB CD",
    offset: 0,
    lastUpdateTime: "2025-05-23 14:35:40",
    latencyMs: 8.2,
    diagnostics: okDiagnostic(),
    lastRequestFrame: requestFrame(address, quantity, 1, Number(input.functionCode) || 3),
    lastResponseFrame: responseFrame(input.rawRegisterValue, quantity, 1, Number(input.functionCode) || 3),
    recentChanges: [],
    ...input,
  };
  return { ...normalized, recentChanges: input.recentChanges ?? changes(normalized) };
}

function register(entries: BoundPointTrace[]) {
  return Object.fromEntries(entries.map((entry) => [entry.pointId, entry])) as Record<string, BoundPointTrace>;
}

const dashboardKpis = [
  trace({
    pointId: "home.kpi.pcs-online",
    componentId: "HomePcsOnlineKpiCard",
    pageName: "首页",
    displayName: "PCS 在线台数",
    deviceInstance: "EMS 汇总 / PCS Cluster",
    registerAddress: 14001,
    functionCode: 3,
    dataType: "uint16",
    scale: 1,
    unit: "台",
    rawRegisterValue: "12",
    engineeringValue: "12",
    formattedValue: "12 / 16",
    communicationStatus: "正常",
  }),
  trace({
    pointId: "home.kpi.system-state",
    componentId: "HomeSystemStateKpiCard",
    pageName: "首页",
    displayName: "系统运行状态",
    deviceInstance: "EMS 汇总 / PCS Cluster",
    registerAddress: 14002,
    functionCode: 3,
    dataType: "enum(uint16)",
    scale: 1,
    unit: "",
    rawRegisterValue: "1",
    engineeringValue: "并网运行",
    formattedValue: "并网运行",
    communicationStatus: "正常",
  }),
  trace({
    pointId: "home.kpi.active-power",
    componentId: "HomeTotalActivePowerCard",
    pageName: "首页",
    displayName: "总有功功率",
    deviceInstance: "PCS 汇总控制器 PCS-Cluster-01",
    registerAddress: 14006,
    functionCode: 3,
    dataType: "int32",
    scale: 0.01,
    unit: "kW",
    rawRegisterValue: "125000",
    engineeringValue: "1250.00",
    formattedValue: "1,250.00 kW",
    communicationStatus: "正常",
    lastResponseFrame: "01 03 04 00 01 E8 48 62 6F",
    simulatorExpectation: {
      expectedEngineeringValue: "1250.00 kW",
      actualEngineeringValue: "1250.00 kW",
      delta: "0.00 kW",
      status: "match",
    },
  }),
  trace({
    pointId: "home.kpi.reactive-power",
    componentId: "HomeReactivePowerCard",
    pageName: "首页",
    displayName: "总无功功率",
    deviceInstance: "PCS 汇总控制器 PCS-Cluster-01",
    registerAddress: 14007,
    functionCode: 3,
    dataType: "int32",
    scale: 0.01,
    unit: "kvar",
    rawRegisterValue: "-12050",
    engineeringValue: "-120.50",
    formattedValue: "-120.50 kvar",
    communicationStatus: "正常",
  }),
  trace({
    pointId: "home.kpi.dc-voltage",
    componentId: "HomeDcVoltageCard",
    pageName: "首页",
    displayName: "电池直流电压",
    deviceInstance: "BMS-01 / Rack 汇总",
    registerAddress: 14031,
    functionCode: 3,
    dataType: "uint16",
    scale: 0.1,
    unit: "V",
    rawRegisterValue: "7682",
    engineeringValue: "768.20",
    formattedValue: "768.20 V",
    communicationStatus: "正常",
  }),
  trace({
    pointId: "home.kpi.battery-current",
    componentId: "HomeBatteryCurrentCard",
    pageName: "首页",
    displayName: "电池电流",
    deviceInstance: "BMS-01 / Rack 汇总",
    registerAddress: 14032,
    functionCode: 3,
    dataType: "int16",
    scale: 0.1,
    unit: "A",
    rawRegisterValue: "-3254",
    engineeringValue: "-325.40",
    formattedValue: "-325.40 A",
    communicationStatus: "正常",
  }),
  trace({
    pointId: "home.kpi.current-alarms",
    componentId: "HomeCurrentAlarmCard",
    pageName: "首页",
    displayName: "当前告警",
    deviceInstance: "告警聚合服务 / PCS+BMS+动环+液冷",
    registerAddress: "14003/14004/33601~33615",
    functionCode: "03/04",
    dataType: "bitfield[]",
    scale: 1,
    unit: "条",
    rawRegisterValue: "0x0003",
    engineeringValue: "3",
    formattedValue: "3 条（严重 1 / 一般 2）",
    communicationStatus: "部分失败",
    lastRequestFrame: "01 03 36 B2 00 0F 4C 10",
    lastResponseFrame: "01 83 0B F0 F1",
    latencyMs: "800 ms 超时阈值",
    diagnostics: [
      { code: "COMM_TIMEOUT", severity: "error", message: "液冷机 1 最近一次轮询超时，告警聚合值可能不是最新。" },
      { code: "OK", severity: "info", message: "PCS 与 BMS 告警字解析成功。" },
    ],
  }),
];

export const dashboardCoreKpiPointIds = dashboardKpis.map((entry) => entry.pointId);

const topologyEntries = [
  trace({ pointId: "home.topology.grid-frequency", componentId: "HomeEnergyGridFrequency", pageName: "首页", displayName: "电网频率", deviceInstance: "电表 PMU-01", registerAddress: 14005, functionCode: 3, dataType: "uint16", scale: 0.01, unit: "Hz", rawRegisterValue: "5000", engineeringValue: "50.00", formattedValue: "50.00 Hz", communicationStatus: "正常" }),
  trace({ pointId: "home.topology.grid-phase-voltage", componentId: "HomeEnergyGridPhaseVoltage", pageName: "首页", displayName: "A/B/C 相电压", deviceInstance: "PCS 汇总控制器", registerAddress: "14022~14024", functionCode: 3, dataType: "uint16[3]", scale: 0.1, unit: "V", rawRegisterValue: "3806/3812/3799", engineeringValue: "380.6 / 381.2 / 379.9", formattedValue: "380.6 / 381.2 / 379.9 V", communicationStatus: "正常" }),
  trace({ pointId: "home.topology.grid-phase-current", componentId: "HomeEnergyGridPhaseCurrent", pageName: "首页", displayName: "A/B/C 相电流", deviceInstance: "PCS 汇总控制器", registerAddress: "14025~14027", functionCode: 3, dataType: "uint16[3]", scale: 0.1, unit: "A", rawRegisterValue: "6204/6187/6221", engineeringValue: "620.4 / 618.7 / 622.1", formattedValue: "620.4 / 618.7 / 622.1 A", communicationStatus: "正常" }),
  trace({ pointId: "home.topology.grid-line-voltage", componentId: "HomeEnergyGridLineVoltage", pageName: "首页", displayName: "AB/BC/CA 线电压", deviceInstance: "PCS 汇总控制器", registerAddress: "14028~14030", functionCode: 3, dataType: "uint16[3]", scale: 0.1, unit: "V", rawRegisterValue: "6601/6598/6604", engineeringValue: "660.1 / 659.8 / 660.4", formattedValue: "660.1 / 659.8 / 660.4 V", communicationStatus: "正常" }),
  trace({ pointId: "home.topology.pcs-state", componentId: "HomeEnergyPcsState", pageName: "首页", displayName: "PCS 状态", deviceInstance: "PCS 汇总控制器", registerAddress: 14002, functionCode: 3, dataType: "enum(uint16)", scale: 1, unit: "", rawRegisterValue: "1", engineeringValue: "并网运行", formattedValue: "并网运行", communicationStatus: "正常" }),
  trace({ pointId: "home.topology.pcs-total-active-power", componentId: "HomeEnergyPcsActivePower", pageName: "首页", displayName: "PCS 总有功功率", deviceInstance: "PCS 汇总控制器", registerAddress: 14006, functionCode: 3, dataType: "int32", scale: 0.01, unit: "kW", rawRegisterValue: "125000", engineeringValue: "1250.00", formattedValue: "1,250.00 kW", communicationStatus: "正常" }),
  trace({ pointId: "home.topology.pcs-total-reactive-power", componentId: "HomeEnergyPcsReactivePower", pageName: "首页", displayName: "PCS 总无功功率", deviceInstance: "PCS 汇总控制器", registerAddress: 14007, functionCode: 3, dataType: "int32", scale: 0.01, unit: "kvar", rawRegisterValue: "-12050", engineeringValue: "-120.50", formattedValue: "-120.50 kvar", communicationStatus: "正常" }),
  trace({ pointId: "home.topology.pcs-apparent-power", componentId: "HomeEnergyPcsApparentPower", pageName: "首页", displayName: "总视在功率", deviceInstance: "PCS 汇总控制器", registerAddress: 14008, functionCode: 3, dataType: "uint32", scale: 0.01, unit: "kVA", rawRegisterValue: "125579", engineeringValue: "1255.79", formattedValue: "1,255.79 kVA", communicationStatus: "正常" }),
  trace({ pointId: "home.topology.pcs-dc-power", componentId: "HomeEnergyPcsDcPower", pageName: "首页", displayName: "直流侧功率", deviceInstance: "PCS 汇总控制器", registerAddress: 14021, functionCode: 3, dataType: "int32", scale: 0.01, unit: "kW", rawRegisterValue: "-123240", engineeringValue: "-1232.40", formattedValue: "-1,232.40 kW", communicationStatus: "正常" }),
  trace({ pointId: "home.topology.battery-voltage", componentId: "HomeEnergyBmsVoltage", pageName: "首页", displayName: "电池电压", deviceInstance: "BMS-01", registerAddress: 25605, functionCode: 3, dataType: "uint16", scale: 0.1, unit: "V", rawRegisterValue: "7682", engineeringValue: "768.20", formattedValue: "768.20 V", communicationStatus: "正常" }),
  trace({ pointId: "home.topology.battery-current", componentId: "HomeEnergyBmsCurrent", pageName: "首页", displayName: "电池电流", deviceInstance: "BMS-01", registerAddress: 25606, functionCode: 3, dataType: "int16", scale: 0.1, unit: "A", rawRegisterValue: "-3254", engineeringValue: "-325.40", formattedValue: "-325.40 A", communicationStatus: "正常" }),
  trace({ pointId: "home.topology.battery-soc", componentId: "HomeEnergyBmsSoc", pageName: "首页", displayName: "SOC", deviceInstance: "BMS-01", registerAddress: 25609, functionCode: 3, dataType: "uint16", scale: 0.1, unit: "%", rawRegisterValue: "726", engineeringValue: "72.6", formattedValue: "72.6%", communicationStatus: "正常", simulatorExpectation: { expectedEngineeringValue: "72.6%", actualEngineeringValue: "72.6%", delta: "0.0%", status: "match" } }),
  trace({ pointId: "home.topology.battery-soh", componentId: "HomeEnergyBmsSoh", pageName: "首页", displayName: "SOH", deviceInstance: "BMS-01", registerAddress: 25611, functionCode: 3, dataType: "uint16", scale: 0.1, unit: "%", rawRegisterValue: "981", engineeringValue: "98.1", formattedValue: "98.1%", communicationStatus: "正常" }),
  trace({ pointId: "home.topology.battery-charge-discharge-state", componentId: "HomeEnergyBmsPermission", pageName: "首页", displayName: "允许充放电状态", deviceInstance: "BMS-01", registerAddress: 25603, functionCode: 3, dataType: "enum(uint16)", scale: 1, unit: "", rawRegisterValue: "3", engineeringValue: "允许充放电", formattedValue: "允许充放电", communicationStatus: "正常" }),
  trace({ pointId: "home.topology.liquid-outlet-temp", componentId: "HomeAuxLiquidCoolingNode", pageName: "首页", displayName: "液冷出水温度", deviceInstance: "液冷机 LC-01", registerAddress: 13122, functionCode: 4, dataType: "int16", scale: 0.1, unit: "℃", rawRegisterValue: "248", engineeringValue: "24.8", formattedValue: "出水 24.8 ℃", communicationStatus: "正常" }),
  trace({ pointId: "home.topology.environment-cabinet-temp", componentId: "HomeAuxEnvironmentNode", pageName: "首页", displayName: "柜内温度", deviceInstance: "动环 ENV-01", registerAddress: 13209, functionCode: 4, dataType: "int16", scale: 0.1, unit: "℃", rawRegisterValue: "284", engineeringValue: "28.4", formattedValue: "柜内 28.4 ℃ · 46%", communicationStatus: "正常" }),
  trace({ pointId: "home.topology.meter-active-power", componentId: "HomeAuxMeterNode", pageName: "首页", displayName: "电表总有功功率", deviceInstance: "电表 METER-01", registerAddress: 13224, functionCode: 4, dataType: "int32", scale: 0.1, unit: "kW", rawRegisterValue: "12484", engineeringValue: "1248.4", formattedValue: "PF 0.98 · 1,248 kW", communicationStatus: "正常" }),
  trace({ pointId: "home.topology.transformer-winding-temp", componentId: "HomeAuxTransformerNode", pageName: "首页", displayName: "箱变绕组温度", deviceInstance: "箱变 TR-01", registerAddress: 13523, functionCode: 4, dataType: "int16", scale: 0.1, unit: "℃", rawRegisterValue: "614", engineeringValue: "61.4", formattedValue: "绕组 61.2 ℃", communicationStatus: "正常" }),
];

function pcsEntries() {
  const states = ["运行", "运行", "故障", "运行", "运行", "待机", "运行", "运行", "运行", "告警", "运行", "运行", "待机", "离线", "运行", "运行"];
  return states.map((state, index) => {
    const id = index + 1;
    const base = 15001 + index * 500;
    const power = state === "离线" || state === "故障" ? "0.00" : state === "待机" ? "2.10" : (92 + index * 3.7).toFixed(2);
    const temp = state === "故障" ? "82.4" : state === "离线" ? "--" : (36.5 + (index % 6) * 2.1).toFixed(1);
    return trace({
      pointId: `home.pcs.${id}`,
      componentId: `HomePCS${id}MatrixCard`,
      pageName: "首页",
      displayName: `PCS${id} 模块状态`,
      deviceInstance: `PCS-${String(id).padStart(2, "0")}`,
      registerAddress: base + 9,
      functionCode: 3,
      dataType: "struct(status,power,temp,fault)",
      scale: 0.01,
      unit: "kW/℃",
      rawRegisterValue: state === "离线" ? "--" : `${state}:${power}:${temp}`,
      engineeringValue: `${state} / ${power} kW / ${temp} ℃`,
      formattedValue: `PCS${id} ${state} · ${power} kW · ${temp} ℃`,
      communicationStatus: state === "离线" ? "离线" : "正常",
      diagnostics: state === "离线" ? [{ code: "POINT_UNREAD", severity: "warning", message: "模块离线，温度点位未读取。" }] : okDiagnostic(),
      lastRequestFrame: requestFrame(base + 9, 21, id),
      lastResponseFrame: state === "离线" ? `${hexByte(id)} 83 0B 00 00` : responseFrame(Math.round(Number.parseFloat(power) * 100), 2, id),
      latencyMs: state === "离线" ? "超时" : 6.4 + index / 10,
    });
  });
}

const healthEntries = [
  trace({ pointId: "home.health.bms.soc-soh", componentId: "HomeBmsHealthCard", pageName: "首页", displayName: "BMS SOC / SOH", deviceInstance: "BMS-01", registerAddress: "25609/25611", functionCode: 3, dataType: "uint16[2]", scale: 0.1, unit: "%", rawRegisterValue: "726/981", engineeringValue: "72.6 / 98.1", formattedValue: "72.6% / 98.1%", communicationStatus: "正常" }),
  trace({ pointId: "home.health.bms.voltage-current", componentId: "HomeBmsHealthVoltageCurrent", pageName: "首页", displayName: "BMS 总电压 / 总电流", deviceInstance: "BMS-01", registerAddress: "25605/25606", functionCode: 3, dataType: "uint16/int16", scale: 0.1, unit: "V/A", rawRegisterValue: "7682/-3254", engineeringValue: "768.20 / -325.40", formattedValue: "768.20 V / -325.40 A", communicationStatus: "正常" }),
  trace({ pointId: "home.health.bms.power", componentId: "HomeBmsHealthPower", pageName: "首页", displayName: "BMS 总功率", deviceInstance: "BMS-01", registerAddress: 25608, functionCode: 3, dataType: "int32", scale: 0.01, unit: "kW", rawRegisterValue: "-25001", engineeringValue: "-250.01", formattedValue: "-250.01 kW", communicationStatus: "正常" }),
  trace({ pointId: "home.health.bms.cell-voltage", componentId: "HomeBmsCellVoltage", pageName: "首页", displayName: "单体最高/最低电压", deviceInstance: "BMS-01", registerAddress: "25619/25620", functionCode: 3, dataType: "uint16[2]", scale: 0.001, unit: "V", rawRegisterValue: "3421/3318", engineeringValue: "3.421 / 3.318", formattedValue: "3.421 / 3.318 V", communicationStatus: "正常" }),
  trace({ pointId: "home.health.bms.cell-temp", componentId: "HomeBmsCellTemperature", pageName: "首页", displayName: "单体最高/最低温度", deviceInstance: "BMS-01", registerAddress: "25623/25624", functionCode: 3, dataType: "int16[2]", scale: 0.1, unit: "℃", rawRegisterValue: "318/246", engineeringValue: "31.8 / 24.6", formattedValue: "31.8 / 24.6 ℃", communicationStatus: "正常" }),
  trace({ pointId: "home.health.liquid-cooling.temperature", componentId: "HomeLiquidCoolingHealthCard", pageName: "首页", displayName: "液冷出水/进水温度", deviceInstance: "液冷机 LC-01", registerAddress: "13122/13120", functionCode: 4, dataType: "int16[2]", scale: 0.1, unit: "℃", rawRegisterValue: "248/272", engineeringValue: "24.8 / 27.2", formattedValue: "24.8 / 27.2 ℃", communicationStatus: "正常" }),
  trace({ pointId: "home.health.liquid-cooling.pressure", componentId: "HomeLiquidCoolingPressure", pageName: "首页", displayName: "液冷出水压力", deviceInstance: "液冷机 LC-01", registerAddress: 13126, functionCode: 4, dataType: "uint16", scale: 0.01, unit: "MPa", rawRegisterValue: "42", engineeringValue: "0.42", formattedValue: "0.42 MPa", communicationStatus: "正常" }),
  trace({ pointId: "home.health.liquid-cooling.pump-speed", componentId: "HomeLiquidCoolingPumpSpeed", pageName: "首页", displayName: "水泵转速", deviceInstance: "液冷机 LC-01", registerAddress: 13001, functionCode: 4, dataType: "uint16", scale: 1, unit: "rpm", rawRegisterValue: "2860", engineeringValue: "2860", formattedValue: "2860 rpm", communicationStatus: "正常" }),
  trace({ pointId: "home.health.liquid-cooling.alarm", componentId: "HomeLiquidCoolingAlarm", pageName: "首页", displayName: "液冷告警等级", deviceInstance: "液冷机 LC-01", registerAddress: "13039/13134", functionCode: 4, dataType: "uint16[2]", scale: 1, unit: "", rawRegisterValue: "0/0", engineeringValue: "0 / 0", formattedValue: "0 / 0", communicationStatus: "正常" }),
  trace({ pointId: "home.health.environment.cabinet", componentId: "HomeEnvironmentHealthCard", pageName: "首页", displayName: "柜内温度 / 湿度", deviceInstance: "动环 ENV-01", registerAddress: "13209/13210", functionCode: 4, dataType: "int16/uint16", scale: 0.1, unit: "℃/%", rawRegisterValue: "284/460", engineeringValue: "28.4 / 46", formattedValue: "28.4 ℃ / 46%", communicationStatus: "正常" }),
  trace({ pointId: "home.health.environment.outdoor", componentId: "HomeEnvironmentOutdoor", pageName: "首页", displayName: "外环温度 / 湿度", deviceInstance: "动环 ENV-01", registerAddress: "13211/13212", functionCode: 4, dataType: "int16/uint16", scale: 0.1, unit: "℃/%", rawRegisterValue: "312/520", engineeringValue: "31.2 / 52", formattedValue: "31.2 ℃ / 52%", communicationStatus: "正常" }),
  trace({ pointId: "home.health.environment.di", componentId: "HomeEnvironmentDiStatus", pageName: "首页", displayName: "DI 状态", deviceInstance: "动环 ENV-01", registerAddress: 13201, functionCode: 4, dataType: "bitfield", scale: 1, unit: "", rawRegisterValue: "0x0000", engineeringValue: "门禁闭合 · 烟感正常", formattedValue: "门禁闭合 · 烟感正常", communicationStatus: "正常" }),
  trace({ pointId: "home.health.environment.alarm", componentId: "HomeEnvironmentAlarm", pageName: "首页", displayName: "动环报警", deviceInstance: "动环 ENV-01", registerAddress: "13205/13206", functionCode: 4, dataType: "bitfield[2]", scale: 1, unit: "", rawRegisterValue: "0x0000/0x0000", engineeringValue: "无活动报警", formattedValue: "无活动报警", communicationStatus: "正常" }),
  trace({ pointId: "home.health.meter.active-power", componentId: "HomeMeterHealthCard", pageName: "首页", displayName: "电表总有功功率 / 功率因数", deviceInstance: "电表 METER-01", registerAddress: "13224/13225", functionCode: 4, dataType: "int32/int16", scale: "0.1 / 0.01", unit: "kW/PF", rawRegisterValue: "12484/98", engineeringValue: "1248.4 / 0.98", formattedValue: "1,248.4 kW / 0.98", communicationStatus: "正常" }),
  trace({ pointId: "home.health.meter.voltage", componentId: "HomeMeterVoltage", pageName: "首页", displayName: "电表 A/B/C 相电压", deviceInstance: "电表 METER-01", registerAddress: "13226~13228", functionCode: 4, dataType: "uint16[3]", scale: 0.1, unit: "V", rawRegisterValue: "3806/3812/3799", engineeringValue: "380.6 / 381.2 / 379.9", formattedValue: "380.6 / 381.2 / 379.9 V", communicationStatus: "正常" }),
  trace({ pointId: "home.health.meter.current", componentId: "HomeMeterCurrent", pageName: "首页", displayName: "电表 A/B/C 相电流", deviceInstance: "电表 METER-01", registerAddress: "13229~13231", functionCode: 4, dataType: "uint16[3]", scale: 0.1, unit: "A", rawRegisterValue: "6198/6205/6189", engineeringValue: "619.8 / 620.5 / 618.9", formattedValue: "619.8 / 620.5 / 618.9 A", communicationStatus: "正常" }),
  trace({ pointId: "home.health.meter.energy", componentId: "HomeMeterEnergy", pageName: "首页", displayName: "正向有功电能", deviceInstance: "电表 METER-01", registerAddress: 13232, functionCode: 4, dataType: "uint32", scale: 0.1, unit: "MWh", rawRegisterValue: "8246", engineeringValue: "824.6", formattedValue: "824.6 MWh", communicationStatus: "正常" }),
  trace({ pointId: "home.health.transformer.current", componentId: "HomeTransformerCurrent", pageName: "首页", displayName: "高压侧电流", deviceInstance: "箱变 TR-01", registerAddress: "13501~13503", functionCode: 4, dataType: "uint16[3]", scale: 0.1, unit: "A", rawRegisterValue: "341/339/343", engineeringValue: "34.1 / 33.9 / 34.3", formattedValue: "34.1 / 33.9 / 34.3 A", communicationStatus: "正常" }),
  trace({ pointId: "home.health.transformer.voltage", componentId: "HomeTransformerVoltage", pageName: "首页", displayName: "低压侧电压", deviceInstance: "箱变 TR-01", registerAddress: "13504~13506", functionCode: 4, dataType: "uint16[3]", scale: 0.1, unit: "V", rawRegisterValue: "6602/6599/6601", engineeringValue: "660.2 / 659.9 / 660.1", formattedValue: "660.2 / 659.9 / 660.1 V", communicationStatus: "正常" }),
  trace({ pointId: "home.health.transformer.temperature", componentId: "HomeTransformerHealthCard", pageName: "首页", displayName: "变压器温度", deviceInstance: "箱变 TR-01", registerAddress: "13522~13524", functionCode: 4, dataType: "int16[3]", scale: 0.1, unit: "℃", rawRegisterValue: "598/614/606", engineeringValue: "59.8 / 61.4 / 60.6", formattedValue: "59.8 / 61.4 / 60.6 ℃", communicationStatus: "正常" }),
  trace({ pointId: "home.health.transformer.core-temp", componentId: "HomeTransformerCoreTemp", pageName: "首页", displayName: "铁芯温度 / 温湿度", deviceInstance: "箱变 TR-01", registerAddress: "13525/13530/13531", functionCode: 4, dataType: "int16[3]", scale: 0.1, unit: "℃/%", rawRegisterValue: "582/296/480", engineeringValue: "58.2 / 29.6 / 48", formattedValue: "58.2 ℃ / 29.6 ℃ 48%", communicationStatus: "正常" }),
];

const energyEntries = [
  trace({ pointId: "home.energy.today-charge", componentId: "HomeEnergyTodayCharge", pageName: "首页", displayName: "今日充电量", deviceInstance: "EMS 电量统计", registerAddress: 14033, functionCode: 3, dataType: "uint32", scale: 0.1, unit: "kWh", rawRegisterValue: "58206", engineeringValue: "5820.6", formattedValue: "5,820.6 kWh", communicationStatus: "正常" }),
  trace({ pointId: "home.energy.today-discharge", componentId: "HomeEnergyTodayDischarge", pageName: "首页", displayName: "今日放电量", deviceInstance: "EMS 电量统计", registerAddress: 14035, functionCode: 3, dataType: "uint32", scale: 0.1, unit: "kWh", rawRegisterValue: "61042", engineeringValue: "6104.2", formattedValue: "6,104.2 kWh", communicationStatus: "正常" }),
  trace({ pointId: "home.energy.total-charge", componentId: "HomeEnergyTotalCharge", pageName: "首页", displayName: "累计充电量", deviceInstance: "EMS 电量统计", registerAddress: 14037, functionCode: 3, dataType: "uint32", scale: 0.01, unit: "MWh", rawRegisterValue: "184236", engineeringValue: "1842.36", formattedValue: "1,842.36 MWh", communicationStatus: "正常" }),
  trace({ pointId: "home.energy.total-discharge", componentId: "HomeEnergyTotalDischarge", pageName: "首页", displayName: "累计放电量", deviceInstance: "EMS 电量统计", registerAddress: 14039, functionCode: 3, dataType: "uint32", scale: 0.01, unit: "MWh", rawRegisterValue: "180692", engineeringValue: "1806.92", formattedValue: "1,806.92 MWh", communicationStatus: "正常" }),
];

const monitorEntries = [
  trace({ pointId: "monitor.pcs.active-power", componentId: "RealtimeMonitorPcsActivePowerCell", pageName: "实时监控", displayName: "PCS 总有功功率", deviceInstance: "PCS 汇总控制器", registerAddress: 14006, functionCode: 3, dataType: "int32", scale: 0.01, unit: "kW", rawRegisterValue: "125000", engineeringValue: "1250.00", formattedValue: "1,250.00 kW", communicationStatus: "正常" }),
  trace({ pointId: "monitor.pcs.reactive-power", componentId: "RealtimeMonitorPcsReactivePowerCell", pageName: "实时监控", displayName: "PCS 总无功功率", deviceInstance: "PCS 汇总控制器", registerAddress: 14007, functionCode: 3, dataType: "int32", scale: 0.01, unit: "kvar", rawRegisterValue: "-12050", engineeringValue: "-120.50", formattedValue: "-120.50 kvar", communicationStatus: "正常" }),
  trace({ pointId: "monitor.pcs.grid-frequency", componentId: "RealtimeMonitorGridFrequencyCell", pageName: "实时监控", displayName: "电网频率", deviceInstance: "PMU-01", registerAddress: 14005, functionCode: 3, dataType: "uint16", scale: 0.01, unit: "Hz", rawRegisterValue: "5000", engineeringValue: "50.00", formattedValue: "50.00 Hz", communicationStatus: "正常" }),
  trace({ pointId: "monitor.bms.soc", componentId: "RealtimeMonitorBmsSocCell", pageName: "实时监控", displayName: "BMS SOC", deviceInstance: "BMS-01", registerAddress: 25609, functionCode: 3, dataType: "uint16", scale: 0.1, unit: "%", rawRegisterValue: "726", engineeringValue: "72.6", formattedValue: "72.6%", communicationStatus: "正常", simulatorExpectation: { expectedEngineeringValue: "72.6%", actualEngineeringValue: "72.6%", delta: "0.0%", status: "match" } }),
  trace({ pointId: "monitor.bms.soh", componentId: "RealtimeMonitorBmsSohCell", pageName: "实时监控", displayName: "BMS SOH", deviceInstance: "BMS-01", registerAddress: 25611, functionCode: 3, dataType: "uint16", scale: 0.1, unit: "%", rawRegisterValue: "981", engineeringValue: "98.1", formattedValue: "98.1%", communicationStatus: "正常" }),
  trace({ pointId: "monitor.liquid-cooling.outlet-temp", componentId: "RealtimeMonitorLiquidOutletCell", pageName: "实时监控", displayName: "液冷出水温度", deviceInstance: "液冷机 LC-01", registerAddress: 13122, functionCode: 4, dataType: "int16", scale: 0.1, unit: "℃", rawRegisterValue: "248", engineeringValue: "24.8", formattedValue: "24.8 ℃", communicationStatus: "正常" }),
  trace({ pointId: "monitor.environment.cabinet-temp", componentId: "RealtimeMonitorEnvironmentTempCell", pageName: "实时监控", displayName: "柜内温度", deviceInstance: "动环 ENV-01", registerAddress: 13209, functionCode: 4, dataType: "int16", scale: 0.1, unit: "℃", rawRegisterValue: "284", engineeringValue: "28.4", formattedValue: "28.4 ℃", communicationStatus: "正常" }),
  trace({ pointId: "monitor.meter.active-power", componentId: "RealtimeMonitorMeterActivePowerCell", pageName: "实时监控", displayName: "电表总有功功率", deviceInstance: "电表 METER-01", registerAddress: 13224, functionCode: 4, dataType: "int32", scale: 0.1, unit: "kW", rawRegisterValue: "12484", engineeringValue: "1248.4", formattedValue: "1,248.4 kW", communicationStatus: "正常" }),
  trace({ pointId: "monitor.transformer.winding-temp", componentId: "RealtimeMonitorTransformerTempCell", pageName: "实时监控", displayName: "箱变绕组温度", deviceInstance: "箱变 TR-01", registerAddress: 13523, functionCode: 4, dataType: "int16", scale: 0.1, unit: "℃", rawRegisterValue: "614", engineeringValue: "61.4", formattedValue: "61.4 ℃", communicationStatus: "正常" }),
];

const parameterEntries = [
  trace({ pointId: "parameters.pcs.active-power-setpoint", componentId: "ParameterPcsActivePowerSetpointCell", pageName: "参数配置", displayName: "有功功率设定", deviceInstance: "PCS 汇总控制器", registerAddress: 14101, functionCode: 6, dataType: "int32", scale: 0.01, unit: "kW", rawRegisterValue: "100000", engineeringValue: "1000.00", formattedValue: "1000.00 kW", communicationStatus: "正常" }),
  trace({ pointId: "parameters.pcs.reactive-power-setpoint", componentId: "ParameterPcsReactivePowerSetpointCell", pageName: "参数配置", displayName: "无功功率设定", deviceInstance: "PCS 汇总控制器", registerAddress: 14103, functionCode: 6, dataType: "int32", scale: 0.01, unit: "kvar", rawRegisterValue: "0", engineeringValue: "0.00", formattedValue: "0.00 kvar", communicationStatus: "正常" }),
  trace({ pointId: "parameters.pcs.charge-current-limit", componentId: "ParameterPcsChargeCurrentLimitCell", pageName: "参数配置", displayName: "充电电流限制", deviceInstance: "PCS 汇总控制器", registerAddress: 14105, functionCode: 6, dataType: "uint16", scale: 0.1, unit: "A", rawRegisterValue: "5000", engineeringValue: "500.0", formattedValue: "500.0 A", communicationStatus: "正常" }),
  trace({ pointId: "parameters.bms.soc-low-limit", componentId: "ParameterBmsSocLowLimitCell", pageName: "参数配置", displayName: "SOC 低限", deviceInstance: "BMS-01", registerAddress: 25701, functionCode: 6, dataType: "uint16", scale: 0.1, unit: "%", rawRegisterValue: "100", engineeringValue: "10.0", formattedValue: "10.0%", communicationStatus: "正常" }),
  trace({ pointId: "parameters.bms.soc-high-limit", componentId: "ParameterBmsSocHighLimitCell", pageName: "参数配置", displayName: "SOC 高限", deviceInstance: "BMS-01", registerAddress: 25702, functionCode: 6, dataType: "uint16", scale: 0.1, unit: "%", rawRegisterValue: "950", engineeringValue: "95.0", formattedValue: "95.0%", communicationStatus: "正常" }),
  trace({ pointId: "parameters.liquid-cooling.target-temp", componentId: "ParameterLiquidTargetTempCell", pageName: "参数配置", displayName: "液冷目标温度", deviceInstance: "液冷机 LC-01", registerAddress: 13160, functionCode: 6, dataType: "int16", scale: 0.1, unit: "℃", rawRegisterValue: "250", engineeringValue: "25.0", formattedValue: "25.0 ℃", communicationStatus: "正常" }),
  trace({ pointId: "parameters.environment.fan-start-temp", componentId: "ParameterEnvironmentFanTempCell", pageName: "参数配置", displayName: "风机启动温度", deviceInstance: "动环 ENV-01", registerAddress: 13260, functionCode: 6, dataType: "int16", scale: 0.1, unit: "℃", rawRegisterValue: "350", engineeringValue: "35.0", formattedValue: "35.0 ℃", communicationStatus: "正常" }),
  trace({ pointId: "parameters.meter.pt-ratio", componentId: "ParameterMeterPtRatioCell", pageName: "参数配置", displayName: "电表 PT 变比", deviceInstance: "电表 METER-01", registerAddress: 13280, functionCode: 6, dataType: "uint16", scale: 1, unit: "倍", rawRegisterValue: "10", engineeringValue: "10", formattedValue: "10 倍", communicationStatus: "正常" }),
  trace({ pointId: "parameters.transformer.temp-alarm-limit", componentId: "ParameterTransformerAlarmTempCell", pageName: "参数配置", displayName: "箱变温度告警阈值", deviceInstance: "箱变 TR-01", registerAddress: 13580, functionCode: 6, dataType: "int16", scale: 0.1, unit: "℃", rawRegisterValue: "850", engineeringValue: "85.0", formattedValue: "85.0 ℃", communicationStatus: "正常" }),
];

export const monitorPointIds = monitorEntries.map((entry) => entry.pointId);
export const parameterPointIds = parameterEntries.map((entry) => entry.pointId);

export const pointBindingRegistry = register([
  ...dashboardKpis,
  ...topologyEntries,
  ...pcsEntries(),
  ...healthEntries,
  ...energyEntries,
  ...monitorEntries,
  ...parameterEntries,
]);

export function inspectPointBinding(pointId: string, displayName = pointId): PointBindingTrace {
  const binding = pointBindingRegistry[pointId];
  if (binding) return binding;
  return {
    kind: "unbound",
    pointId,
    displayName,
    diagnostics: [
      {
        code: "NO_BINDING",
        severity: "error",
        message: `组件值 ${displayName} 没有绑定到协议点位。`,
      },
    ],
  };
}
