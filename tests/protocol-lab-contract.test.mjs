import assert from "node:assert/strict";
import fs from "node:fs";

const protocolWorkbench = fs.readFileSync("src/components/ProtocolLabWorkbench.tsx", "utf8");
const simulatorWorkbench = fs.readFileSync("src/components/SimulatorWorkbench.tsx", "utf8");
const simulatorInput = fs.readFileSync("src/components/SimulatorRegisterValueInput.tsx", "utf8");
const appShell = fs.readFileSync("src/components/AppShell.tsx", "utf8");
const modulePanel = fs.readFileSync("src/components/ModulePanel.tsx", "utf8");
const protocolData = fs.readFileSync("src/data/protocolLab.ts", "utf8");
const profileModel = fs.readFileSync("src/protocol/deviceProfile.ts", "utf8");
const importer = fs.readFileSync("src/protocol/importer.ts", "utf8");
const mapper = fs.readFileSync("src/protocol/fieldMapper.ts", "utf8");
const validator = fs.readFileSync("src/protocol/validator.ts", "utf8");
const simulator = fs.readFileSync("src/simulator/simulatorEngine.ts", "utf8");
const simulatorWorkspace = fs.readFileSync("src/simulator/workspace.ts", "utf8");
const transport = fs.readFileSync("src/transport/transportLayer.ts", "utf8");

for (const text of [
  "通用协议实验室",
  "协议资产中心",
  "通用协议导入向导 Pro",
  "字段映射",
  "生成统一 Device Profile JSON",
  "协议校验",
  "协议寄存器表",
]) {
  assert.match(protocolWorkbench, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `protocol workbench should render ${text}`);
}

for (const text of [
  "从机模拟中心",
  "导入协议",
  "模拟工程 / 设备",
  "监听配置",
  "寄存器模拟表",
  "场景脚本 / 故障注入",
  "请求 / 响应报文日志",
  "异常码统计",
  "标题栏“模拟快调”",
]) {
  assert.match(simulatorWorkbench, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `simulator workbench should render ${text}`);
}

for (const text of [
  "Global Simulator Quick Adjust",
  "模拟快调",
  "常用快调",
  "最近修改",
  "快速搜索结果",
]) {
  assert.match(appShell, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `app shell should render ${text}`);
}

for (const field of ["地址", "名称", "功能码", "读写权限", "数据类型", "长度", "倍率", "单位", "范围", "枚举", "bit 位", "说明", "分组"]) {
  assert.match(mapper, new RegExp(field), `field mapper should include ${field}`);
}

for (const code of [
  "ADDRESS_REQUIRED",
  "ADDRESS_DUPLICATE",
  "REGISTER_OVERLAP",
  "TYPE_LENGTH_MISMATCH",
  "ACCESS_INVALID",
  "RANGE_INVALID",
  "ENUM_CONFLICT",
  "BIT_OUT_OF_RANGE",
]) {
  assert.match(validator, new RegExp(code), `validator should check ${code}`);
}

for (const strategy of ["fixed", "random", "increment", "decrement", "sine"]) {
  assert.match(profileModel + protocolData + simulator, new RegExp(strategy), `scenarios should support ${strategy}`);
}

for (const faultMode of ["exceptionCode", "timeout", "noResponse", "outOfRange"]) {
  assert.match(profileModel + simulator + protocolData, new RegExp(faultMode), `fault injection should support ${faultMode}`);
}

for (const scenarioName of ["正常运行", "待机", "充电", "放电", "故障", "通信异常"]) {
  assert.match(protocolData, new RegExp(scenarioName), `seed profile should include scenario ${scenarioName}`);
}

assert.match(importer, /standardizeImportedProtocolAsync/, "Protocol Importer should expose async import for normal compressed XLSX files");
assert.match(importer, /DecompressionStream\("deflate-raw"\)/, "Protocol Importer should handle Deflate-compressed XLSX entries");
assert.match(importer, /fileType: ImportFileType/, "Protocol Importer should own file type handling");
assert.match(importer, /"excel" \| "csv" \| "json"/, "Protocol Importer should expose Excel/CSV/JSON types");
assert.match(mapper, /applyFieldMapping/, "Field Mapper should generate profile after mapping");
assert.match(profileModel, /DeviceProfile/, "Device Profile should be a named model");
assert.match(simulator, /validateDeviceProfile/, "Simulator Engine should gate start on validation");
assert.match(transport, /Modbus TCP|Modbus RTU|CAN|custom-tcp/, "Transport Layer should cover current and future transports");
assert.match(protocolWorkbench, /<button className="lab-button" type="button" onClick=\{focusProtocolAssets\}>选择协议<\/button>/, "protocol top action bar should provide an explicit select protocol button");
assert.match(protocolWorkbench, /onClick=\{focusProtocolEditor\}/, "edit protocol button should navigate to the profile editor area");
assert.match(protocolWorkbench, /generateProtocolImportArtifacts/, "protocol workbench should generate PointModel artifacts from field mapping");
assert.match(protocolWorkbench, /validateDeviceProfile/, "protocol workbench should delegate validation to Validator");
assert.match(simulatorWorkbench, /SimulatorRegisterValueInput/, "simulator workbench should use commit-style value editors");
assert.match(simulatorInput, /onBlur/, "simulator value input should commit on blur");
assert.match(simulatorInput, /event\.key !== "Enter"/, "simulator value input should support Enter to commit");

