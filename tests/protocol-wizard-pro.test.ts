import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { listImportedProtocolSourcesAsync, standardizeImportedProtocol, standardizeImportedProtocolAsync } from "../src/protocol/importer";
import { createPointFieldMappingTemplateRepository } from "../src/protocol/mappingTemplateStore";
import {
  applyPointFieldMappingTemplate,
  createPointFieldMapping,
  createPointFieldMappingTemplate,
  generateProtocolImportArtifacts,
  parsePointFieldMappingTemplates,
  serializePointFieldMappingTemplates,
  validatePointModels,
  type PointFieldMapping,
} from "../src/protocol/pointModel";

test("wizard pro maps arbitrary renamed columns into PointModel and generated runtime artifacts", () => {
  const csv = `寄存器编号,点位标题,值类型,权限,单位/倍率,备注文本,页面名,分组名,轮询ms,默认值\n40001,母线电压,uint16,R,0.1V,"0=停止;1=运行; bit0=告警 bit1=故障",总览,遥测,1000,0\n0x9C42,功率设定,IEEE FLOAT,R/W,0.01kW,"范围:-500~500",控制,设定,500,12.34`;
  const table = standardizeImportedProtocol({ fileName: "renamed-protocol.csv", fileType: "csv", content: csv });
  const mapping: PointFieldMapping = {
    address: "寄存器编号",
    name: "点位标题",
    data_type: "值类型",
    rw: "权限",
    unit: "单位/倍率",
    remark: "备注文本",
    page: "页面名",
    group: "分组名",
    poll_cycle: "轮询ms",
    default_value: "默认值",
  };

  const artifacts = generateProtocolImportArtifacts(
    {
      protocolId: "renamed-v1",
      name: "任意列名协议",
      version: "1.0.0",
      deviceType: "PCS",
      vendor: "EVE",
      sourceFile: table.source.fileName,
    },
    table,
    mapping,
  );

  assert.equal(createPointFieldMapping(table.headers).address, undefined, "renamed headers should require explicit mapping");
  assert.equal(artifacts.protocolModel.points.length, 2);
  assert.deepEqual(artifacts.pointModels.map((point) => point.point_id), ["pcs-40001-0", "pcs-40002-1"]);
  assert.equal(artifacts.pointModels[0].area, "holding_register");
  assert.equal(artifacts.pointModels[0].address, 40001);
  assert.equal(artifacts.pointModels[0].scale, 0.1);
  assert.equal(artifacts.pointModels[0].unit, "V");
  assert.equal(artifacts.pointModels[0].rw, "R");
  assert.deepEqual(artifacts.pointModels[0].enum_map, { "0": "停止", "1": "运行" });
  assert.deepEqual(artifacts.pointModels[0].bit_define, { "0": "告警", "1": "故障" });
  assert.equal(artifacts.pointModels[1].address, 40002, "0x9C42 should normalize to 40002");
  assert.equal(artifacts.pointModels[1].data_type, "float");
  assert.equal(artifacts.pointModels[1].word_count, 2);
  assert.equal(artifacts.pointModels[1].rw, "R/W");
  assert.equal(artifacts.pointModels[1].min, -500);
  assert.equal(artifacts.pointModels[1].max, 500);

  assert.deepEqual(artifacts.deviceTemplate.pointIds, ["pcs-40001-0", "pcs-40002-1"]);
  assert.deepEqual(artifacts.registerTable.rows.map((row) => [row.address, row.word_count, row.point_id]), [
    [40001, 1, "pcs-40001-0"],
    [40002, 2, "pcs-40002-1"],
  ]);
  assert.deepEqual(artifacts.realtimePageConfig.pages.map((page) => [page.name, page.pointIds]), [
    ["总览", ["pcs-40001-0"]],
    ["控制", ["pcs-40002-1"]],
  ]);
  assert.deepEqual(artifacts.simulationModel.registers.map((register) => [register.address, register.default_value, register.simulate_rule]), [
    [40001, 0, "fixed"],
    [40002, 12.34, "fixed"],
  ]);
});

