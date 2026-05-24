import {
  deviceProfileSchemaVersion,
  type DeviceProfile,
  type DeviceRegister,
  type ProfileSource,
  type RegisterAccess,
  type RegisterBitDefinition,
  type RegisterEnumOption,
  type RegisterRange,
  type SimulationScenario,
} from "./deviceProfile";
import type { ImportedProtocolTable } from "./importer";

export type DeviceProfileMeta = Pick<DeviceProfile, "id" | "name" | "version" | "deviceType" | "vendor" | "communicationType">;

export type ProfileFieldKey =
  | "address"
  | "name"
  | "functionCode"
  | "access"
  | "dataType"
  | "length"
  | "scale"
  | "unit"
  | "range"
  | "enum"
  | "bits"
  | "description"
  | "group";

export type FieldMapping = Record<ProfileFieldKey, string | undefined>;

export type ProtocolFieldDefinition = {
  key: ProfileFieldKey;
  label: string;
  aliases: string[];
  required: boolean;
};

export const protocolFieldDefinitions: ProtocolFieldDefinition[] = [
  { key: "address", label: "地址", aliases: ["地址", "寄存器地址", "address", "addr", "offset"], required: true },
  { key: "name", label: "名称", aliases: ["名称", "变量名称", "点位名称", "name", "tag", "label"], required: true },
  { key: "functionCode", label: "功能码", aliases: ["功能码", "functionCode", "function code", "fc"], required: true },
  { key: "access", label: "读写权限", aliases: ["读写权限", "权限", "access", "rw", "读写", "操作"], required: true },
  { key: "dataType", label: "数据类型", aliases: ["数据类型", "类型", "dataType", "type", "datatype"], required: true },
  { key: "length", label: "长度", aliases: ["长度", "寄存器数量", "字长", "length", "words"], required: true },
  { key: "scale", label: "倍率", aliases: ["倍率", "比例", "scale", "ratio", "系数"], required: false },
  { key: "unit", label: "单位", aliases: ["单位", "unit"], required: false },
  { key: "range", label: "范围", aliases: ["范围", "取值范围", "range", "limit", "上下限"], required: false },
  { key: "enum", label: "枚举", aliases: ["枚举", "枚举值", "enum", "options"], required: false },
  { key: "bits", label: "bit 位", aliases: ["bit 位", "bit", "位定义", "bits", "bit位"], required: false },
  { key: "description", label: "说明", aliases: ["说明", "描述", "备注", "description", "comment"], required: false },
  { key: "group", label: "分组", aliases: ["分组", "组", "group", "category", "sheet"], required: false },
];

export function createDefaultFieldMapping(headers: string[]): FieldMapping {
  return Object.fromEntries(
    protocolFieldDefinitions.map((definition) => [definition.key, findHeader(headers, definition.aliases)]),
  ) as FieldMapping;
}

export function applyFieldMapping(meta: DeviceProfileMeta, table: ImportedProtocolTable, mapping: FieldMapping): DeviceProfile {
  const registers = table.rows.map((row, index) => mapRowToRegister(row, index, mapping));
  const source: ProfileSource = table.source;

  return {
    schemaVersion: deviceProfileSchemaVersion,
    id: meta.id,
    name: meta.name,
    version: meta.version,
    deviceType: meta.deviceType,
    vendor: meta.vendor,
    communicationType: meta.communicationType,
    createdAt: new Date("2026-05-23T00:00:00.000Z").toISOString(),
    source,
    registers,
    scenarios: createGenericSimulationScenarios(registers),
  };
}

function createGenericSimulationScenarios(registers: DeviceRegister[]): SimulationScenario[] {
  const first = registers[0];
  const second = registers[1] ?? first;
  const third = registers[2] ?? second ?? first;
  const fourth = registers[3] ?? first;

  if (!first) {
    return [];
  }

  return [
    {
      id: "normal",
      name: "正常运行",
      description: "根据导入后的 Device Profile 批量写入正常运行值。",
      steps: compactSteps([
        { registerId: first.id, strategy: "fixed", value: first.currentValue },
        second ? { registerId: second.id, strategy: "sine", amplitude: 5, offset: numericCurrentValue(second) } : undefined,
        third ? { registerId: third.id, strategy: "random", min: third.range?.min ?? 0, max: third.range?.max ?? 100 } : undefined,
      ]),
      faultInjection: { mode: "none" },
    },
    {
      id: "standby",
      name: "待机",
      description: "将可控寄存器回落到待机或零值。",
      steps: compactSteps([
        { registerId: first.id, strategy: "fixed", value: 0 },
        second ? { registerId: second.id, strategy: "fixed", value: 0 } : undefined,
      ]),
      faultInjection: { mode: "none" },
    },
    {
      id: "charging",
      name: "充电",
      description: "用递增策略模拟充电或正向调节。",
      steps: compactSteps([
        { registerId: first.id, strategy: "fixed", value: 2 },
        second ? { registerId: second.id, strategy: "increment", step: 1 } : undefined,
      ]),
      faultInjection: { mode: "none" },
    },
    {
      id: "discharging",
      name: "放电",
      description: "用递减策略模拟放电或反向调节。",
      steps: compactSteps([
        { registerId: first.id, strategy: "fixed", value: 3 },
        second ? { registerId: second.id, strategy: "decrement", step: 1 } : undefined,
      ]),
      faultInjection: { mode: "none" },
    },
    {
      id: "fault",
      name: "故障",
      description: "批量写入故障态并返回异常码。",
      steps: compactSteps([
        { registerId: first.id, strategy: "fixed", value: 4 },
        fourth ? { registerId: fourth.id, strategy: "fixed", value: 1 } : undefined,
      ]),
      faultInjection: { mode: "exceptionCode", exceptionCode: "0x03", rate: 1 },
    },
    {
      id: "communication-abnormal",
      name: "通信异常",
      description: "保持寄存器模型不变，模拟响应超时。",
      steps: compactSteps([{ registerId: first.id, strategy: "fixed", value: 5 }]),
      faultInjection: { mode: "timeout", rate: 0.6 },
    },
    {
      id: "no-response",
      name: "不响应注入",
      description: "模拟主站请求后无响应。",
      steps: [],
      faultInjection: { mode: "noResponse", rate: 1 },
    },
    {
      id: "out-of-range",
      name: "数据越界注入",
      description: "模拟返回超出 Device Profile 范围的数据。",
      steps: compactSteps([second ? { registerId: second.id, strategy: "fixed", value: outOfRangeValue(second) } : undefined]),
      faultInjection: { mode: "outOfRange", rate: 1 },
    },
  ];
}

