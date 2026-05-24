import type { DeviceTemplate, PointModel, ProtocolModel } from "../protocol/pointModel";
import type { AppSnapshot } from "../types";

export const scadaWorkspaceSchemaVersion = "scada-workspace/v1" as const;
export const scadaPageSchemaVersion = "scada-page/v1" as const;

export type ScadaWidgetType =
  | "card"
  | "table"
  | "gauge"
  | "status-light"
  | "trend"
  | "bar-chart"
  | "alarm-list"
  | "device-node"
  | "energy-flow"
  | "topology"
  | "button"
  | "input";

export type ScadaLayoutRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ScadaDeviceInstance = {
  id: string;
  name: string;
  deviceType: string;
};

export type ScadaColorRule = {
  when: string;
  color: string;
  label?: string;
  value?: number | string | boolean;
};

export type ScadaAlarmRule = {
  operator: ">" | ">=" | "<" | "<=" | "==" | "!=";
  threshold: number | string | boolean;
  level: "info" | "low" | "medium" | "high" | "critical";
  message: string;
};

export type ScadaPointBinding = {
  id: string;
  widgetId: string;
  deviceInstanceId: string;
  deviceType: string;
  pointId: string;
  pointName: string;
  pointAddress: number;
  area: string;
  dataType: string;
  rw: string;
  displayFormat: string;
  unit: string;
  scale: number;
  offset: number;
  pollCycle: number;
  defaultValue: number | string | boolean;
  simulateRule: string;
  min?: number;
  max?: number;
  enumMap: Record<string, string>;
  bitDefine: Record<string, string>;
  colorRules: ScadaColorRule[];
  alarmRules: ScadaAlarmRule[];
};

export type ScadaWidget = {
  id: string;
  type: ScadaWidgetType;
  title: string;
  description: string;
  layout: ScadaLayoutRect;
  bindingIds: string[];
  props: Record<string, unknown>;
};

export type ScadaPageConfig = {
  schemaVersion: typeof scadaPageSchemaVersion;
  page_id: string;
  page_name: string;
  device_type: string;
  layout: {
    mode: "grid";
    columns: number;
    rowHeight: number;
    canvas: { width: number; height: number };
  };
  widgets: ScadaWidget[];
  bindings: ScadaPointBinding[];
  actions: Array<{
    id: string;
    name: string;
    widgetId: string;
    type: "write-point" | "script" | "navigate";
    pointId?: string;
    script?: string;
  }>;
  styles: {
    theme: "dark-industrial" | "light";
    background: string;
    accent: string;
  };
};

export type ScadaWorkspace = {
  schemaVersion: typeof scadaWorkspaceSchemaVersion;
  protocol_id: string;
  protocol_name: string;
  device_template_id: string;
  generated_at: string;
  pages: ScadaPageConfig[];
};

export type RealtimePointValue = {
  value: number | string | boolean;
  quality: "good" | "bad" | "alarm" | "simulated" | string;
  timestamp: string;
};

export type ScadaWidgetViewModel = ScadaWidget & {
  rawValue?: number | string | boolean;
  displayValue: string;
  tone: string;
  quality: string;
  timestamp?: string;
  stale: boolean;
  binding?: ScadaPointBinding;
};

export type ScadaRealtimeView = {
  pageId: string;
  pageName: string;
  selfTest: boolean;
  generatedAt: string;
  widgets: ScadaWidgetViewModel[];
};

export type GenerateScadaWorkspaceOptions = {
  protocolModel: ProtocolModel;
  deviceTemplate: DeviceTemplate;
  pointModels: PointModel[];
  deviceInstances?: ScadaDeviceInstance[];
  includeHomeSummary?: boolean;
  now?: () => Date;
};

export type BindWidgetOptions = {
  point: PointModel;
  deviceInstanceId?: string;
  displayFormat?: string;
  colorRules?: ScadaColorRule[];
  alarmRules?: ScadaAlarmRule[];
};

