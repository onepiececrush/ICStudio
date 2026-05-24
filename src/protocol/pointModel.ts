import type { ImportedProtocolTable } from "./importer";

export const pointFieldMappingTemplateSchemaVersion = "point-field-mapping-template/v1" as const;

export type PointDataType = "bool" | "uint16" | "int16" | "uint32" | "int32" | "float" | "string" | string;
export type PointRw = "R" | "W" | "R/W" | string;
export type PointArea = "coil" | "discrete_input" | "input_register" | "holding_register" | string;

export type PointModel = {
  point_id: string;
  device_type: string;
  area: PointArea;
  address: number;
  name: string;
  data_type: PointDataType;
  word_count: number;
  byte_order: string;
  scale: number;
  offset: number;
  unit: string;
  rw: PointRw;
  min?: number;
  max?: number;
  default_value: number | string | boolean;
  enum_map: Record<string, string>;
  bit_define: Record<string, string>;
  remark: string;
  group: string;
  page: string;
  poll_cycle: number;
  simulate_rule: string;
};

export type PointFieldKey = keyof PointModel;
export type PointFieldMapping = Partial<Record<PointFieldKey, string>>;

export type PointFieldMappingTemplate = {
  schemaVersion: typeof pointFieldMappingTemplateSchemaVersion;
  id: string;
  name: string;
  sourceKind: ImportedProtocolTable["source"]["kind"] | string;
  headers: string[];
  mapping: PointFieldMapping;
  createdAt: string;
};

export type ProtocolImportMeta = {
  protocolId: string;
  name: string;
  version: string;
  deviceType: string;
  vendor: string;
  sourceFile: string;
};

export type ProtocolModel = {
  protocolId?: string;
  id: string;
  name: string;
  version: string;
  vendor: string;
  deviceType?: string;
  device_type: string;
  sourceFile?: string;
  source_file: string;
  point_count: number;
  points: PointModel[];
};

export type DeviceTemplate = {
  id: string;
  name: string;
  deviceType?: string;
  device_type: string;
  vendor?: string;
  protocolId?: string;
  protocol_id: string;
  pointIds: string[];
};

export type RegisterTable = {
  protocol_id: string;
  rows: Array<Pick<PointModel, "point_id" | "area" | "address" | "word_count" | "data_type" | "rw" | "scale" | "offset" | "unit">>;
};

export type RealtimePageConfig = {
  protocol_id: string;
  pages: Array<{ name: string; groups: Array<{ name: string; pointIds: string[] }>; pointIds: string[] }>;
};

export type SimulationModel = {
  protocol_id: string;
  registers: Array<Pick<PointModel, "point_id" | "area" | "address" | "word_count" | "data_type" | "byte_order" | "scale" | "offset" | "default_value" | "simulate_rule">>;
};

export type ProtocolImportArtifacts = {
  protocolModel: ProtocolModel;
  pointModels: PointModel[];
  deviceTemplate: DeviceTemplate;
  registerTable: RegisterTable;
  realtimePageConfig: RealtimePageConfig;
  simulationModel: SimulationModel;
};

export type PointValidationSeverity = "error" | "warning" | "info";
export type PointValidationItem = {
  severity: PointValidationSeverity;
  code: string;
  message: string;
  pointId?: string;
  address?: number;
};
export type PointValidationResult = {
  status: "valid" | "warning" | "error";
  canImport: boolean;
  items: PointValidationItem[];
};