test("wizard pro automatically recognizes common English protocol headers", () => {
  const csv = `Register Address,Register Name,Data Type,Read Write,Scale Unit,Description
40001,DC Voltage,Unsigned 16,Read Only,0.1V,"0=Stop;1=Run; bit0=Alarm"`;
  const table = standardizeImportedProtocol({ fileName: "english-protocol.csv", fileType: "csv", content: csv });
  const mapping = createPointFieldMapping(table.headers);
  const artifacts = generateProtocolImportArtifacts(
    {
      protocolId: "english-auto",
      name: "English Header Protocol",
      version: "1.0.0",
      deviceType: "Generic Device",
      vendor: "Lab",
      sourceFile: table.source.fileName,
    },
    table,
    mapping,
  );

  assert.equal(mapping.address, "Register Address");
  assert.equal(mapping.name, "Register Name");
  assert.equal(mapping.data_type, "Data Type");
  assert.equal(mapping.rw, "Read Write");
  assert.equal(mapping.unit, "Scale Unit");
  assert.equal(mapping.remark, "Description");
  assert.equal(artifacts.pointModels[0].data_type, "uint16");
  assert.equal(artifacts.pointModels[0].rw, "R");
  assert.equal(artifacts.pointModels[0].scale, 0.1);
  assert.equal(artifacts.pointModels[0].unit, "V");
});

test("wizard pro recognizes 4x and 3x Modbus address notation", () => {
  const csv = `Register Address,Register Name,Data Type,Read Write,Unit
4x0001,Holding Voltage,uint16,R,V
3x0001,Input Current,uint16,R,A`;
  const table = standardizeImportedProtocol({ fileName: "modbus-prefix-address.csv", fileType: "csv", content: csv });
  const artifacts = generateProtocolImportArtifacts(
    {
      protocolId: "modbus-prefix-address",
      name: "Modbus Prefix Address",
      version: "1.0.0",
      deviceType: "Generic Device",
      vendor: "Lab",
      sourceFile: table.source.fileName,
    },
    table,
    createPointFieldMapping(table.headers),
  );

  assert.deepEqual(artifacts.pointModels.map((point) => [point.address, point.area]), [
    [40001, "holding_register"],
    [30001, "input_register"],
  ]);
});

test("wizard pro normalizes abbreviated read write permissions", () => {
  const csv = `Register Address,Register Name,Data Type,Read Write,Unit
40001,Read Only Point,uint16,RO,V
40002,Write Only Point,uint16,WO,V
40003,Read Write Point,uint16,Read-Write,V`;
  const table = standardizeImportedProtocol({ fileName: "rw-abbreviations.csv", fileType: "csv", content: csv });
  const artifacts = generateProtocolImportArtifacts(
    {
      protocolId: "rw-abbreviations",
      name: "RW Abbreviations",
      version: "1.0.0",
      deviceType: "Generic Device",
      vendor: "Lab",
      sourceFile: table.source.fileName,
    },
    table,
    createPointFieldMapping(table.headers),
  );

  assert.deepEqual(artifacts.pointModels.map((point) => point.rw), ["R", "W", "R/W"]);
  assert.equal(validatePointModels(artifacts.pointModels).canImport, true);
});

test("wizard pro automatically recognizes multiplier and engineering unit columns", () => {
  const csv = `Register Address,Register Name,Data Type,Read Write,Multiplier,Engineering Unit
40001,DC Voltage,uint16,R,0.1,V`;
  const table = standardizeImportedProtocol({ fileName: "multiplier-unit.csv", fileType: "csv", content: csv });
  const mapping = createPointFieldMapping(table.headers);
  const artifacts = generateProtocolImportArtifacts(
    {
      protocolId: "multiplier-unit",
      name: "Multiplier Unit Protocol",
      version: "1.0.0",
      deviceType: "Generic Device",
      vendor: "Lab",
      sourceFile: table.source.fileName,
    },
    table,
    mapping,
  );

  assert.equal(mapping.scale, "Multiplier");
  assert.equal(mapping.unit, "Engineering Unit");
  assert.equal(artifacts.pointModels[0].scale, 0.1);
  assert.equal(artifacts.pointModels[0].unit, "V");
});

test("wizard pro parses unit columns with parenthesized or x-prefixed scale", () => {
  const csv = `Register Address,Register Name,Data Type,Read Write,Engineering Unit
40001,DC Voltage,uint16,R,V (0.1)
40002,Active Power,int16,R,kW x0.01`;
  const table = standardizeImportedProtocol({ fileName: "unit-scale-variants.csv", fileType: "csv", content: csv });
  const artifacts = generateProtocolImportArtifacts(
    {
      protocolId: "unit-scale-variants",
      name: "Unit Scale Variants",
      version: "1.0.0",
      deviceType: "Generic Device",
      vendor: "Lab",
      sourceFile: table.source.fileName,
    },
    table,
    createPointFieldMapping(table.headers),
  );

  assert.deepEqual(artifacts.pointModels.map((point) => [point.scale, point.unit]), [
    [0.1, "V"],
    [0.01, "kW"],
  ]);
});