export function generateScadaWorkspaceFromPoints(options: GenerateScadaWorkspaceOptions): ScadaWorkspace {
  const generatedAt = (options.now?.() ?? new Date("2026-05-24T00:00:00.000Z")).toISOString();
  const pages = createPagesFromPointGroups(options);
  if (options.includeHomeSummary && options.pointModels.length > 0) {
    pages.unshift(createHomeSummaryPage(options));
  }

  return {
    schemaVersion: scadaWorkspaceSchemaVersion,
    protocol_id: options.protocolModel.id,
    protocol_name: options.protocolModel.name,
    device_template_id: options.deviceTemplate.id,
    generated_at: generatedAt,
    pages,
  };
}

export function updateScadaWidgetLayout(
  page: ScadaPageConfig,
  widgetId: string,
  layout: ScadaLayoutRect,
): ScadaPageConfig {
  return {
    ...page,
    widgets: page.widgets.map((widget) => (widget.id === widgetId ? { ...widget, layout: { ...layout } } : widget)),
  };
}

export function bindScadaWidgetToPoint(
  page: ScadaPageConfig,
  widgetId: string,
  options: BindWidgetOptions,
): ScadaPageConfig {
  const currentWidget = page.widgets.find((widget) => widget.id === widgetId);
  if (!currentWidget) {
    throw new Error(`SCADA widget not found: ${widgetId}`);
  }

  const binding = createBinding(widgetId, options.point, {
    deviceInstanceId: options.deviceInstanceId ?? inferDeviceInstanceId(options.point),
    displayFormat: options.displayFormat,
    colorRules: options.colorRules,
    alarmRules: options.alarmRules,
  });

  return {
    ...page,
    widgets: page.widgets.map((widget) =>
      widget.id === widgetId ? { ...widget, bindingIds: [binding.id] } : widget,
    ),
    bindings: [...page.bindings.filter((item) => item.widgetId !== widgetId), binding],
  };
}

export function serializeScadaPage(page: ScadaPageConfig): string {
  return `${JSON.stringify(page, null, 2)}\n`;
}

export function deserializeScadaPage(json: string): ScadaPageConfig {
  const parsed = JSON.parse(json) as ScadaPageConfig;
  if (parsed.schemaVersion !== scadaPageSchemaVersion) {
    throw new Error(`Unsupported SCADA page schema: ${String(parsed.schemaVersion)}`);
  }
  return parsed;
}

export function createScadaRealtimeView(
  page: ScadaPageConfig,
  values: Record<string, RealtimePointValue>,
): ScadaRealtimeView {
  const selfTest = page.bindings.length > 0 && page.bindings.every((binding) => values[binding.pointId]?.quality === "simulated");

  return {
    pageId: page.page_id,
    pageName: page.page_name,
    selfTest,
    generatedAt: latestTimestamp(values) ?? new Date("2026-05-24T00:00:00.000Z").toISOString(),
    widgets: page.widgets.map((widget) => {
      const binding = firstBindingForWidget(page, widget);
      const reading = binding ? values[binding.pointId] : undefined;
      return {
        ...widget,
        rawValue: reading?.value,
        displayValue: binding && reading ? formatRealtimeValue(reading.value, binding) : "",
        tone: binding && reading ? resolveTone(reading.value, reading.quality, binding) : "neutral",
        quality: reading?.quality ?? "unbound",
        timestamp: reading?.timestamp,
        stale: Boolean(binding && !reading),
        binding,
      };
    }),
  };
}

export function createScadaSelfTestValues(
  page: ScadaPageConfig,
  options: { tick: number; timestamp: string },
): Record<string, RealtimePointValue> {
  const values: Record<string, RealtimePointValue> = {};
  for (const binding of page.bindings) {
    if (values[binding.pointId]) continue;
    values[binding.pointId] = {
      value: simulateBindingValue(binding, options.tick),
      quality: "simulated",
      timestamp: options.timestamp,
    };
  }
  return values;
}