const pointFieldAliases: Record<PointFieldKey, string[]> = {
  point_id: ["point_id", "pointid", "点位id", "点位编号"],
  device_type: ["device_type", "devicetype", "设备类型"],
  area: ["area", "区", "寄存器区", "功能区", "功能码", "function code", "function_code", "fc"],
  address: ["地址", "寄存器地址", "register address", "register_address", "address", "addr", "offset"],
  name: ["名称", "点位名称", "变量名称", "寄存器名称", "register name", "register_name", "name", "tag", "label"],
  data_type: ["数据类型", "类型", "data_type", "datatype", "data type", "type"],
  word_count: ["大小", "字数", "字长", "长度", "寄存器数量", "word_count", "wordcount", "words"],
  byte_order: ["字节序", "大小端", "端序", "byte_order", "byteorder"],
  scale: ["倍率", "系数", "比例", "scale", "ratio", "multiplier", "factor"],
  offset: ["偏移", "偏移量", "offset"],
  unit: ["单位", "unit", "engineering unit", "engineering_unit", "scale unit", "scale_unit", "倍率单位", "比例单位"],
  rw: ["读写权限", "读写属性", "读写", "权限", "read write", "read_write", "rw", "access"],
  min: ["最小值", "下限", "min"],
  max: ["最大值", "上限", "max"],
  default_value: ["默认值", "初始值", "default", "default_value", "initial"],
  enum_map: ["枚举", "枚举值", "enum", "enum_map"],
  bit_define: ["bit位", "bit 位", "位定义", "bit", "bits", "bit_define"],
  remark: ["备注", "说明", "描述", "remark", "comment", "description"],
  group: ["分组", "组", "group", "category"],
  page: ["页面", "页面名称", "page", "view"],
  poll_cycle: ["轮询周期", "轮询", "轮询ms", "poll_cycle", "pollcycle", "poll ms", "poll_ms"],
  simulate_rule: ["仿真规则", "模拟规则", "simulate_rule", "simulaterule"],
};

export function createPointFieldMapping(headers: string[]): PointFieldMapping {
  const entries = (Object.keys(pointFieldAliases) as PointFieldKey[]).flatMap((key) => {
    const header = findHeader(headers, pointFieldAliases[key]);
    return header ? [[key, header] as const] : [];
  });
  return Object.fromEntries(entries) as PointFieldMapping;
}

export function createPointFieldMappingTemplate(input: {
  id: string;
  name: string;
  sourceKind: PointFieldMappingTemplate["sourceKind"];
  headers: string[];
  mapping: PointFieldMapping;
}): PointFieldMappingTemplate {
  return {
    schemaVersion: pointFieldMappingTemplateSchemaVersion,
    id: input.id,
    name: input.name,
    sourceKind: input.sourceKind,
    headers: [...input.headers],
    mapping: keepMappedHeaders(input.mapping, input.headers),
    createdAt: new Date("2026-05-23T00:00:00.000Z").toISOString(),
  };
}

export function serializePointFieldMappingTemplates(templates: PointFieldMappingTemplate[]): string {
  return `${JSON.stringify(templates, null, 2)}\n`;
}

export function parsePointFieldMappingTemplates(content: string): PointFieldMappingTemplate[] {
  const parsed = JSON.parse(content) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isPointFieldMappingTemplate).map((template) => ({
    ...template,
    headers: [...template.headers],
    mapping: keepMappedHeaders(template.mapping, template.headers),
  }));
}

export function applyPointFieldMappingTemplate(template: PointFieldMappingTemplate, headers: string[]): PointFieldMapping {
  return keepMappedHeaders(template.mapping, headers, { allowNormalizedMatch: true });
}