test("wizard pro normalizes common byte order and word order spellings", () => {
  const csv = `Register Address,Register Name,Data Type,Read Write,Byte Order
40001,Big Endian Float,float,R,Big Endian
40003,Little Endian Float,float,R,Little Endian
40005,Word Swap Float,float,R,Word Swap`;
  const table = standardizeImportedProtocol({ fileName: "byte-order.csv", fileType: "csv", content: csv });
  const mapping = createPointFieldMapping(table.headers);
  const artifacts = generateProtocolImportArtifacts(
    {
      protocolId: "byte-order",
      name: "Byte Order Protocol",
      version: "1.0.0",
      deviceType: "Generic Device",
      vendor: "Lab",
      sourceFile: table.source.fileName,
    },
    table,
    mapping,
  );

  assert.equal(mapping.byte_order, "Byte Order");
  assert.deepEqual(artifacts.pointModels.map((point) => point.byte_order), ["ABCD", "DCBA", "CDAB"]);
});

test("wizard pro recognizes function code columns as register areas", () => {
  const csv = `Function Code,Register Address,Register Name,Data Type,Read Write,Unit
03,40001,Holding Voltage,uint16,R,V
04,30001,Input Current,uint16,R,A
01,00001,Run Command,bool,R/W,
02,10001,Alarm Input,bool,R,`;
  const table = standardizeImportedProtocol({ fileName: "function-code-area.csv", fileType: "csv", content: csv });
  const mapping = createPointFieldMapping(table.headers);
  const artifacts = generateProtocolImportArtifacts(
    {
      protocolId: "function-code-area",
      name: "Function Code Area Protocol",
      version: "1.0.0",
      deviceType: "Generic Device",
      vendor: "Lab",
      sourceFile: table.source.fileName,
    },
    table,
    mapping,
  );

  assert.equal(mapping.area, "Function Code");
  assert.deepEqual(artifacts.pointModels.map((point) => point.area), [
    "holding_register",
    "input_register",
    "coil",
    "discrete_input",
  ]);
});

test("wizard pro recognizes signed and unsigned bit-width data type spellings", () => {
  const csv = `Register Address,Register Name,Data Type,Read Write,Unit
40001,Unsigned Word,Unsigned 16-bit,R,V
40002,Signed Word,Signed 16-bit,R,A
40003,Unsigned Double,Unsigned 32-bit,R,kWh
40005,Signed Double,Signed 32-bit,R,kW`;
  const table = standardizeImportedProtocol({ fileName: "bit-width-types.csv", fileType: "csv", content: csv });
  const artifacts = generateProtocolImportArtifacts(
    {
      protocolId: "bit-width-types",
      name: "Bit Width Types",
      version: "1.0.0",
      deviceType: "Generic Device",
      vendor: "Lab",
      sourceFile: table.source.fileName,
    },
    table,
    createPointFieldMapping(table.headers),
  );

  assert.deepEqual(artifacts.pointModels.map((point) => [point.data_type, point.word_count]), [
    ["uint16", 1],
    ["int16", 1],
    ["uint32", 2],
    ["int32", 2],
  ]);
  assert.equal(validatePointModels(artifacts.pointModels).canImport, true);
});

test("wizard pro detects tab-delimited tables even when a title row comes first", () => {
  const tsv = `Protocol Export V1
Register Address\tRegister Name\tData Type\tRead Write\tScale Unit
40001\tDC Voltage\tuint16\tR\t0.1V`;
  const table = standardizeImportedProtocol({ fileName: "preamble.tsv", fileType: "csv", content: tsv });
  const mapping = createPointFieldMapping(table.headers);
  const artifacts = generateProtocolImportArtifacts(
    {
      protocolId: "preamble-tsv",
      name: "Preamble TSV",
      version: "1.0.0",
      deviceType: "Generic Device",
      vendor: "Lab",
      sourceFile: table.source.fileName,
    },
    table,
    mapping,
  );

  assert.deepEqual(table.headers, ["Register Address", "Register Name", "Data Type", "Read Write", "Scale Unit"]);
  assert.equal(artifacts.pointModels[0].address, 40001);
  assert.equal(artifacts.pointModels[0].scale, 0.1);
  assert.equal(artifacts.pointModels[0].unit, "V");
});