export function createScadaRealtimeValuesFromSnapshot(
  page: ScadaPageConfig,
  snapshot: AppSnapshot,
  timestamp = new Date().toISOString(),
): Record<string, RealtimePointValue> {
  const values: Record<string, RealtimePointValue> = {};
  const loopback = snapshot.loopbackDashboard;
  if (!loopback) return values;

  for (const binding of page.bindings) {
    if (values[binding.pointId]) continue;
    const sourceValue = loopback.values.find((value) => normalizeAddress(value.address) === normalizeAddress(binding.pointAddress));
    if (!sourceValue) continue;
    values[binding.pointId] = {
      value: coerceSnapshotValue(sourceValue.engineeringValue, sourceValue.displayValue, binding),
      quality: loopback.connectionStatus === "通信异常" ? "bad" : loopback.selfTestMode ? "simulated" : "good",
      timestamp,
    };
  }
  return values;
}

function createPagesFromPointGroups(options: GenerateScadaWorkspaceOptions) {
  const grouped = new Map<string, PointModel[]>();
  for (const point of options.pointModels) {
    const pageName = normalizePageName(point.page, point.device_type);
    grouped.set(pageName, [...(grouped.get(pageName) ?? []), point]);
  }

  return [...grouped.entries()].map(([pageName, points]) =>
    createRealtimePage(pageName, dominantDeviceType(points, options.deviceTemplate.device_type), points, options),
  );
}