export function generateProtocolImportArtifacts(
  meta: ProtocolImportMeta,
  table: ImportedProtocolTable,
  mapping: PointFieldMapping,
): ProtocolImportArtifacts {
  const pointModels = table.rows
    .filter((row) => isPointDataRow(row, mapping))
    .map((row, index) => mapRowToPoint(meta, row, mapping, index));
  const protocolModel: ProtocolModel = {
    protocolId: meta.protocolId,
    id: meta.protocolId,
    name: meta.name,
    version: meta.version,
    vendor: meta.vendor,
    deviceType: meta.deviceType,
    device_type: meta.deviceType,
    sourceFile: meta.sourceFile,
    source_file: meta.sourceFile,
    point_count: pointModels.length,
    points: pointModels,
  };

  return {
    protocolModel,
    pointModels,
    deviceTemplate: {
      id: `${meta.protocolId}-device-template`,
      name: `${meta.name}设备模板`,
      deviceType: meta.deviceType,
      device_type: meta.deviceType,
      vendor: meta.vendor,
      protocolId: meta.protocolId,
      protocol_id: meta.protocolId,
      pointIds: pointModels.map((point) => point.point_id),
    },
    registerTable: {
      protocol_id: meta.protocolId,
      rows: pointModels.map((point) => ({
        point_id: point.point_id,
        area: point.area,
        address: point.address,
        word_count: point.word_count,
        data_type: point.data_type,
        rw: point.rw,
        scale: point.scale,
        offset: point.offset,
        unit: point.unit,
      })),
    },
    realtimePageConfig: createRealtimePageConfig(meta.protocolId, pointModels),
    simulationModel: {
      protocol_id: meta.protocolId,
      registers: pointModels.map((point) => ({
        point_id: point.point_id,
        area: point.area,
        address: point.address,
        word_count: point.word_count,
        data_type: point.data_type,
        byte_order: point.byte_order,
        scale: point.scale,
        offset: point.offset,
        default_value: point.default_value,
        simulate_rule: point.simulate_rule,
      })),
    },
  };
}

export function validatePointModels(points: PointModel[]): PointValidationResult {
  const items: PointValidationItem[] = [];
  if (points.length === 0) {
    items.push({ severity: "error", code: "POINT_EMPTY", message: "导入预览没有任何点位，不能确认导入。" });
  }
  for (const point of points) validateOnePoint(point, items);
  validatePointAddressDuplicates(points, items);
  validatePointAddressOverlaps(points, items);

  if (!items.some((item) => item.severity === "info")) {
    items.push({ severity: "info", code: "POINTMODEL_READY", message: "协议已归一化为统一 PointModel，可生成协议模型、寄存器表、实时监控和从机模拟模型。" });
  }

  const hasErrors = items.some((item) => item.severity === "error");
  const hasWarnings = items.some((item) => item.severity === "warning");
  return { status: hasErrors ? "error" : hasWarnings ? "warning" : "valid", canImport: !hasErrors, items };
}

function mapRowToPoint(meta: ProtocolImportMeta, row: Record<string, string>, mapping: PointFieldMapping, index: number): PointModel {
  const unitAndScale = parseScaleAndUnit(readMappedCell(row, mapping.unit));
  const explicitScale = parseOptionalNumber(readMappedCell(row, mapping.scale));
  const remark = readMappedCell(row, mapping.remark);
  const name = readMappedCell(row, mapping.name) || `点位 ${index + 1}`;
  const dataType = normalizePointDataType(readMappedCell(row, mapping.data_type)) || (isReservedPointName(name) ? "uint16" : "");
  const wordCount = parseWordCount(readMappedCell(row, mapping.word_count), wordCountForPointType(dataType));
  const address = normalizeAddress(readMappedCell(row, mapping.address));
  const range = parseRange(remark);
  const pointId = readMappedCell(row, mapping.point_id) || `${normalizePointPrefix(meta.deviceType || meta.protocolId)}-${Number.isFinite(address) ? address : "missing"}-${index}`;

  return {
    point_id: pointId,
    device_type: readMappedCell(row, mapping.device_type) || meta.deviceType,
    area: normalizeArea(readMappedCell(row, mapping.area), address),
    address,
    name,
    data_type: dataType,
    word_count: wordCount,
    byte_order: normalizeByteOrder(readMappedCell(row, mapping.byte_order), dataType),
    scale: explicitScale ?? unitAndScale.scale,
    offset: parseOptionalNumber(readMappedCell(row, mapping.offset)) ?? 0,
    unit: unitAndScale.unit || readMappedCell(row, mapping.unit),
    rw: normalizeRw(readMappedCell(row, mapping.rw)),
    min: parseOptionalNumber(readMappedCell(row, mapping.min)) ?? range?.min,
    max: parseOptionalNumber(readMappedCell(row, mapping.max)) ?? range?.max,
    default_value: parseDefaultValue(readMappedCell(row, mapping.default_value), dataType),
    enum_map: { ...parseEnumMap(remark), ...parseEnumMap(readMappedCell(row, mapping.enum_map)) },
    bit_define: { ...parseBitDefine(remark), ...parseBitDefine(readMappedCell(row, mapping.bit_define)) },
    remark,
    group: readMappedCell(row, mapping.group) || "默认分组",
    page: readMappedCell(row, mapping.page) || "默认页面",
    poll_cycle: parsePositiveInteger(readMappedCell(row, mapping.poll_cycle), 1000),
    simulate_rule: readMappedCell(row, mapping.simulate_rule) || "fixed",
  };
}

