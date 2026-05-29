import assert from "node:assert/strict";
import test from "node:test";
import { standardizeImportedProtocol, standardizeImportedProtocolAsync } from "../src/protocol/importer";
import { applyFieldMapping, createDefaultFieldMapping, protocolFieldDefinitions } from "../src/protocol/fieldMapper";
import { countValidationBySeverity, validateDeviceProfile } from "../src/protocol/validator";
import { formatSimulatorRegisterEditorValue, parseSimulatorRegisterInput } from "../src/simulator/registerValue";
import { buildModbusTcpWriteSingleRegisterFrame, createSimulatorEngine } from "../src/simulator/simulatorEngine";
import type { DeviceProfile, DeviceRegister } from "../src/protocol/deviceProfile";


function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function le16(value: number) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function le32(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function concatBytes(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function textBytes(value: string) {
  return new TextEncoder().encode(value);
}

async function deflateRaw(bytes: Uint8Array) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function createDeflatedZip(files: Record<string, string>) {
  return createZip(files, async (data) => ({ method: 8, bytes: await deflateRaw(data) }));
}

function createStoredZip(files: Record<string, string>) {
  return createZip(files, async (data) => ({ method: 0, bytes: data }));
}

async function createZip(files: Record<string, string>, encode: (data: Uint8Array) => Promise<{ method: number; bytes: Uint8Array }>) {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = textBytes(name);
    const data = textBytes(content);
    const encoded = await encode(data);
    const crc = crc32(data);
    const local = concatBytes([
      le32(0x04034b50), le16(20), le16(0), le16(encoded.method), le16(0), le16(0), le32(crc), le32(encoded.bytes.length), le32(data.length), le16(nameBytes.length), le16(0), nameBytes, encoded.bytes,
    ]);
    const central = concatBytes([
      le32(0x02014b50), le16(20), le16(20), le16(0), le16(encoded.method), le16(0), le16(0), le32(crc), le32(encoded.bytes.length), le32(data.length), le16(nameBytes.length), le16(0), le16(0), le16(0), le16(0), le32(0), le32(offset), nameBytes,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralDirectory = concatBytes(centrals);
  const end = concatBytes([
    le32(0x06054b50), le16(0), le16(0), le16(centrals.length), le16(centrals.length), le32(centralDirectory.length), le32(offset), le16(0),
  ]);
  return concatBytes([...locals, centralDirectory, end]);
}

function minimalXlsxFiles() {
  return {
    "xl/sharedStrings.xml": `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>地址</t></si><si><t>名称</t></si><si><t>功能码</t></si><si><t>读写权限</t></si><si><t>数据类型</t></si><si><t>长度</t></si><si><t>40010</t></si><si><t>电压采样</t></si><si><t>03</t></si><si><t>R</t></si><si><t>uint16</t></si><si><t>1</t></si></sst>`,
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c><c r="F1" t="s"><v>5</v></c></row><row r="2"><c r="A2" t="s"><v>6</v></c><c r="B2" t="s"><v>7</v></c><c r="C2" t="s"><v>8</v></c><c r="D2" t="s"><v>9</v></c><c r="E2" t="s"><v>10</v></c><c r="F2" t="s"><v>11</v></c></row></sheetData></worksheet>`,
  };
}

async function createMinimalXlsx() {
  return createStoredZip(minimalXlsxFiles());
}

async function createMinimalDeflatedXlsx() {
  return createDeflatedZip(minimalXlsxFiles());
}

test("imports CSV rows, maps localized columns, and emits a unified Device Profile JSON", () => {
  const csv = `地址,名称,功能码,读写权限,数据类型,长度,倍率,单位,范围,枚举,bit 位,说明,分组\n40001,运行状态,03,R,uint16,1,1,,0-3,0=待机;1=运行,,设备运行状态,状态\n40002,目标功率,06,RW,int16,1,0.1,kW,-500-500,,,功率目标,控制`;

  const imported = standardizeImportedProtocol({ fileName: "generic.csv", fileType: "csv", content: csv });
  const mapping = createDefaultFieldMapping(imported.headers);
  const profile = applyFieldMapping(
    {
      id: "generic-device-v1",
      name: "通用设备协议",
      version: "1.0.0",
      deviceType: "通用设备",
      vendor: "开放协议实验室",
      communicationType: "Modbus TCP",
    },
    imported,
    mapping,
  );

  assert.deepEqual(protocolFieldDefinitions.map((field) => field.key), [
    "address",
    "name",
    "functionCode",
    "access",
    "dataType",
    "length",
    "scale",
    "unit",
    "range",
    "enum",
    "bits",
    "description",
    "group",
  ]);
  assert.equal(profile.schemaVersion, "device-profile/v1");
  assert.equal(profile.source.kind, "csv");
  assert.equal(profile.registers.length, 2);
  assert.deepEqual(profile.registers[0], {
    id: "reg-40001-0",
    address: 40001,
    name: "运行状态",
    functionCode: 3,
    access: "read",
    dataType: "uint16",
    length: 1,
    scale: 1,
    unit: "",
    range: { min: 0, max: 3 },
    enum: [
      { value: 0, label: "待机" },
      { value: 1, label: "运行" },
    ],
    bits: [],
    description: "设备运行状态",
    group: "状态",
    currentValue: 0,
  });
  assert.equal(JSON.parse(JSON.stringify(profile)).registers[1].name, "目标功率");
  assert.deepEqual(profile.scenarios.map((scenario) => scenario.name), [
    "正常运行",
    "待机",
    "充电",
    "放电",
    "故障",
    "通信异常",
    "不响应注入",
    "数据越界注入",
  ]);
  assert.deepEqual(
    Array.from(new Set(profile.scenarios.flatMap((scenario) => scenario.steps.map((step) => step.strategy)))),
    ["fixed", "sine", "random", "increment", "decrement"],
  );
  assert.deepEqual(profile.scenarios.map((scenario) => scenario.faultInjection.mode), [
    "none",
    "none",
    "none",
    "none",
    "exceptionCode",
    "timeout",
    "noResponse",
    "outOfRange",
  ]);
});



test("imports JSON protocol rows through the same field mapping flow", () => {
  const content = JSON.stringify({
    registers: [
      {
        address: "42001",
        name: "JSON 导入值",
        functionCode: "03",
        access: "RW",
        dataType: "uint16",
        length: "1",
        scale: "1",
        unit: "%",
        range: "0-100",
        enum: "0=低;1=高",
        bits: "bit0=有效",
        description: "JSON 来源",
        group: "JSON 分组",
      },
    ],
  });

  const imported = standardizeImportedProtocol({ fileName: "generic.json", fileType: "json", content });
  const mapping = createDefaultFieldMapping(imported.headers);
  const profile = applyFieldMapping(
    {
      id: "json-device-v1",
      name: "JSON 导入协议",
      version: "1.0.0",
      deviceType: "通用设备",
      vendor: "开放协议实验室",
      communicationType: "Custom TCP",
    },
    imported,
    mapping,
  );

  assert.equal(imported.source.kind, "json");
  assert.equal(profile.registers[0].address, 42001);
  assert.equal(profile.registers[0].access, "readWrite");
  assert.deepEqual(profile.registers[0].range, { min: 0, max: 100 });
  assert.deepEqual(profile.registers[0].enum, [{ value: 0, label: "低" }, { value: 1, label: "高" }]);
  assert.deepEqual(profile.registers[0].bits, [{ bit: 0, label: "有效" }]);
});

test("imports XLSX workbook bytes into the same mapping pipeline", async () => {
  const imported = standardizeImportedProtocol({ fileName: "generic.xlsx", fileType: "excel", content: await createMinimalXlsx() });
  const mapping = createDefaultFieldMapping(imported.headers);
  const profile = applyFieldMapping(
    {
      id: "xlsx-device-v1",
      name: "Excel 导入协议",
      version: "1.0.0",
      deviceType: "通用设备",
      vendor: "开放协议实验室",
      communicationType: "Modbus RTU",
    },
    imported,
    mapping,
  );

  assert.equal(imported.source.kind, "excel");
  assert.deepEqual(imported.headers, ["地址", "名称", "功能码", "读写权限", "数据类型", "长度"]);
  assert.equal(profile.registers.length, 1);
  assert.equal(profile.registers[0].address, 40010);
  assert.equal(profile.registers[0].name, "电压采样");
  assert.equal(profile.registers[0].access, "read");
});


test("imports normally compressed XLSX workbook bytes through the async importer", async () => {
  const imported = await standardizeImportedProtocolAsync({ fileName: "compressed.xlsx", fileType: "excel", content: await createMinimalDeflatedXlsx() });
  const mapping = createDefaultFieldMapping(imported.headers);
  const profile = applyFieldMapping(
    {
      id: "xlsx-compressed-v1",
      name: "压缩 Excel 导入协议",
      version: "1.0.0",
      deviceType: "通用设备",
      vendor: "开放协议实验室",
      communicationType: "Modbus TCP",
    },
    imported,
    mapping,
  );

  assert.equal(imported.source.kind, "excel");
  assert.equal(profile.registers[0].address, 40010);
  assert.equal(profile.registers[0].name, "电压采样");
});

test("validator reports required protocol errors, warnings, and infos by severity", () => {
  const profile: DeviceProfile = {
    schemaVersion: "device-profile/v1",
    id: "invalid-profile",
    name: "Invalid Profile",
    version: "0.0.1",
    deviceType: "通用设备",
    vendor: "Lab",
    communicationType: "Modbus TCP",
    createdAt: "2026-05-23T00:00:00.000Z",
    source: { kind: "json", fileName: "invalid.json" },
    registers: [
      {
        id: "missing-address",
        address: Number.NaN,
        name: "缺少地址",
        functionCode: 3,
        access: "read",
        dataType: "uint16",
        length: 1,
        scale: 1,
        unit: "",
        range: { min: 0, max: 1 },
        enum: [],
        bits: [],
        description: "",
        group: "异常",
        currentValue: 0,
      },
      {
        id: "duplicate-a",
        address: 100,
        name: "重复地址 A",
        functionCode: 3,
        access: "readWrite",
        dataType: "float32",
        length: 1,
        scale: 1,
        unit: "",
        range: { min: 10, max: 1 },
        enum: [
          { value: 1, label: "A" },
          { value: 1, label: "B" },
        ],
        bits: [{ bit: 16, label: "越界 bit" }],
        description: "",
        group: "异常",
        currentValue: 0,
      },
      {
        id: "duplicate-b",
        address: 100,
        name: "重复地址 B",
        functionCode: 16,
        access: "bad-access",
        dataType: "uint16",
        length: 2,
        scale: 1,
        unit: "",
        range: undefined,
        enum: [],
        bits: [],
        description: "",
        group: "异常",
        currentValue: 0,
      },
      {
        id: "overlap",
        address: 101,
        name: "重叠地址",
        functionCode: 3,
        access: "read",
        dataType: "uint16",
        length: 1,
        scale: 1,
        unit: "",
        range: undefined,
        enum: [],
        bits: [],
        description: "",
        group: "异常",
        currentValue: 0,
      },
    ],
    scenarios: [],
  };

  const result = validateDeviceProfile(profile);
  const codes = result.items.map((item) => item.code);
  assert.equal(result.canStartSimulation, false);
  assert.deepEqual(countValidationBySeverity(result), { error: 8, warning: 1, info: 1 });
  for (const requiredCode of [
    "ADDRESS_REQUIRED",
    "ADDRESS_DUPLICATE",
    "REGISTER_OVERLAP",
    "TYPE_LENGTH_MISMATCH",
    "ACCESS_INVALID",
    "RANGE_INVALID",
    "ENUM_CONFLICT",
    "BIT_OUT_OF_RANGE",
  ]) {
    assert.equal(codes.includes(requiredCode), true, `${requiredCode} should be reported`);
  }
});

test("simulator engine only reads Device Profile, blocks invalid profiles, and applies scenes", () => {
  const profile: DeviceProfile = {
    schemaVersion: "device-profile/v1",
    id: "runtime-profile",
    name: "Runtime Profile",
    version: "1.0.0",
    deviceType: "通用设备",
    vendor: "Lab",
    communicationType: "Modbus RTU",
    createdAt: "2026-05-23T00:00:00.000Z",
    source: { kind: "json", fileName: "runtime.json" },
    registers: [
      {
        id: "target",
        address: 1,
        name: "目标值",
        functionCode: 6,
        access: "readWrite",
        dataType: "int16",
        length: 1,
        scale: 0.1,
        unit: "kW",
        range: { min: -100, max: 100 },
        enum: [],
        bits: [],
        description: "",
        group: "控制",
        currentValue: 0,
      },
    ],
    scenarios: [
      {
        id: "charging",
        name: "充电",
        description: "批量写入充电工况值",
        steps: [{ registerId: "target", strategy: "fixed", value: 66 }],
        faultInjection: { mode: "none" },
      },
    ],
  };

  const engine = createSimulatorEngine(profile);
  assert.equal(engine.getSourceKind(), "device-profile");
  assert.equal(engine.start().running, true);
  assert.equal(engine.writeRegister("target", 12.5).ok, true);
  assert.equal(engine.readRegister("target")?.currentValue, 12.5);
  assert.equal(engine.applyScene("charging").ok, true);
  assert.equal(engine.readRegister("target")?.currentValue, 66);

  const invalid = createSimulatorEngine({
    ...profile,
    id: "invalid-runtime",
    registers: [profile.registers[0], { ...profile.registers[0], id: "duplicate", address: 1 }],
  });
  const status = invalid.start();
  assert.equal(status.running, false);
  assert.equal(status.blocked, true);
  assert.match(status.reason ?? "", /校验错误/);
});

test("simulator register editor uses engineering values and derives lower-machine raw values", () => {
  const voltageRegister: DeviceRegister = {
    id: "voltage",
    address: 40003,
    name: "母线电压",
    functionCode: 3,
    access: "read",
    dataType: "uint16",
    length: 1,
    scale: 0.1,
    unit: "V",
    range: { min: 0, max: 1000 },
    enum: [],
    bits: [],
    description: "",
    group: "遥测",
    currentValue: 748.2,
  };

  assert.equal(formatSimulatorRegisterEditorValue(voltageRegister), "748.2");

  const parsed = parseSimulatorRegisterInput(voltageRegister, "749");
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.rawValue, 7490);
    assert.equal(parsed.currentValue, 749);
    assert.equal(parsed.numericValue, 749);
  }
});


test("simulator write frame formatter emits real Modbus TCP FC06 hex", () => {
  const frame = buildModbusTcpWriteSingleRegisterFrame({
    transactionId: 1,
    unitId: 1,
    address: 13001,
    rawValue: 1,
  });

  assert.equal(frame.request, "00 01 00 00 00 06 01 06 32 C9 00 01");
  assert.equal(frame.response, "00 01 00 00 00 06 01 06 32 C9 00 01");
});