function compactSteps(steps: Array<SimulationScenario["steps"][number] | undefined>): SimulationScenario["steps"] {
  return steps.filter((step): step is SimulationScenario["steps"][number] => Boolean(step));
}

function numericCurrentValue(register: DeviceRegister) {
  const value = Number(register.currentValue);
  return Number.isFinite(value) ? value : 0;
}

function outOfRangeValue(register: DeviceRegister) {
  if (register.range) return register.range.max + 1;
  return numericCurrentValue(register) + 1000;
}

function mapRowToRegister(row: Record<string, string>, index: number, mapping: FieldMapping): DeviceRegister {
  const address = parseNumber(readMappedCell(row, mapping.address), Number.NaN);
  const dataType = normalizeDataType(readMappedCell(row, mapping.dataType));
  const currentValue = defaultValueForDataType(dataType);

  return {
    id: `reg-${Number.isFinite(address) ? address : "missing"}-${index}`,
    address,
    name: readMappedCell(row, mapping.name) || `未命名寄存器 ${index + 1}`,
    functionCode: normalizeFunctionCode(readMappedCell(row, mapping.functionCode)),
    access: normalizeAccess(readMappedCell(row, mapping.access)),
    dataType,
    length: parseNumber(readMappedCell(row, mapping.length), expectedLengthForType(dataType)),
    scale: parseNumber(readMappedCell(row, mapping.scale), 1),
    unit: readMappedCell(row, mapping.unit),
    range: parseRange(readMappedCell(row, mapping.range)),
    enum: parseEnum(readMappedCell(row, mapping.enum)),
    bits: parseBits(readMappedCell(row, mapping.bits)),
    description: readMappedCell(row, mapping.description),
    group: readMappedCell(row, mapping.group) || "默认分组",
    currentValue,
  };
}

function findHeader(headers: string[], aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeHeader);
  return headers.find((header) => normalizedAliases.includes(normalizeHeader(header)));
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s_\-()（）]/g, "");
}

function readMappedCell(row: Record<string, string>, header?: string) {
  if (!header) return "";
  return row[header]?.trim() ?? "";
}

function parseNumber(value: string, fallback: number) {
  if (value.trim().length === 0) return fallback;
  const cleaned = value.trim().replace(/^0x/i, "0x");
  const parsed = cleaned.startsWith("0x") ? Number.parseInt(cleaned, 16) : Number(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeFunctionCode(value: string) {
  const match = value.match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : 3;
}

function normalizeAccess(value: string): RegisterAccess | string {
  const normalized = value.trim().toLowerCase();
  if (["r", "read", "只读", "读"].includes(normalized)) return "read";
  if (["w", "write", "只写", "写"].includes(normalized)) return "write";
  if (["rw", "r/w", "readwrite", "read/write", "读写", "可读写"].includes(normalized)) return "readWrite";
  return value.trim() || "read";
}

function normalizeDataType(value: string) {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "");
  if (["uint", "u16", "ushort", "unsignedshort"].includes(normalized)) return "uint16";
  if (["int", "i16", "short"].includes(normalized)) return "int16";
  if (["float", "single", "real"].includes(normalized)) return "float32";
  return normalized || "uint16";
}

export function expectedLengthForType(dataType: string) {
  switch (dataType) {
    case "bool":
    case "bitfield":
    case "uint16":
    case "int16":
      return 1;
    case "uint32":
    case "int32":
    case "float32":
      return 2;
    default:
      return 1;
  }
}

function defaultValueForDataType(dataType: string) {
  if (dataType === "bool") return false;
  if (dataType === "string") return "";
  return 0;
}

function parseRange(value: string): RegisterRange | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const match = trimmed.match(/(-?\d+(?:\.\d+)?)\s*(?:-|~|至|\.\.)\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  return { min: Number(match[1]), max: Number(match[2]) };
}

function parseEnum(value: string): RegisterEnumOption[] {
  return splitComposite(value).flatMap((part) => {
    const match = part.match(/^\s*([^=：:]+)\s*[=：:]\s*(.+?)\s*$/);
    if (!match) return [];
    const parsed = Number(match[1]);
    return [{ value: Number.isFinite(parsed) ? parsed : match[1].trim(), label: match[2].trim() }];
  });
}

function parseBits(value: string): RegisterBitDefinition[] {
  return splitComposite(value).flatMap((part) => {
    const match = part.match(/^(?:bit)?\s*(\d+)\s*[=：:]\s*(.+?)\s*$/i);
    if (!match) return [];
    return [{ bit: Number(match[1]), label: match[2].trim() }];
  });
}

function splitComposite(value: string) {
  return value
    .split(/[;；,，|]/)
    .map((part) => part.trim())
    .filter(Boolean);
}