function createRealtimePage(
  pageName: string,
  deviceType: string,
  points: PointModel[],
  options: Pick<GenerateScadaWorkspaceOptions, "deviceInstances">,
): ScadaPageConfig {
  const widgets: ScadaWidget[] = [];
  const bindings: ScadaPointBinding[] = [];
  const actions: ScadaPageConfig["actions"] = [];

  const addWidget = (
    type: ScadaWidgetType,
    idSuffix: string,
    title: string,
    layout: ScadaLayoutRect,
    boundPoints: PointModel[],
    props: Record<string, unknown> = {},
    description = title,
  ) => {
    const widgetId = `widget-${idSuffix}`;
    const widgetBindings = boundPoints.map((point) =>
      createBinding(widgetId, point, { deviceInstanceId: findDeviceInstanceId(point, options.deviceInstances) }),
    );
    widgets.push({
      id: widgetId,
      type,
      title,
      description,
      layout,
      bindingIds: widgetBindings.map((binding) => binding.id),
      props,
    });
    bindings.push(...widgetBindings);
    return widgetId;
  };

  const readablePoints = points.filter((point) => point.rw !== "W");
  const numericPoints = readablePoints.filter(isNumericPoint);
  const statusPoints = readablePoints.filter((point) => Object.keys(point.enum_map).length > 0 || point.group.includes("状态"));
  const alarmPoints = readablePoints.filter((point) => Object.keys(point.bit_define).length > 0 || point.group.includes("告警"));
  const writablePoints = points.filter((point) => point.rw.includes("W"));

  addWidget(
    "topology",
    `${slug(deviceType)}-topology`,
    `${deviceType} 拓扑图`,
    { x: 0, y: 0, w: 8, h: 5 },
    readablePoints.slice(0, 6),
    { component: "topology", showEnergyFlow: true },
    "设备节点、能量流线和关键通信状态",
  );
  addWidget(
    "device-node",
    `${slug(deviceType)}-device-node`,
    `${deviceType} 设备节点`,
    { x: 0, y: 5, w: 3, h: 2 },
    statusPoints.slice(0, 1).length > 0 ? statusPoints.slice(0, 1) : readablePoints.slice(0, 1),
    { nodeKind: deviceType, instanceCount: 1, showCommunication: true },
    "设备模型自动生成的拓扑节点",
  );
  addWidget(
    "energy-flow",
    `${slug(deviceType)}-energy-flow`,
    `${deviceType} 能量流线`,
    { x: 3, y: 5, w: 5, h: 2 },
    numericPoints.slice(0, 2),
    { direction: "auto", animated: true, positiveFlow: "discharge", negativeFlow: "charge" },
    "根据功率点位自动判断能量流向",
  );
  addWidget(
    "table",
    `${slug(deviceType)}-table`,
    `${deviceType} 点位表格`,
    { x: 8, y: 0, w: 4, h: 5 },
    readablePoints,
    { columns: ["name", "value", "unit", "quality", "timestamp"] },
    "自动按点位生成实时表格",
  );

  statusPoints.slice(0, 4).forEach((point, index) => {
    addWidget(
      "status-light",
      `status-${point.point_id}`,
      point.name,
      { x: index * 3, y: 5, w: 3, h: 2 },
      [point],
      { shape: "round", blinkOnAlarm: true },
      `${point.name} 状态灯`,
    );
  });

  numericPoints.slice(0, 6).forEach((point, index) => {
    addWidget(
      "card",
      `card-${point.point_id}`,
      point.name,
      { x: (index % 4) * 3, y: 7 + Math.floor(index / 4) * 3, w: 3, h: 3 },
      [point],
      { unit: point.unit, precision: precisionForPoint(point), trend: true },
      `${point.name} 数字卡片`,
    );
  });

  numericPoints.slice(0, 4).forEach((point, index) => {
    addWidget(
      "gauge",
      `gauge-${point.point_id}`,
      `${point.name} 仪表盘`,
      { x: (index % 2) * 6, y: 13 + Math.floor(index / 2) * 4, w: 6, h: 4 },
      [point],
      { min: point.min ?? 0, max: point.max ?? 100, unit: point.unit },
    );
  });

  addWidget(
    "trend",
    `${slug(deviceType)}-trend`,
    `${deviceType} 趋势图`,
    { x: 0, y: 21, w: 8, h: 4 },
    numericPoints.slice(0, 3),
    { window: "15m", sampling: "realtime" },
    "实时通信数据趋势",
  );
  addWidget(
    "bar-chart",
    `${slug(deviceType)}-bar-chart`,
    `${deviceType} 柱状图`,
    { x: 0, y: 25, w: 8, h: 4 },
    numericPoints.slice(0, 5),
    { groupBy: "group", valueMode: "latest", showUnit: true },
    "当前点位值分组柱状对比",
  );

  if (alarmPoints.length > 0) {
    addWidget(
      "alarm-list",
      `${slug(deviceType)}-alarms`,
      `${deviceType} 告警列表`,
      { x: 8, y: 21, w: 4, h: 4 },
      alarmPoints,
      { showAck: true, maxRows: 8 },
    );
  }

  writablePoints.forEach((point, index) => {
    const type: ScadaWidgetType = isButtonPoint(point) ? "button" : "input";
    const widgetId = addWidget(
      type,
      `${type}-${point.point_id}`,
      point.name,
      { x: (index % 4) * 3, y: 25 + Math.floor(index / 4) * 2, w: 3, h: 2 },
      [point],
      { writeConfirm: true, min: point.min, max: point.max, unit: point.unit },
      `${point.name} 写入控件`,
    );
    actions.push({
      id: `action-${point.point_id}`,
      name: point.name,
      widgetId,
      type: "write-point",
      pointId: point.point_id,
    });
  });

  return {
    schemaVersion: scadaPageSchemaVersion,
    page_id: pageIdFor(pageName, deviceType),
    page_name: pageName,
    device_type: deviceType,
    layout: defaultLayout(),
    widgets,
    bindings,
    actions,
    styles: defaultStyles(),
  };
}

function createHomeSummaryPage(options: GenerateScadaWorkspaceOptions): ScadaPageConfig {
  const points = uniqueBy(options.pointModels, (point) => `${point.device_type}:${point.group}:${point.point_id}`);
  const summaryPoints = uniqueBy(points, (point) => point.device_type).slice(0, 6);
  const page = createRealtimePage("首页摘要页", options.deviceTemplate.device_type || "系统", summaryPoints, options);
  return {
    ...page,
    page_id: "scada-home-summary",
    page_name: "首页摘要页",
    device_type: "系统",
  };
}