function isPointDataRow(row: Record<string, string>, mapping: PointFieldMapping) {
  return Boolean(
    readMappedCell(row, mapping.name)
    || readMappedCell(row, mapping.data_type)
    || readMappedCell(row, mapping.rw),
  );
}

function validateOnePoint(point: PointModel, items: PointValidationItem[]) {
  const context = { pointId: point.point_id, address: point.address };
  if (!Number.isFinite(point.address)) items.push({ ...context, severity: "error", code: "ADDRESS_REQUIRED", message: `${point.name} 地址为空或格式无法识别。` });
  if (!point.data_type) items.push({ ...context, severity: "error", code: "DATA_TYPE_REQUIRED", message: `${point.name} 数据类型缺失。` });
  const expectedWords = wordCountForPointType(point.data_type);
  if (point.data_type && point.data_type !== "string" && point.word_count < expectedWords) {
    items.push({ ...context, severity: "error", code: "WORD_COUNT_MISMATCH", message: `${point.name} ${point.data_type} 至少需要 ${expectedWords} 个寄存器，当前为 ${point.word_count}。` });
  }
  if (!point.rw) items.push({ ...context, severity: "error", code: "RW_REQUIRED", message: `${point.name} 读写属性缺失。` });
  else if (!["R", "W", "R/W"].includes(point.rw)) items.push({ ...context, severity: "error", code: "RW_INVALID", message: `${point.name} 读写属性非法：${point.rw}。` });
  if (!Number.isFinite(point.scale) || point.scale <= 0 || Math.abs(point.scale) > 1_000_000 || Math.abs(point.scale) < 0.000001) {
    items.push({ ...context, severity: "warning", code: "SCALE_ABNORMAL", message: `${point.name} 倍率异常：${point.scale}。` });
  }
  if (!point.unit && point.data_type !== "bool" && point.data_type !== "bitfield") {
    items.push({ ...context, severity: "warning", code: "UNIT_MISSING", message: `${point.name} 单位缺失，请确认是否为无量纲点位。` });
  }
  if (point.min !== undefined && point.max !== undefined && point.min > point.max) {
    items.push({ ...context, severity: "error", code: "RANGE_INVALID", message: `${point.name} 最小值大于最大值。` });
  }
  for (const [value, label] of Object.entries(point.enum_map)) {
    if (value.startsWith("__invalid_enum_") || !label) items.push({ ...context, severity: "warning", code: "ENUM_FORMAT_INVALID", message: `${point.name} 枚举格式异常。` });
  }
  for (const [bit, label] of Object.entries(point.bit_define)) {
    if (bit.startsWith("__duplicate_bit_") || label.includes(" / ")) {
      items.push({ ...context, severity: "error", code: "BIT_DUPLICATE", message: `${point.name} bit 位重复：${bit.replace("__duplicate_bit_", "")}。` });
      continue;
    }
    const parsed = Number(bit);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed >= Math.max(point.word_count, 1) * 16) {
      items.push({ ...context, severity: "error", code: "BIT_OUT_OF_RANGE", message: `${point.name} bit${bit} 超出合法范围。` });
    }
  }
}

function validatePointAddressDuplicates(points: PointModel[], items: PointValidationItem[]) {
  const seen = new Map<string, PointModel>();
  for (const point of points) {
    if (!Number.isFinite(point.address)) continue;
    const key = `${point.area}:${point.address}`;
    const previous = seen.get(key);
    if (previous) items.push({ severity: "error", code: "ADDRESS_DUPLICATE", message: `${point.name} 与 ${previous.name} 在 ${point.area} 地址重复：${point.address}。`, pointId: point.point_id, address: point.address });
    else seen.set(key, point);
  }
}