test("wizard pro ignores footer and comment rows after delimited table body", () => {
  const csv = `Register Address,Register Name,Data Type,Read Write,Unit
40001,DC Voltage,uint16,R,V
# exported by vendor tool
Note: values are engineering units`;
  const table = standardizeImportedProtocol({ fileName: "footer-comments.csv", fileType: "csv", content: csv });
  const artifacts = generateProtocolImportArtifacts(
    {
      protocolId: "footer-comments",
      name: "Footer Comments",
      version: "1.0.0",
      deviceType: "Generic Device",
      vendor: "Lab",
      sourceFile: table.source.fileName,
    },
    table,
    createPointFieldMapping(table.headers),
  );

  assert.equal(table.rows.length, 1);
  assert.equal(artifacts.pointModels.length, 1);
  assert.equal(validatePointModels(artifacts.pointModels).canImport, true);
});

test("wizard pro saves and reapplies field mapping templates", () => {
  const mapping: PointFieldMapping = {
    address: "寄存器编号",
    name: "点位标题",
    data_type: "值类型",
    rw: "权限",
    unit: "单位/倍率",
    remark: "备注文本",
  };

  const template = createPointFieldMappingTemplate({
    id: "eve-renamed-v1",
    name: "EVE 改列表头模板",
    sourceKind: "excel",
    headers: ["寄存器编号", "点位标题", "值类型", "权限", "单位/倍率", "备注文本"],
    mapping,
  });
  const saved = serializePointFieldMappingTemplates([template]);
  const [loaded] = parsePointFieldMappingTemplates(saved);

  assert.equal(template.schemaVersion, "point-field-mapping-template/v1");
  assert.equal(loaded.id, "eve-renamed-v1");
  assert.deepEqual(applyPointFieldMappingTemplate(loaded, template.headers), mapping);
  assert.deepEqual(applyPointFieldMappingTemplate(loaded, ["寄存器编号", "点位标题"]), {
    address: "寄存器编号",
    name: "点位标题",
  });
});

test("wizard pro reapplies field mapping templates to normalized equivalent headers", () => {
  const template = createPointFieldMappingTemplate({
    id: "english-template",
    name: "English Mapping",
    sourceKind: "csv",
    headers: ["Register Address", "Register Name", "Data Type", "Read Write"],
    mapping: {
      address: "Register Address",
      name: "Register Name",
      data_type: "Data Type",
      rw: "Read Write",
    },
  });

  assert.deepEqual(applyPointFieldMappingTemplate(template, ["register_address", "RegisterName", "data-type", "read/write"]), {
    address: "register_address",
    name: "RegisterName",
    data_type: "data-type",
    rw: "read/write",
  });
});


test("wizard pro validates PointModel import preview with error warning info severities", () => {
  const csv = `地址,名称,数据类型,字数,读写,倍率,单位,备注
,缺地址,uint16,1,R,1,V,
40001,重复A,float,2,RW,0,kW,
40001,重复B,uint16,1,BAD,1,,bit0=运行 bit0=故障
40002,重叠,uint16,1,R,1,A,
40010,长度不匹配,float,1,R,1,V,
40011,缺类型,,1,R,1,V,
40011,缺读写,uint16,1,,1,V,`;
  const table = standardizeImportedProtocol({ fileName: "invalid-preview.csv", fileType: "csv", content: csv });
  const artifacts = generateProtocolImportArtifacts(
    {
      protocolId: "invalid-preview",
      name: "校验协议",
      version: "1.0.0",
      deviceType: "PCS",
      vendor: "Lab",
      sourceFile: table.source.fileName,
    },
    table,
    createPointFieldMapping(table.headers),
  );

  const result = validatePointModels(artifacts.pointModels);
  const codes = result.items.map((item) => item.code);

  assert.equal(result.status, "error");
  assert.equal(result.canImport, false);
  for (const code of [
    "ADDRESS_REQUIRED",
    "ADDRESS_DUPLICATE",
    "ADDRESS_OVERLAP",
    "DATA_TYPE_REQUIRED",
    "WORD_COUNT_MISMATCH",
    "RW_REQUIRED",
    "RW_INVALID",
    "SCALE_ABNORMAL",
    "UNIT_MISSING",
    "BIT_DUPLICATE",
    "POINTMODEL_READY",
  ]) {
    assert.equal(codes.includes(code), true, `${code} should be reported`);
  }
});