function createBinding(
  widgetId: string,
  point: PointModel,
  overrides: {
    deviceInstanceId?: string;
    displayFormat?: string;
    colorRules?: ScadaColorRule[];
    alarmRules?: ScadaAlarmRule[];
  } = {},
): ScadaPointBinding {
  return {
    id: `binding-${widgetId}-${point.point_id}`,
    widgetId,
    deviceInstanceId: overrides.deviceInstanceId ?? inferDeviceInstanceId(point),
    deviceType: point.device_type,
    pointId: point.point_id,
    pointName: point.name,
    pointAddress: point.address,
    area: point.area,
    dataType: point.data_type,
    rw: point.rw,
    displayFormat: overrides.displayFormat ?? defaultDisplayFormat(point),
    unit: point.unit,
    scale: point.scale,
    offset: point.offset,
    pollCycle: point.poll_cycle,
    defaultValue: point.default_value,
    simulateRule: point.simulate_rule,
    min: point.min,
    max: point.max,
    enumMap: { ...point.enum_map },
    bitDefine: { ...point.bit_define },
    colorRules: overrides.colorRules ?? createColorRules(point),
    alarmRules: overrides.alarmRules ?? createAlarmRules(point),
  };
}

function createColorRules(point: PointModel): ScadaColorRule[] {
  const enumEntries = Object.entries(point.enum_map);
  if (enumEntries.length > 0) {
    return enumEntries.map(([value, label]) => ({
      when: `value === ${JSON.stringify(coerceEnumValue(value))}`,
      value: coerceEnumValue(value),
      color: colorForLabel(label),
      label,
    }));
  }
  if (Object.keys(point.bit_define).length > 0) {
    return [
      { when: "value === 0", value: 0, color: "green", label: "正常" },
      { when: "value > 0", color: "red", label: "告警" },
    ];
  }
  return [];
}

function createAlarmRules(point: PointModel): ScadaAlarmRule[] {
  const rules: ScadaAlarmRule[] = [];
  if (point.max !== undefined) {
    rules.push({
      operator: ">",
      threshold: point.max,
      level: "high",
      message: `${point.name} 高于 ${point.max}${point.unit}`,
    });
  }
  if (point.min !== undefined) {
    rules.push({
      operator: "<",
      threshold: point.min,
      level: "medium",
      message: `${point.name} 低于 ${point.min}${point.unit}`,
    });
  }
  for (const [bit, label] of Object.entries(point.bit_define)) {
    rules.push({
      operator: "!=",
      threshold: 0,
      level: label.includes("严重") || label.includes("故障") ? "critical" : "high",
      message: `${point.name} bit${bit} ${label}`,
    });
  }
  return rules;
}

function createScadaRealtimePageName(deviceType: string) {
  const normalized = deviceType.trim().toUpperCase();
  if (normalized === "PCS") return "PCS 实时数据页";
  if (normalized === "BMS") return "BMS 实时数据页";
  if (deviceType.includes("液冷")) return "液冷页";
  if (deviceType.includes("动环") || deviceType.includes("环境")) return "动环页";
  if (deviceType.includes("电表")) return "电表页";
  if (deviceType.includes("箱变") || deviceType.includes("变压器")) return "箱变页";
  return `${deviceType || "设备"} 实时数据页`;
}

function normalizePageName(page: string, deviceType: string) {
  const trimmed = page.trim();
  return trimmed || createScadaRealtimePageName(deviceType);
}

function defaultLayout(): ScadaPageConfig["layout"] {
  return {
    mode: "grid",
    columns: 12,
    rowHeight: 32,
    canvas: { width: 1440, height: 900 },
  };
}

function defaultStyles(): ScadaPageConfig["styles"] {
  return {
    theme: "dark-industrial",
    background: "radial-gradient(circle at 20% 0%, rgba(34, 211, 238, 0.18), transparent 28%), #08111f",
    accent: "#22d3ee",
  };
}