function validatePointAddressOverlaps(points: PointModel[], items: PointValidationItem[]) {
  const spans = points
    .filter((point) => Number.isFinite(point.address))
    .map((point) => ({ point, start: point.address, end: point.address + Math.max(Math.floor(point.word_count), 1) - 1 }))
    .sort((left, right) => left.point.area.localeCompare(right.point.area) || left.start - right.start || left.point.point_id.localeCompare(right.point.point_id));
  for (let currentIndex = 1; currentIndex < spans.length; currentIndex += 1) {
    const current = spans[currentIndex];
    if (!current) continue;
    for (let previousIndex = 0; previousIndex < currentIndex; previousIndex += 1) {
      const previous = spans[previousIndex];
      if (!previous) continue;
      if (previous.point.area !== current.point.area) continue;
      if (previous.end < current.start) continue;
      if (current.point.address === previous.point.address) continue;
      items.push({ severity: "error", code: "ADDRESS_OVERLAP", message: `${current.point.name} 与 ${previous.point.name} 在 ${current.point.area} 地址范围冲突。`, pointId: current.point.point_id, address: current.point.address });
      break;
    }
  }
}

function createRealtimePageConfig(protocolId: string, points: PointModel[]): RealtimePageConfig {
  const pages = new Map<string, Map<string, string[]>>();
  for (const point of points) {
    const groups = pages.get(point.page) ?? new Map<string, string[]>();
    const pointIds = groups.get(point.group) ?? [];
    pointIds.push(point.point_id);
    groups.set(point.group, pointIds);
    pages.set(point.page, groups);
  }
  return {
    protocol_id: protocolId,
    pages: [...pages.entries()].map(([name, groups]) => {
      const groupEntries = [...groups.entries()].map(([groupName, pointIds]) => ({ name: groupName, pointIds }));
      return { name, groups: groupEntries, pointIds: groupEntries.flatMap((group) => group.pointIds) };
    }),
  };
}

function keepMappedHeaders(mapping: PointFieldMapping, headers: string[], options: { allowNormalizedMatch?: boolean } = {}): PointFieldMapping {
  const headerSet = new Set(headers);
  const normalizedHeaderMap = new Map(headers.map((header) => [normalizeHeader(header), header]));
  const kept: PointFieldMapping = {};
  for (const key of Object.keys(mapping) as PointFieldKey[]) {
    const header = mapping[key];
    if (header && headerSet.has(header)) kept[key] = header;
    else if (header && options.allowNormalizedMatch) {
      const normalizedHeader = normalizedHeaderMap.get(normalizeHeader(header));
      if (normalizedHeader) kept[key] = normalizedHeader;
    }
  }
  return kept;
}

function isPointFieldMappingTemplate(value: unknown): value is PointFieldMappingTemplate {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Partial<PointFieldMappingTemplate>;
  return candidate.schemaVersion === pointFieldMappingTemplateSchemaVersion
    && typeof candidate.id === "string"
    && typeof candidate.name === "string"
    && Array.isArray(candidate.headers)
    && typeof candidate.mapping === "object"
    && candidate.mapping !== null;
}

function findHeader(headers: string[], aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeHeader);
  return headers.find((header) => normalizedAliases.includes(normalizeHeader(header)));
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s_\-()（）/]/g, "");
}

function readMappedCell(row: Record<string, string>, header?: string) {
  if (!header) return "";
  return row[header]?.trim() ?? "";
}

function normalizePointPrefix(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "device";
}

function isReservedPointName(value: string) {
  return /预留|reserved/i.test(value.trim());
}