for (const text of [
  "上一页",
  "下一页",
  "每页",
  "pageSize",
  "pageRegisters",
]) {
  assert.match(simulatorWorkbench, new RegExp(text), `simulator register table should support pagination marker ${text}`);
}

assert.match(simulatorWorkspace, /createDefaultSimulatorWorkspaceState/, "simulator state should have a shared workspace state factory");
assert.match(simulatorWorkspace, /pinnedRegisterIds/, "simulator workspace should track pinned quick-adjust registers");
assert.match(appShell, /onOpenQuickAdjust/, "titlebar should expose a global quick-adjust entry");
assert.match(appShell, /GlobalSimulatorQuickDrawer/, "AppShell should render the global quick drawer");
assert.match(modulePanel, /<ProtocolLabWorkbench/, "protocol nav should route to protocol workbench");
assert.match(modulePanel, /<SimulatorWorkbench/, "simulator nav should route to dedicated simulator workbench");

const forbiddenSpecializations = /PCS|BMS|液冷|电表/;
assert.doesNotMatch(protocolWorkbench, forbiddenSpecializations, "Protocol lab page must not hard-code PCS/BMS/liquid-cooling/meter logic");
assert.doesNotMatch(protocolData, forbiddenSpecializations, "Protocol profiles used by the lab must remain generic examples");

for (const text of [
  "选择协议文件",
  "选择 sheet / 数据源",
  "自动识别表头",
  "地址格式识别",
  "数据类型识别",
  "倍率/单位识别",
  "枚举/bit 位识别",
  "导入预览",
  "校验结果",
  "确认导入",
  "生成协议模型",
  "保存字段映射模板",
  "复用字段映射模板",
  "PointModel",
  "ProtocolModel",
  "DeviceTemplate",
  "RegisterTable",
  "RealtimePageConfig",
  "SimulationModel",
]) {
  assert.match(protocolWorkbench, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Protocol Import Wizard Pro UI should render ${text}`);
}

for (const api of [
  "createPointFieldMapping",
  "generateProtocolImportArtifacts",
  "validatePointModels",
  "createPointFieldMappingTemplate",
  "applyPointFieldMappingTemplate",
  "createPointFieldMappingTemplateRepository",
  "PointFieldMapping",
  "ProtocolImportArtifacts",
]) {
  assert.match(protocolWorkbench, new RegExp(api), `protocol workbench should integrate PointModel API ${api}`);
}

assert.match(protocolWorkbench, /window\.localStorage/, "mapping templates should persist in browser localStorage");
assert.match(protocolWorkbench, /createBrowserTemplateRepository\(\)\.load\(\)/, "mapping templates should initialize from repository storage");
assert.match(protocolWorkbench, /createBrowserTemplateRepository\(\)\.save\(/, "saving a mapping template should write through the repository");

for (const field of [
  "point_id",
  "device_type",
  "area",
  "address",
  "name",
  "data_type",
  "word_count",
  "byte_order",
  "scale",
  "offset",
  "unit",
  "rw",
  "min",
  "max",
  "default_value",
  "enum_map",
  "bit_define",
  "remark",
  "group",
  "page",
  "poll_cycle",
  "simulate_rule",
]) {
  assert.match(protocolWorkbench, new RegExp(field), `PointModel mapping UI should expose ${field}`);
}

assert.match(protocolWorkbench, /validatePointModels\([^)]*pointModels/, "import preview should validate generated PointModel rows before confirmation");
assert.match(protocolWorkbench, /disabled=\{[^}]*!.*canImport/s, "confirm import should be disabled when PointModel validation has errors");
assert.match(protocolWorkbench, /artifacts\.realtimePageConfig\.pages\.length/, "right summary should show generated realtime page count");
assert.match(protocolWorkbench, /artifacts\.simulationModel\.registers\.length/, "right summary should show generated simulation register count");
assert.match(protocolWorkbench, /point-preview-row.*severity-error/s, "preview table should be able to highlight error rows");
assert.match(protocolWorkbench, /previewFilter/, "import preview should keep a filter keyword state");
assert.match(protocolWorkbench, /filteredPreviewPoints/, "import preview should filter rows before rendering");
assert.match(protocolWorkbench, /导入预览筛选/, "import preview should render a row filter control");

assert.match(protocolWorkbench, /listImportedProtocolSourcesAsync/, "UI should enumerate workbook sheets/data sources before parsing");
assert.match(protocolWorkbench, /ImportedProtocolDataSource/, "UI should keep selectable imported data source metadata");
assert.match(protocolWorkbench, /selectedDataSourceId/, "UI should track selected sheet/data source id");
assert.match(protocolWorkbench, /dataSourceId/, "UI should pass selected dataSourceId back into importer");
assert.match(protocolWorkbench, /onDataSourceChange/, "ImportWizard should let users choose sheet or data source");
assert.match(protocolWorkbench, /选择 sheet \/ 数据源[\s\S]*<select/, "ImportWizard should render a sheet/data source select control");
assert.match(protocolWorkbench, /wizardStepIndex/, "wizard should keep current step index state instead of only deriving status");
assert.match(protocolWorkbench, /setWizardStepIndex/, "wizard next/previous buttons should update current step index");
assert.match(protocolWorkbench, /onClick=\{goPreviousWizardStep\}/, "previous button should navigate to previous wizard step");
assert.match(protocolWorkbench, /onClick=\{goNextWizardStep\}/, "next button should navigate to next wizard step");

console.log("protocol lab contract ok");