test("wizard pro reports explicit non-positive word_count instead of silently inferring it", () => {
  const csv = `地址,名称,数据类型,字数,读写,单位
40001,零长度,uint16,0,R,V`;
  const table = standardizeImportedProtocol({ fileName: "invalid-word-count.csv", fileType: "csv", content: csv });
  const artifacts = generateProtocolImportArtifacts(
    {
      protocolId: "invalid-word-count",
      name: "非法字数协议",
      version: "1.0.0",
      deviceType: "通用设备",
      vendor: "Lab",
      sourceFile: table.source.fileName,
    },
    table,
    createPointFieldMapping(table.headers),
  );
  const result = validatePointModels(artifacts.pointModels);

  assert.equal(artifacts.pointModels[0].word_count, 0);
  assert.equal(result.canImport, false);
  assert.equal(result.items.some((item) => item.code === "WORD_COUNT_MISMATCH"), true);
});

test("wizard pro validates duplicate and overlap addresses per register area", () => {
  const csv = `区,地址,名称,数据类型,字数,读写,单位
holding_register,40001,保持寄存器,uint16,1,R,V
input_register,40001,输入寄存器,uint16,1,R,V
holding_register,40010,保持浮点,float,2,R,kW
input_register,40011,输入偏移,uint16,1,R,A`;
  const table = standardizeImportedProtocol({ fileName: "area-aware.csv", fileType: "csv", content: csv });
  const artifacts = generateProtocolImportArtifacts(
    {
      protocolId: "area-aware",
      name: "区分寄存器区协议",
      version: "1.0.0",
      deviceType: "通用设备",
      vendor: "Lab",
      sourceFile: table.source.fileName,
    },
    table,
    createPointFieldMapping(table.headers),
  );
  const result = validatePointModels(artifacts.pointModels);
  const codes = result.items.map((item) => item.code);

  assert.equal(result.canImport, true);
  assert.equal(codes.includes("ADDRESS_DUPLICATE"), false, "same numeric address in different areas should not duplicate");
  assert.equal(codes.includes("ADDRESS_OVERLAP"), false, "overlap checks should be scoped to the same area");
});

test("wizard pro reports duplicate bit definitions even when labels match", () => {
  const csv = `地址,名称,数据类型,读写,单位,bit 位
40001,状态字,uint16,R,,bit0=告警 bit0=告警`;
  const table = standardizeImportedProtocol({ fileName: "same-label-bit-duplicate.csv", fileType: "csv", content: csv });
  const artifacts = generateProtocolImportArtifacts(
    {
      protocolId: "same-label-bit-duplicate",
      name: "重复 bit 校验协议",
      version: "1.0.0",
      deviceType: "通用设备",
      vendor: "Lab",
      sourceFile: table.source.fileName,
    },
    table,
    createPointFieldMapping(table.headers),
  );
  const result = validatePointModels(artifacts.pointModels);
  const bitIssue = result.items.find((item) => item.code === "BIT_DUPLICATE");

  assert.equal(result.canImport, false);
  assert.equal(bitIssue?.severity, "error");
  assert.equal(bitIssue?.pointId, artifacts.pointModels[0].point_id);
});

test("wizard pro parses comparison-style ranges from remarks", () => {
  const csv = `地址,名称,数据类型,读写,单位,备注
40001,温度,int16,R,℃,value >= -40 and <= 85
40002,SOC,uint16,R,%,min:0 max:100`;
  const table = standardizeImportedProtocol({ fileName: "comparison-ranges.csv", fileType: "csv", content: csv });
  const artifacts = generateProtocolImportArtifacts(
    {
      protocolId: "comparison-ranges",
      name: "比较式范围协议",
      version: "1.0.0",
      deviceType: "通用设备",
      vendor: "Lab",
      sourceFile: table.source.fileName,
    },
    table,
    createPointFieldMapping(table.headers),
  );

  assert.deepEqual(artifacts.pointModels.map((point) => [point.min, point.max]), [
    [-40, 85],
    [0, 100],
  ]);
});