function normalizeAddress(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return Number.NaN;
  if (/^0x[0-9a-f]+$/i.test(trimmed)) return Number.parseInt(trimmed, 16);
  if (/^[0-9a-f]+h$/i.test(trimmed)) return Number.parseInt(trimmed.replace(/h$/i, ""), 16);
  const prefixMatch = trimmed.match(/^([0134])x\s*(\d+)$/i);
  if (prefixMatch) return Number(`${prefixMatch[1]}${prefixMatch[2].padStart(4, "0")}`);
  const modbusMatch = trimmed.match(/(?:^|\D)([0134]\d{4,5})(?:\D|$)/);
  if (modbusMatch) return Number(modbusMatch[1]);
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizeArea(value: string, address: number): PointArea {
  const normalized = value.trim().toLowerCase();
  if (["1", "01", "0x01", "fc1", "fc01", "function1", "function01"].includes(normalized)) return "coil";
  if (["2", "02", "0x02", "fc2", "fc02", "function2", "function02"].includes(normalized)) return "discrete_input";
  if (["3", "03", "0x03", "fc3", "fc03", "function3", "function03"].includes(normalized)) return "holding_register";
  if (["4", "04", "0x04", "fc4", "fc04", "function4", "function04"].includes(normalized)) return "input_register";
  if (["coil", "coils", "线圈"].includes(normalized)) return "coil";
  if (["discrete_input", "discreteinput", "离散输入"].includes(normalized)) return "discrete_input";
  if (["input_register", "inputregister", "输入寄存器"].includes(normalized)) return "input_register";
  if (["holding_register", "holdingregister", "保持寄存器"].includes(normalized)) return "holding_register";
  if (Number.isFinite(address)) {
    const text = String(Math.trunc(address));
    if (text.startsWith("0")) return "coil";
    if (text.startsWith("1")) return "discrete_input";
    if (text.startsWith("3")) return "input_register";
  }
  return "holding_register";
}

function normalizePointDataType(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[\s_\-]+/g, "");
  if (!normalized) return "";
  if (["ieeefloat", "ieee754", "float32", "single", "real", "float"].includes(normalized)) return "float";
  if (["uint16", "u16", "ushort", "unsigned16", "unsigned16bit", "unsignedshort", "word"].includes(normalized)) return "uint16";
  if (["int16", "i16", "short", "signed16", "signed16bit", "signedshort"].includes(normalized)) return "int16";
  if (["uint32", "u32", "dword", "unsigned32", "unsigned32bit", "unsigneddouble", "unsignedinteger"].includes(normalized)) return "uint32";
  if (["int32", "i32", "integer", "signed32", "signed32bit", "signeddouble", "signedinteger"].includes(normalized)) return "int32";
  if (["bool", "boolean", "bit"].includes(normalized)) return "bool";
  return normalized;
}

function wordCountForPointType(dataType: string) {
  return ["float", "float32", "uint32", "int32"].includes(dataType) ? 2 : 1;
}

function defaultByteOrder(dataType: string) {
  return ["float", "float32", "uint32", "int32"].includes(dataType) ? "ABCD" : "AB";
}

function normalizeByteOrder(value: string, dataType: string) {
  const normalized = value.trim().toLowerCase().replace(/[\s_\-]+/g, "");
  if (!normalized) return defaultByteOrder(dataType);
  if (["ab", "abcd", "bigendian", "big", "msbfirst", "highbytefirst"].includes(normalized)) return ["float", "float32", "uint32", "int32"].includes(dataType) ? "ABCD" : "AB";
  if (["ba", "dcba", "littleendian", "little", "lsbfirst", "lowbytefirst"].includes(normalized)) return ["float", "float32", "uint32", "int32"].includes(dataType) ? "DCBA" : "BA";
  if (["cdab", "wordswap", "wordswap", "wordreversed", "modbusswap"].includes(normalized)) return "CDAB";
  if (["badc", "byteswap", "byteswapword"].includes(normalized)) return "BADC";
  return value.trim();
}