function firstBindingForWidget(page: ScadaPageConfig, widget: ScadaWidget) {
  const bindingId = widget.bindingIds[0];
  return bindingId ? page.bindings.find((binding) => binding.id === bindingId) : undefined;
}

function latestTimestamp(values: Record<string, RealtimePointValue>) {
  const timestamps = Object.values(values)
    .map((value) => value.timestamp)
    .sort();
  return timestamps[timestamps.length - 1];
}

function formatRealtimeValue(value: number | string | boolean, binding: ScadaPointBinding) {
  const enumLabel = binding.enumMap[String(value)];
  if (enumLabel !== undefined) return enumLabel;
  if (typeof value === "boolean") return value ? "是" : "否";
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(numeric)) {
    const decimals = decimalsFromFormat(binding.displayFormat);
    const formatted = decimals === undefined ? String(numeric) : numeric.toFixed(decimals);
    return binding.unit ? `${formatted} ${binding.unit}` : formatted;
  }
  return String(value);
}

function resolveTone(value: number | string | boolean, quality: string, binding: ScadaPointBinding) {
  for (const rule of binding.colorRules) {
    if (ruleMatches(value, rule)) return rule.color;
  }
  if (quality === "alarm") return "red";
  if (quality === "bad") return "gray";
  if (quality === "simulated") return "cyan";
  return "green";
}