test("wizard pro reports malformed explicit enum definitions", () => {
  const csv = `地址,名称,数据类型,读写,单位,枚举
40001,运行模式,uint16,R,,0=停机;1运行;2=故障`;
  const table = standardizeImportedProtocol({ fileName: "bad-enum.csv", fileType: "csv", content: csv });
  const artifacts = generateProtocolImportArtifacts(
    {
      protocolId: "bad-enum",
      name: "枚举格式校验协议",
      version: "1.0.0",
      deviceType: "通用设备",
      vendor: "Lab",
      sourceFile: table.source.fileName,
    },
    table,
    createPointFieldMapping(table.headers),
  );

  const result = validatePointModels(artifacts.pointModels);
  const enumIssue = result.items.find((item) => item.code === "ENUM_FORMAT_INVALID");

  assert.equal(result.canImport, true, "malformed enums should warn but not block import");
  assert.equal(enumIssue?.severity, "warning");
  assert.equal(enumIssue?.pointId, artifacts.pointModels[0].point_id);
  assert.deepEqual(artifacts.pointModels[0].enum_map["0"], "停机");
  assert.deepEqual(artifacts.pointModels[0].enum_map["2"], "故障");
});

test("wizard pro reports duplicate enum values as malformed enum definitions", () => {
  const csv = `地址,名称,数据类型,读写,单位,枚举
40001,模式,uint16,R,,0=停止;0=运行;1=故障`;
  const table = standardizeImportedProtocol({ fileName: "duplicate-enum.csv", fileType: "csv", content: csv });
  const artifacts = generateProtocolImportArtifacts(
    {
      protocolId: "duplicate-enum",
      name: "重复枚举协议",
      version: "1.0.0",
      deviceType: "通用设备",
      vendor: "Lab",
      sourceFile: table.source.fileName,
    },
    table,
    createPointFieldMapping(table.headers),
  );
  const result = validatePointModels(artifacts.pointModels);
  const enumIssue = result.items.find((item) => item.code === "ENUM_FORMAT_INVALID");

  assert.equal(result.canImport, true, "duplicate enums should warn but not block import");
  assert.equal(enumIssue?.severity, "warning");
  assert.equal(enumIssue?.pointId, artifacts.pointModels[0].point_id);
});

test("wizard pro lists and imports selectable JSON array data sources without fixed property names", () => {
  const content = JSON.stringify({
    meta: { vendor: "Lab" },
    telemetryPoints: [
      { register: "40001", title: "电压", typeName: "uint16", accessMode: "read", engineeringUnit: "0.1V" },
    ],
    commandPoints: [
      { register: "0x9C42", title: "功率设定", typeName: "float32", accessMode: "read/write", engineeringUnit: "0.01kW", note: "范围:-500~500" },
    ],
  });
  const input = { fileName: "multi-source.json", fileType: "json" as const, content };

  const sources = listImportedProtocolSourcesAsync(input);

  return sources.then(async (listedSources) => {
    assert.deepEqual(listedSources.map((source) => [source.id, source.name, source.kind, source.rowCount]), [
      ["json:telemetryPoints", "telemetryPoints", "json", 1],
      ["json:commandPoints", "commandPoints", "json", 1],
    ]);

    const table = await standardizeImportedProtocolAsync({ ...input, dataSourceId: "json:commandPoints" });
    const artifacts = generateProtocolImportArtifacts(
      {
        protocolId: "json-multi-source",
        name: "JSON 多数据源协议",
        version: "1.0.0",
        deviceType: "通用设备",
        vendor: "Lab",
        sourceFile: table.source.fileName,
      },
      table,
      {
        address: "register",
        name: "title",
        data_type: "typeName",
        rw: "accessMode",
        unit: "engineeringUnit",
        remark: "note",
      },
    );

    assert.equal(table.source.dataSourceId, "json:commandPoints");
    assert.equal(table.source.dataSourceName, "commandPoints");
    assert.deepEqual(table.headers, ["register", "title", "typeName", "accessMode", "engineeringUnit", "note"]);
    assert.equal(artifacts.pointModels[0].address, 40002);
    assert.equal(artifacts.pointModels[0].data_type, "float");
    assert.equal(artifacts.pointModels[0].scale, 0.01);
    assert.equal(artifacts.pointModels[0].unit, "kW");
  });
});

test("wizard pro discovers nested JSON array data sources by path", async () => {
  const content = JSON.stringify({
    protocol: {
      tables: {
        holdingRegisters: [
          { register: "40001", title: "频率", typeName: "uint16", accessMode: "R", engineeringUnit: "0.01Hz" },
        ],
      },
    },
  });
  const input = { fileName: "nested-source.json", fileType: "json" as const, content };

  const sources = await listImportedProtocolSourcesAsync(input);
  const nestedSource = sources.find((source) => source.id === "json:protocol.tables.holdingRegisters");

  assert.ok(nestedSource, "nested JSON arrays should be selectable by path");
  assert.equal(nestedSource.name, "protocol.tables.holdingRegisters");
  assert.deepEqual(nestedSource.headers, ["register", "title", "typeName", "accessMode", "engineeringUnit"]);

  const table = await standardizeImportedProtocolAsync({ ...input, dataSourceId: "json:protocol.tables.holdingRegisters" });
  assert.equal(table.source.dataSourceName, "protocol.tables.holdingRegisters");
  assert.equal(table.rows[0].title, "频率");
});