function normalizeRw(value: string): PointRw {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "");
  if (["r", "ro", "read", "readonly", "只读", "读"].includes(normalized)) return "R";
  if (["w", "wo", "write", "writeonly", "只写", "写"].includes(normalized)) return "W";
  if (["rw", "r/w", "r+w", "readwrite", "read/write", "read-write", "读写", "可读写"].includes(normalized)) return "R/W";
  return value.trim();
}

function parseScaleAndUnit(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return { scale: 1, unit: "" };
  const suffixScaleMatch = trimmed.match(/^(.+?)\s*(?:\(([-+]?\d+(?:\.\d+)?)\)|[x×*]\s*([-+]?\d+(?:\.\d+)?))$/i);
  if (suffixScaleMatch) return { scale: Number(suffixScaleMatch[2] ?? suffixScaleMatch[3]), unit: suffixScaleMatch[1].trim() };
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*(.*)$/);
  if (!match) return { scale: 1, unit: trimmed };
  return { scale: Number(match[1]), unit: match[2].trim() };
}

function parseRange(value: string) {
  const match = value.match(/(?:范围|range)?\s*[:：]?\s*(-?\d+(?:\.\d+)?)\s*(?:~|-|至|\.\.)\s*(-?\d+(?:\.\d+)?)/i);
  if (match) return { min: Number(match[1]), max: Number(match[2]) };
  const comparisonMatch = value.match(/(?:>=|≥)\s*(-?\d+(?:\.\d+)?)[\s\S]*?(?:<=|≤)\s*(-?\d+(?:\.\d+)?)/i);
  if (comparisonMatch) return { min: Number(comparisonMatch[1]), max: Number(comparisonMatch[2]) };
  const namedMatch = value.match(/(?:min|最小值?|下限)\s*[:：=]?\s*(-?\d+(?:\.\d+)?)[\s\S]*?(?:max|最大值?|上限)\s*[:：=]?\s*(-?\d+(?:\.\d+)?)/i);
  if (namedMatch) return { min: Number(namedMatch[1]), max: Number(namedMatch[2]) };
  return undefined;
}

function parseEnumMap(value: string) {
  const enumMap: Record<string, string> = {};
  for (const match of value.matchAll(/(?:^|[;；,，\s])(?<!bit)(-?\d+)\s*[=：:]\s*([^;；,，\s]+)/gi)) {
    const enumValue = match[1];
    if (enumMap[enumValue] !== undefined) enumMap[`__invalid_enum_duplicate_${enumValue}`] = `${enumValue}=${match[2].trim()}`;
    enumMap[enumValue] = match[2].trim();
  }
  let invalidIndex = 0;
  for (const fragment of value.split(/[;；,，]/)) {
    const trimmed = fragment.trim();
    if (!trimmed || /^bit\s*\d+/i.test(trimmed)) continue;
    if (/^-?\d+\s*[=：:]\s*\S+/.test(trimmed)) continue;
    if (/^-?\d+\s*\S+/.test(trimmed)) {
      enumMap[`__invalid_enum_${invalidIndex}`] = trimmed;
      invalidIndex += 1;
    }
  }
  return enumMap;
}

function parseBitDefine(value: string) {
  const bitDefine: Record<string, string> = {};
  for (const match of value.matchAll(/bit\s*(\d+)\s*[=：:]\s*([^;；,，\s]+)/gi)) {
    const bit = match[1];
    const label = match[2].trim();
    if (bitDefine[bit]) {
      if (bitDefine[bit] !== label) bitDefine[bit] = `${bitDefine[bit]} / ${label}`;
      bitDefine[`__duplicate_bit_${bit}`] = label;
    } else {
      bitDefine[bit] = label;
    }
  }
  return bitDefine;
}

function parseDefaultValue(value: string, dataType: string): PointModel["default_value"] {
  if (!value.trim()) return dataType === "bool" ? false : dataType === "string" ? "" : 0;
  if (dataType === "bool") return ["1", "true", "是", "开"].includes(value.trim().toLowerCase());
  if (dataType === "string") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

function parseWordCount(value: string, fallback: number) {
  if (!value.trim()) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parsePositiveInteger(value: string, fallback: number) {
  if (!value.trim()) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseOptionalNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