function ruleMatches(value: number | string | boolean, rule: ScadaColorRule) {
  if (rule.value !== undefined && String(rule.value) === String(value)) return true;
  const comparison = rule.when.match(/value\s*(===|==|>=|<=|>|<|!=|!==)\s*("?[^"]+"?|-?\d+(?:\.\d+)?|true|false)/);
  if (!comparison) return false;
  const actual = typeof value === "number" ? value : value === true ? 1 : value === false ? 0 : Number(value);
  const rawExpected = comparison[2].replace(/^"|"$/g, "");
  const expectedNumber = Number(rawExpected);
  const expected = Number.isFinite(expectedNumber) ? expectedNumber : rawExpected;
  switch (comparison[1]) {
    case "===":
    case "==":
      return String(value) === String(expected);
    case "!==":
    case "!=":
      return String(value) !== String(expected);
    case ">":
      return Number(actual) > Number(expected);
    case ">=":
      return Number(actual) >= Number(expected);
    case "<":
      return Number(actual) < Number(expected);
    case "<=":
      return Number(actual) <= Number(expected);
    default:
      return false;
  }
}

function simulateBindingValue(binding: ScadaPointBinding, tick: number): number | string | boolean {
  if (binding.dataType === "bool") {
    return typeof binding.defaultValue === "boolean" ? binding.defaultValue : Boolean(binding.defaultValue);
  }
  if (Object.keys(binding.enumMap).length > 0) {
    const enumValues = Object.keys(binding.enumMap);
    return Number(enumValues[Math.abs(tick) % enumValues.length]);
  }
  if (binding.dataType === "string") return String(binding.defaultValue);

  const fallback = typeof binding.defaultValue === "number" ? binding.defaultValue : Number(binding.defaultValue) || 0;
  const min = binding.min ?? fallback - 10;
  const max = binding.max ?? fallback + 10;
  const span = Math.max(1, max - min);
  switch (binding.simulateRule) {
    case "sine":
      return roundTo(Math.min(max, Math.max(min, fallback + Math.sin(tick / 3) * span * 0.08)), decimalsFromFormat(binding.displayFormat) ?? 2);
    case "increment":
      return roundTo(Math.min(max, min + (Math.abs(tick) % Math.ceil(span))), decimalsFromFormat(binding.displayFormat) ?? 2);
    case "decrement":
      return roundTo(Math.max(min, max - (Math.abs(tick) % Math.ceil(span))), decimalsFromFormat(binding.displayFormat) ?? 2);
    case "random":
      return roundTo(min + deterministicRatio(tick, binding.pointAddress) * span, decimalsFromFormat(binding.displayFormat) ?? 2);
    default:
      return fallback;
  }
}

function coerceSnapshotValue(engineeringValue: number, displayValue: string, binding: ScadaPointBinding) {
  if (Object.values(binding.enumMap).includes(displayValue)) {
    const enumEntry = Object.entries(binding.enumMap).find(([, label]) => label === displayValue);
    if (enumEntry) return coerceEnumValue(enumEntry[0]);
  }
  if (Number.isFinite(engineeringValue)) return engineeringValue;
  if (binding.dataType === "bool") return ["1", "true", "是", "开", "运行"].includes(displayValue.trim().toLowerCase());
  if (binding.dataType === "string") return displayValue;
  const parsed = Number(displayValue);
  return Number.isFinite(parsed) ? parsed : displayValue;
}

function normalizeAddress(value: string | number) {
  return String(value).trim().replace(/^0+/, "");
}

function deterministicRatio(tick: number, seed: number) {
  const value = Math.sin(tick * 12.9898 + seed * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function decimalsFromFormat(format: string) {
  const index = format.indexOf(".");
  return index === -1 ? 0 : format.length - index - 1;
}

function roundTo(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function defaultDisplayFormat(point: PointModel) {
  if (Object.keys(point.enum_map).length > 0 || point.data_type === "bool") return "enum";
  if (!isNumericPoint(point)) return "text";
  return precisionForPoint(point) > 0 ? `0.${"0".repeat(precisionForPoint(point))}` : "0";
}

function precisionForPoint(point: PointModel) {
  if (String(point.default_value).includes(".")) return 1;
  if (point.scale > 0 && point.scale < 1) return Math.min(3, Math.ceil(Math.abs(Math.log10(point.scale))));
  if (["float", "float32"].includes(point.data_type)) return 2;
  return 0;
}

function isNumericPoint(point: PointModel) {
  return ["uint16", "int16", "uint32", "int32", "float", "float32", "number"].includes(point.data_type);
}

function isButtonPoint(point: PointModel) {
  return point.data_type === "bool" || Object.keys(point.enum_map).length > 0 || point.name.includes("启动") || point.name.includes("停止");
}

function findDeviceInstanceId(point: PointModel, instances: ScadaDeviceInstance[] = []) {
  return instances.find((instance) => instance.deviceType === point.device_type)?.id ?? inferDeviceInstanceId(point);
}

function inferDeviceInstanceId(point: PointModel) {
  return `${slug(point.device_type || "device")}-1`;
}

function dominantDeviceType(points: PointModel[], fallback: string) {
  const counts = new Map<string, number>();
  for (const point of points) {
    counts.set(point.device_type, (counts.get(point.device_type) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? fallback;
}

function pageIdFor(pageName: string, deviceType: string) {
  const normalized = deviceType.trim().toUpperCase();
  if (normalized === "PCS" && pageName.includes("实时")) return "scada-pcs-realtime";
  if (normalized === "BMS" && pageName.includes("实时")) return "scada-bms-realtime";
  return `scada-${slug(pageName)}`;
}

function colorForLabel(label: string) {
  if (label.includes("运行") || label.includes("正常") || label.includes("允许")) return "green";
  if (label.includes("故障") || label.includes("严重")) return "red";
  if (label.includes("告警") || label.includes("预警")) return "amber";
  if (label.includes("充电")) return "blue";
  if (label.includes("放电")) return "cyan";
  if (label.includes("待机") || label.includes("停机")) return "gray";
  return "cyan";
}

function coerceEnumValue(value: string) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
}

function uniqueBy<T>(items: T[], keyOf: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function slug(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/实时数据页/g, "realtime")
      .replace(/首页摘要页/g, "home-summary")
      .replace(/液冷页/g, "liquid-cooling")
      .replace(/动环页/g, "environment")
      .replace(/电表页/g, "meter")
      .replace(/箱变页/g, "transformer")
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
      .replace(/^-+|-+$/g, "") || "scada"
  );
}