test("wizard pro imports JSON matrix tables with header row", async () => {
  const content = JSON.stringify({
    tableMatrix: [
      ["Register Address", "Register Name", "Data Type", "Read Write", "Scale Unit"],
      ["40001", "DC Voltage", "uint16", "R", "0.1V"],
    ],
  });
  const input = { fileName: "matrix-table.json", fileType: "json" as const, content };

  const sources = await listImportedProtocolSourcesAsync(input);
  assert.deepEqual(sources.map((source) => [source.id, source.headers, source.rowCount]), [
    ["json:tableMatrix", ["Register Address", "Register Name", "Data Type", "Read Write", "Scale Unit"], 1],
  ]);

  const table = await standardizeImportedProtocolAsync({ ...input, dataSourceId: "json:tableMatrix" });
  const artifacts = generateProtocolImportArtifacts(
    {
      protocolId: "matrix-json",
      name: "JSON Matrix Protocol",
      version: "1.0.0",
      deviceType: "Generic Device",
      vendor: "Lab",
      sourceFile: table.source.fileName,
    },
    table,
    createPointFieldMapping(table.headers),
  );

  assert.equal(artifacts.pointModels[0].address, 40001);
  assert.equal(artifacts.pointModels[0].scale, 0.1);
  assert.equal(artifacts.pointModels[0].unit, "V");
});

test("wizard pro imports JSON object maps as selectable data sources", async () => {
  const content = JSON.stringify({
    pointMap: {
      voltage: { "Register Address": "40001", "Register Name": "DC Voltage", "Data Type": "uint16", "Read Write": "R", "Scale Unit": "0.1V" },
      current: { "Register Address": "40002", "Register Name": "DC Current", "Data Type": "uint16", "Read Write": "R", "Scale Unit": "0.01A" },
    },
  });
  const input = { fileName: "object-map.json", fileType: "json" as const, content };

  const sources = await listImportedProtocolSourcesAsync(input);
  const source = sources.find((item) => item.id === "json:pointMap");

  assert.ok(source, "object maps of row objects should be selectable");
  assert.equal(source.rowCount, 2);
  assert.deepEqual(source.headers, ["Register Address", "Register Name", "Data Type", "Read Write", "Scale Unit", "__key"]);

  const table = await standardizeImportedProtocolAsync({ ...input, dataSourceId: "json:pointMap" });
  const artifacts = generateProtocolImportArtifacts(
    {
      protocolId: "object-map-json",
      name: "JSON Object Map Protocol",
      version: "1.0.0",
      deviceType: "Generic Device",
      vendor: "Lab",
      sourceFile: table.source.fileName,
    },
    table,
    createPointFieldMapping(table.headers),
  );

  assert.deepEqual(artifacts.pointModels.map((point) => [point.address, point.scale, point.unit]), [
    [40001, 0.1, "V"],
    [40002, 0.01, "A"],
  ]);
});


test("wizard pro imports the real EVE workbook by selecting the register sheet as a data source", async () => {
  const content = readFileSync("docs/source-materials/protocols/EVE_PCSmodbus通信协议V3.13 (BMS_V1.06).xlsx");
  const input = { fileName: "EVE_PCSmodbus通信协议V3.13 (BMS_V1.06).xlsx", fileType: "excel" as const, content };

  const sources = await listImportedProtocolSourcesAsync(input);
  const registerSheet = sources.find((source) => source.name === "寄存器点表");
  assert.ok(registerSheet, "EVE workbook should expose 寄存器点表 as a selectable data source");
  assert.equal(registerSheet?.kind, "sheet");
  assert.deepEqual(registerSheet?.headers.slice(0, 7), ["寄存器地址", "大小", "读写属性", "类型", "寄存器名称", "单位", "备注"]);
  assert.ok((registerSheet?.rowCount ?? 0) > 100, "register sheet should include many protocol rows");

  const table = await standardizeImportedProtocolAsync({ ...input, dataSourceId: registerSheet?.id });
  const mapping = createPointFieldMapping(table.headers);
  const artifacts = generateProtocolImportArtifacts(
    {
      protocolId: "eve-real-workbook",
      name: "EVE 实际协议表",
      version: "V3.13 / BMS V1.06",
      deviceType: "通用储能设备",
      vendor: "EVE",
      sourceFile: table.source.fileName,
    },
    table,
    mapping,
  );
  const activePower = artifacts.pointModels.find((point) => point.address === 14006);

  assert.equal(table.source.dataSourceName, "寄存器点表");
  assert.equal(mapping.address, "寄存器地址");
  assert.equal(mapping.word_count, "大小");
  assert.equal(mapping.rw, "读写属性");
  assert.equal(mapping.data_type, "类型");
  assert.equal(mapping.name, "寄存器名称");
  assert.equal(mapping.unit, "单位");
  assert.equal(mapping.remark, "备注");
  assert.ok(artifacts.pointModels.length > 100, "real workbook import should generate a large PointModel list");
  assert.equal(activePower?.name, "总有功功率");
  assert.equal(activePower?.data_type, "int16");
  assert.equal(activePower?.scale, 0.1);
  assert.equal(activePower?.unit, "kW");
  assert.equal(artifacts.realtimePageConfig.pages.length >= 1, true);
  assert.equal(artifacts.simulationModel.registers.length, artifacts.pointModels.length);
});

test("wizard pro imports the complete real EVE workbook sheet without losing cells after blanks", async () => {
  const content = readFileSync("docs/source-materials/protocols/EVE_PCSmodbus通信协议V3.13 (BMS_V1.06).xlsx");
  const input = { fileName: "EVE_PCSmodbus通信协议V3.13 (BMS_V1.06).xlsx", fileType: "excel" as const, content };
  const sources = await listImportedProtocolSourcesAsync(input);
  const completeSheet = sources.find((source) => source.name === "内外完整寄存器点表");
  assert.ok(completeSheet, "EVE workbook should expose the complete internal/external register sheet");
  assert.ok((completeSheet?.rowCount ?? 0) > 1000, "complete register sheet should expose the large project register table");

  const table = await standardizeImportedProtocolAsync({ ...input, dataSourceId: completeSheet?.id });
  const artifacts = generateProtocolImportArtifacts(
    {
      protocolId: "eve-complete-workbook",
      name: "EVE 完整协议表",
      version: "V3.13 / BMS V1.06",
      deviceType: "通用储能设备",
      vendor: "EVE",
      sourceFile: table.source.fileName,
    },
    table,
    createPointFieldMapping(table.headers),
  );
  const validation = validatePointModels(artifacts.pointModels);
  const highPressureAlarm = artifacts.pointModels.find((point) => point.address === 13104);
  const highTemperatureAlarm = artifacts.pointModels.find((point) => point.address === 13106);

  assert.equal(artifacts.pointModels[0].address, 13001);
  assert.equal(artifacts.pointModels[0].name, "水泵转速");
  assert.equal(highPressureAlarm?.scale, 0.1);
  assert.equal(highPressureAlarm?.unit, "bar");
  assert.equal(highTemperatureAlarm?.scale, 0.1);
  assert.equal(highTemperatureAlarm?.unit, "℃");
  assert.ok(artifacts.pointModels.length > 1000, "complete workbook import should generate the simulator-scale register list");
  assert.equal(validation.canImport, true);
});

test("wizard pro persists field mapping templates through a storage-backed repository", () => {
  const storage = createMemoryStorage();
  const repository = createPointFieldMappingTemplateRepository(storage);
  const template = createPointFieldMappingTemplate({
    id: "generic-template-v1",
    name: "通用协议模板",
    sourceKind: "csv",
    headers: ["寄存器地址", "点位名称", "类型", "权限"],
    mapping: { address: "寄存器地址", name: "点位名称", data_type: "类型", rw: "权限" },
  });

  repository.save([template]);
  assert.match(storage.getItem("icstudio.protocolImportWizard.pointFieldMappingTemplates") ?? "", /通用协议模板/);

  const reloaded = createPointFieldMappingTemplateRepository(storage).load();
  assert.deepEqual(reloaded.map((item) => item.id), ["generic-template-v1"]);
  assert.deepEqual(applyPointFieldMappingTemplate(reloaded[0], ["寄存器地址", "点位名称", "类型", "权限"]), template.mapping);
});

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}
