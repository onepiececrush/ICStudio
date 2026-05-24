import { useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  AlertTriangle,
  Download,
  FileInput,
  FileJson,
  RefreshCw,
  Save,
  UploadCloud,
} from "lucide-react";
import { exportStandardDeviceProfileJson, summarizeDeviceProfile, type DeviceProfile, type DeviceRegister } from "../protocol/deviceProfile";
import {
  applyPointFieldMappingTemplate,
  createPointFieldMapping,
  createPointFieldMappingTemplate,
  generateProtocolImportArtifacts,
  validatePointModels,
  type PointFieldKey,
  type PointFieldMapping,
  type PointFieldMappingTemplate,
  type PointValidationResult,
  type ProtocolImportArtifacts,
} from "../protocol/pointModel";
import { listImportedProtocolSourcesAsync, standardizeImportedProtocolAsync, type ImportedProtocolDataSource, type ImportedProtocolInput, type ImportedProtocolTable, type ImportFileType } from "../protocol/importer";
import { createPointFieldMappingTemplateRepository } from "../protocol/mappingTemplateStore";
import { createDeviceProfileFromPointArtifacts, type DeviceProfileImportMeta } from "../protocol/profileImport";
import { countValidationBySeverity, validateDeviceProfile, type ValidationSeverity } from "../protocol/validator";

type ImportDraftMeta = DeviceProfileImportMeta;

const defaultImportMeta: ImportDraftMeta = {
  name: "新导入通用协议",
  version: "1.0.0",
  deviceType: "通用设备",
  vendor: "未指定厂家",
  communicationType: "Modbus TCP",
};

const severityLabels: Record<ValidationSeverity, string> = {
  error: "错误",
  warning: "警告",
  info: "提示",
};

function createBrowserTemplateRepository() {
  return createPointFieldMappingTemplateRepository(
    typeof window === "undefined" ? undefined : window.localStorage,
  );
}

export function ProtocolLabWorkbench({
  profiles,
  selectedProfileId,
  onSelectProfile,
  onImportProfile,
}: {
  profiles: DeviceProfile[];
  selectedProfileId: string;
  onSelectProfile: (profileId: string) => void;
  onImportProfile: (profile: DeviceProfile) => void;
}) {
  const [importInput, setImportInput] = useState<ImportedProtocolInput | null>(null);
  const [dataSources, setDataSources] = useState<ImportedProtocolDataSource[]>([]);
  const [selectedDataSourceId, setSelectedDataSourceId] = useState<string | undefined>(undefined);
  const [importedTable, setImportedTable] = useState<ImportedProtocolTable | null>(null);
  const [fieldMapping, setFieldMapping] = useState<PointFieldMapping>(() => createPointFieldMapping([]));
  const [importMeta, setImportMeta] = useState<ImportDraftMeta>(defaultImportMeta);
  const [mappingTemplates, setMappingTemplates] = useState<PointFieldMappingTemplate[]>(() => createBrowserTemplateRepository().load());
  const [templateName, setTemplateName] = useState("通用字段映射模板");
  const protocolAssetsRef = useRef<HTMLElement | null>(null);
  const protocolEditorRef = useRef<HTMLDivElement | null>(null);

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0];
  const validation = useMemo(() => validateDeviceProfile(selectedProfile), [selectedProfile]);
  const validationCounts = useMemo(() => countValidationBySeverity(validation), [validation]);
  const summary = useMemo(() => summarizeDeviceProfile(selectedProfile), [selectedProfile]);
  const importArtifacts = useMemo(() => {
    if (!importedTable) return null;
    return generateProtocolImportArtifacts(
      {
        protocolId: `protocol-${slugId(importMeta.name)}-${importedTable.rows.length}`,
        name: importMeta.name,
        version: importMeta.version,
        deviceType: importMeta.deviceType,
        vendor: importMeta.vendor,
        sourceFile: importedTable.source.fileName,
      },
      importedTable,
      fieldMapping,
    );
  }, [fieldMapping, importMeta.deviceType, importMeta.name, importMeta.vendor, importMeta.version, importedTable]);
  const pointValidation = useMemo(() => validatePointModels(importArtifacts?.pointModels ?? []), [importArtifacts]);
  const pointValidationCounts = useMemo(() => countPointValidationBySeverity(pointValidation), [pointValidation]);

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const fileType = inferImportFileType(file.name);
    const content = fileType === "excel" ? await file.arrayBuffer() : await file.text();
    const input: ImportedProtocolInput = { fileName: file.name, fileType, content };
    const sources = await listImportedProtocolSourcesAsync(input);
    const preferredSource = choosePreferredDataSource(sources);
    setImportInput(input);
    setDataSources(sources);
    setSelectedDataSourceId(preferredSource?.id);
    await loadImportedDataSource(input, preferredSource?.id);
    setImportMeta((current) => ({ ...current, name: file.name.replace(/\.[^.]+$/, "") || current.name }));
  }

  async function loadImportedDataSource(input: ImportedProtocolInput, dataSourceId?: string) {
    const table = await standardizeImportedProtocolAsync({ ...input, dataSourceId });
    setImportedTable(table);
    setFieldMapping(createPointFieldMapping(table.headers));
  }

  async function changeImportedDataSource(dataSourceId: string) {
    if (!importInput) return;
    setSelectedDataSourceId(dataSourceId);
    await loadImportedDataSource(importInput, dataSourceId);
  }

  function confirmPointModelImport() {
    if (!importArtifacts || !pointValidation.canImport) return;
    const profile = createDeviceProfileFromPointArtifacts(importMeta, importArtifacts);
    onImportProfile(profile);
  }

  function saveMappingTemplate() {
    if (!importedTable) return;
    const template = createPointFieldMappingTemplate({
      id: `template-${Date.now()}`,
      name: templateName || `${importMeta.name}字段映射模板`,
      sourceKind: importedTable.source.kind,
      headers: importedTable.headers,
      mapping: fieldMapping,
    });
    setMappingTemplates((current) => {
      const next = [template, ...current.filter((item) => item.id !== template.id)];
      createBrowserTemplateRepository().save(next);
      return next;
    });
  }

  function reuseMappingTemplate(templateId: string) {
    if (!importedTable) return;
    const template = mappingTemplates.find((item) => item.id === templateId);
    if (!template) return;
    setFieldMapping(applyPointFieldMappingTemplate(template, importedTable.headers));
    setTemplateName(template.name);
  }

  function focusProtocolAssets() {
    protocolAssetsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    protocolAssetsRef.current?.focus();
  }

  function focusProtocolEditor() {
    protocolEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function exportProfile() {
    const json = exportStandardDeviceProfileJson(selectedProfile);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedProfile.id}.device-profile.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="protocol-lab" aria-label="通用协议实验室">
      <header className="protocol-hero glass-panel">
        <div>
          <span className="eyebrow">Universal Protocol Lab</span>
          <h1>通用协议实验室</h1>
          <p>导入 Excel / CSV / JSON 协议，完成字段映射、PointModel 校验和 Device Profile 生成。</p>
        </div>
        <div className="hero-actions">
          <label className="lab-button primary">
            <UploadCloud size={17} />
            导入协议
            <input accept=".csv,.json,.xlsx,.xls" type="file" onChange={handleImportFile} />
          </label>
          <button className="lab-button" type="button" onClick={focusProtocolAssets}>选择协议</button>
          <button className="lab-button" type="button" onClick={exportProfile}><Download size={17} />导出协议</button>
          <button className="lab-button" type="button" onClick={focusProtocolEditor}><Save size={17} />编辑协议</button>
        </div>
      </header>

      <section className="current-profile-strip glass-panel">
        <ProfileFact label="当前协议" value={selectedProfile.name} />
        <ProfileFact label="设备类型" value={selectedProfile.deviceType} />
        <ProfileFact label="通信类型" value={selectedProfile.communicationType} />
        <ProfileFact label="协议版本" value={selectedProfile.version} />
        <ProfileFact label="校验状态" value={validation.status === "error" ? "存在错误" : validation.status === "warning" ? "存在警告" : "通过"} tone={validation.status} />
      </section>

      <div className="protocol-layout">
        <aside className="protocol-sidebar glass-panel" ref={protocolAssetsRef} tabIndex={-1}>
          <h2>协议资产中心</h2>
          <p>协议列表、当前选择和厂家/版本/设备/通信类型来自 Profile 元数据。</p>
          <div className="profile-list">
            {profiles.map((profile) => (
              <button
                className={profile.id === selectedProfile.id ? "profile-card active" : "profile-card"}
                key={profile.id}
                type="button"
                onClick={() => onSelectProfile(profile.id)}
              >
                <strong>{profile.name}</strong>
                <span>{profile.deviceType} · {profile.communicationType}</span>
                <small>{profile.vendor} / v{profile.version}</small>
              </button>
            ))}
          </div>
        </aside>

        <main className="protocol-main-stack">
          <ProtocolOverview summary={summary} />
          <ImportWizard
            table={importedTable}
            dataSources={dataSources}
            selectedDataSourceId={selectedDataSourceId}
            onDataSourceChange={changeImportedDataSource}
            mapping={fieldMapping}
            meta={importMeta}
            artifacts={importArtifacts}
            validation={pointValidation}
            validationCounts={pointValidationCounts}
            templates={mappingTemplates}
            templateName={templateName}
            onTemplateNameChange={setTemplateName}
            onSaveTemplate={saveMappingTemplate}
            onReuseTemplate={reuseMappingTemplate}
            onMappingChange={(key, header) => setFieldMapping((current) => ({ ...current, [key]: header }))}
            onMetaChange={(key, value) => setImportMeta((current) => ({ ...current, [key]: value }))}
            onGenerate={confirmPointModelImport}
          />
          <ValidationPanel counts={validationCounts} items={validation.items} />
          <div ref={protocolEditorRef}>
            <ProfileRegisterTable registers={selectedProfile.registers} />
          </div>
        </main>
      </div>
    </section>
  );
}

function choosePreferredDataSource(sources: ImportedProtocolDataSource[]) {
  return [...sources].sort((left, right) => scoreDataSource(right) - scoreDataSource(left))[0];
}

function scoreDataSource(source: ImportedProtocolDataSource) {
  const headerText = source.headers.join(" ").toLowerCase();
  const aliasScore = ["地址", "寄存器", "名称", "类型", "读写", "权限", "单位", "备注", "address", "name", "type", "rw", "unit"]
    .filter((alias) => headerText.includes(alias.toLowerCase())).length;
  return aliasScore * 1000 + source.rowCount;
}

function inferImportFileType(fileName: string): ImportFileType {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".xls") || lower.endsWith(".xlsx")) return "excel";
  return "csv";
}

function ProfileFact({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className={`profile-fact ${tone ? `tone-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ProtocolOverview({ summary }: { summary: ReturnType<typeof summarizeDeviceProfile> }) {
  const cards = [
    ["寄存器数量", summary.registerCount],
    ["可读数量", summary.readableCount],
    ["可写数量", summary.writableCount],
    ["地址范围", summary.addressRange],
    ["枚举数量", summary.enumCount],
    ["bit 位数量", summary.bitCount],
  ];

  return (
    <section className="lab-card glass-panel">
      <SectionTitle icon={FileJson} title="协议概览" helper="从 Device Profile 实时统计" />
      <div className="overview-grid">
        {cards.map(([label, value]) => (
          <div className="overview-cell" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function slugId(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "import";
}

function countPointValidationBySeverity(result: Pick<PointValidationResult, "items">): Record<ValidationSeverity, number> {
  return result.items.reduce<Record<ValidationSeverity, number>>(
    (counts, item) => {
      counts[item.severity] += 1;
      return counts;
    },
    { error: 0, warning: 0, info: 0 },
  );
}

function groupPointIssues(validation: PointValidationResult) {
  const issueMap = new Map<string, ValidationSeverity>();
  const severityRank: Record<ValidationSeverity, number> = { info: 0, warning: 1, error: 2 };
  for (const item of validation.items) {
    if (!item.pointId) continue;
    const current = issueMap.get(item.pointId) ?? "info";
    if (severityRank[item.severity] > severityRank[current]) issueMap.set(item.pointId, item.severity);
  }
  return issueMap;
}

function activeWizardIndex(table: ImportedProtocolTable | null, validation: PointValidationResult) {
  if (!table) return 0;
  if (validation.items.some((item) => item.severity === "error")) return 9;
  return 11;
}

function wizardStepDetail(title: string, table: ImportedProtocolTable | null, artifacts: ProtocolImportArtifacts | null) {
  if (!table) return "等待导入";
  const details: Record<string, string> = {
    "选择协议文件": table.source.fileName,
    "选择 sheet / 数据源": `${table.source.kind} · ${table.rows.length} 行`,
    "自动识别表头": `${table.headers.length} 列`,
    "字段映射": "可手动调整任意列名",
    "地址格式识别": "decimal / hex / 40001",
    "数据类型识别": "uint16 / int16 / uint32 / int32 / float",
    "倍率/单位识别": "0.1V / 0.01kW",
    "枚举/bit 位识别": "备注与映射列双通道",
    "导入预览": `${artifacts?.pointModels.length ?? 0} 个 PointModel`,
    "校验结果": "error / warning / info",
    "确认导入": "错误会阻止导入",
    "生成协议模型": "ProtocolModel / DeviceTemplate / RegisterTable / RealtimePageConfig / SimulationModel",
  };
  return details[title] ?? "已就绪";
}

type PointFieldDefinition = {
  key: PointFieldKey;
  label: string;
  required: boolean;
  hint: string;
};

const pointFieldDefinitions: PointFieldDefinition[] = [
  { key: "point_id", label: "point_id", required: false, hint: "点位唯一 ID，可自动生成" },
  { key: "device_type", label: "device_type", required: false, hint: "设备类型，默认使用导入元数据" },
  { key: "area", label: "area", required: false, hint: "coil / input_register / holding_register" },
  { key: "address", label: "address", required: true, hint: "十进制、0x 十六进制或 40001 类地址" },
  { key: "name", label: "name", required: true, hint: "寄存器名称 / 点位名称" },
  { key: "data_type", label: "data_type", required: true, hint: "uint16 / int16 / uint32 / int32 / float" },
  { key: "word_count", label: "word_count", required: false, hint: "字数，不填则按类型推断" },
  { key: "byte_order", label: "byte_order", required: false, hint: "AB / ABCD / CDAB" },
  { key: "scale", label: "scale", required: false, hint: "倍率，也可从单位列 0.1V 识别" },
  { key: "offset", label: "offset", required: false, hint: "工程值偏移" },
  { key: "unit", label: "unit", required: false, hint: "单位或 0.01kW 这类倍率单位" },
  { key: "rw", label: "rw", required: true, hint: "R / W / R/W" },
  { key: "min", label: "min", required: false, hint: "最小值" },
  { key: "max", label: "max", required: false, hint: "最大值" },
  { key: "default_value", label: "default_value", required: false, hint: "模拟默认值" },
  { key: "enum_map", label: "enum_map", required: false, hint: "0=停机;1=运行" },
  { key: "bit_define", label: "bit_define", required: false, hint: "bit0=告警 bit1=故障" },
  { key: "remark", label: "remark", required: false, hint: "备注中可识别枚举、bit、范围" },
  { key: "group", label: "group", required: false, hint: "监控分组" },
  { key: "page", label: "page", required: false, hint: "实时监控页面" },
  { key: "poll_cycle", label: "poll_cycle", required: false, hint: "轮询周期 ms" },
  { key: "simulate_rule", label: "simulate_rule", required: false, hint: "fixed / random / sine" },
];

type ImportWizardProps = {
  table: ImportedProtocolTable | null;
  dataSources: ImportedProtocolDataSource[];
  selectedDataSourceId?: string;
  onDataSourceChange: (dataSourceId: string) => void;
  mapping: PointFieldMapping;
  meta: ImportDraftMeta;
  artifacts: ProtocolImportArtifacts | null;
  validation: PointValidationResult;
  validationCounts: Record<ValidationSeverity, number>;
  templates: PointFieldMappingTemplate[];
  templateName: string;
  onTemplateNameChange: (value: string) => void;
  onSaveTemplate: () => void;
  onReuseTemplate: (templateId: string) => void;
  onMappingChange: (key: PointFieldKey, header: string | undefined) => void;
  onMetaChange: (key: keyof ImportDraftMeta, value: string) => void;
  onGenerate: () => void;
};

function ImportWizard({
  table,
  dataSources,
  selectedDataSourceId,
  onDataSourceChange,
  mapping,
  meta,
  artifacts,
  validation,
  validationCounts,
  templates,
  templateName,
  onTemplateNameChange,
  onSaveTemplate,
  onReuseTemplate,
  onMappingChange,
  onMetaChange,
  onGenerate,
}: ImportWizardProps) {
  const [wizardStepIndex, setWizardStepIndex] = useState(0);
  const pointIssues = useMemo(() => groupPointIssues(validation), [validation]);
  const generatedRealtimePageCount = artifacts ? artifacts.realtimePageConfig.pages.length : 0;
  const generatedSimulationRegisterCount = artifacts ? artifacts.simulationModel.registers.length : 0;
  const wizardStepIndexLimit = table ? activeWizardIndex(table, validation) : 0;
  const currentWizardStepIndex = table ? Math.min(wizardStepIndex, wizardStepIndexLimit) : 0;

  function goPreviousWizardStep() {
    setWizardStepIndex((current) => Math.max(0, current - 1));
  }

  function goNextWizardStep() {
    setWizardStepIndex((current) => Math.min(wizardStepIndexLimit, current + 1));
  }

  return (
    <section className="lab-card glass-panel protocol-import-pro">
      <SectionTitle icon={FileInput} title="通用协议导入向导 Pro" helper="Excel / CSV / JSON → 字段映射 → PointModel → ProtocolModel / RealtimePageConfig / SimulationModel" />
      <div className="wizard-pro-layout">
        <aside className="wizard-pro-steps" aria-label="协议导入步骤">
          {[
            "选择协议文件",
            "选择 sheet / 数据源",
            "自动识别表头",
            "字段映射",
            "地址格式识别",
            "数据类型识别",
            "倍率/单位识别",
            "枚举/bit 位识别",
            "导入预览",
            "校验结果",
            "确认导入",
            "生成协议模型",
          ].map((title, index) => (
            <WizardStep key={title} index={String(index + 1).padStart(2, "0")} title={title} active={Boolean(table) && index <= currentWizardStepIndex} detail={wizardStepDetail(title, table, artifacts)} />
          ))}
        </aside>

        <div className="wizard-pro-main">
          {!table ? <p className="wizard-empty">等待选择协议文件。支持任意 Excel / CSV / JSON 表，导入后先做字段映射和预览校验，不写死特定设备协议格式。</p> : (
            <>
              <div className="import-meta-grid">
                {(Object.keys(meta) as (keyof ImportDraftMeta)[]).map((key) => (
                  <label key={key}>
                    <span>{metaLabel(key)}</span>
                    <input value={meta[key]} onChange={(event) => onMetaChange(key, event.target.value)} />
                  </label>
                ))}
              </div>

              <div className="data-source-selector">
                <label>
                  <span>选择 sheet / 数据源</span>
                  <select value={selectedDataSourceId ?? ""} onChange={(event) => onDataSourceChange(event.target.value)}>
                    {dataSources.map((source) => (
                      <option value={source.id} key={source.id}>{source.name} · {source.kind} · {source.rowCount} 行</option>
                    ))}
                  </select>
                </label>
                <small>当前数据源：{table.source.dataSourceName ?? table.source.fileName}；自动识别表头 {table.headers.length} 列。</small>
              </div>

              <div className="template-toolbar">
                <label>
                  <span>保存字段映射模板</span>
                  <input value={templateName} onChange={(event) => onTemplateNameChange(event.target.value)} />
                </label>
                <button className="mini-button" type="button" onClick={onSaveTemplate}><Save size={14} />保存字段映射模板</button>
                <label>
                  <span>复用字段映射模板</span>
                  <select value="" onChange={(event) => onReuseTemplate(event.target.value)}>
                    <option value="">选择模板</option>
                    {templates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}
                  </select>
                </label>
              </div>

              <div className="mapping-table-wrap">
                <table className="mapping-table">
                  <thead>
                    <tr><th>PointModel 字段</th><th>必填</th><th>源列</th><th>智能识别</th></tr>
                  </thead>
                  <tbody>
                    {pointFieldDefinitions.map((definition) => (
                      <tr key={definition.key}>
                        <td><code>{definition.label}</code></td>
                        <td>{definition.required ? "是" : "否"}</td>
                        <td>
                          <select value={mapping[definition.key] ?? ""} onChange={(event) => onMappingChange(definition.key, event.target.value || undefined)}>
                            <option value="">不映射</option>
                            {table.headers.map((header) => <option value={header} key={header}>{header}</option>)}
                          </select>
                        </td>
                        <td><small>{definition.hint}</small></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ImportPreviewTable artifacts={artifacts} pointIssues={pointIssues} />
              <PointValidationPanel counts={validationCounts} items={validation.items} />
            </>
          )}
        </div>

        <aside className="wizard-pro-summary" aria-label="导入摘要">
          <h3>右侧导入摘要</h3>
          <SummaryCell label="源文件" value={table ? `${table.source.fileName} · ${table.source.kind}` : "未选择"} />
          <SummaryCell label="表头数量" value={String(table?.headers.length ?? 0)} />
          <SummaryCell label="PointModel" value={String(artifacts?.pointModels.length ?? 0)} />
          <SummaryCell label="ProtocolModel" value={artifacts?.protocolModel.name ?? "待生成"} />
          <SummaryCell label="DeviceTemplate" value={artifacts?.deviceTemplate.name ?? "待生成"} />
          <SummaryCell label="RegisterTable" value={`${artifacts?.registerTable.rows.length ?? 0} 行`} />
          <SummaryCell label="RealtimePageConfig" value={`${generatedRealtimePageCount} 页`} />
          <SummaryCell label="SimulationModel" value={`${generatedSimulationRegisterCount} 个从机模拟寄存器`} />
        </aside>
      </div>

      <div className="wizard-footer">
        <button className="lab-button" type="button" onClick={goPreviousWizardStep} disabled={!table || currentWizardStepIndex <= 0}>上一步</button>
        <button className="lab-button" type="button" onClick={goNextWizardStep} disabled={!table || currentWizardStepIndex >= wizardStepIndexLimit}>下一步</button>
        <button className="lab-button primary inline" type="button" onClick={onGenerate} disabled={!table || !validation.canImport}>
          <RefreshCw size={16} />确认导入并生成协议模型
        </button>
      </div>
      <span className="sr-only">生成统一 Device Profile JSON：兼容旧运行面板，PointModel 为导入向导 Pro 的统一模型。</span>
    </section>
  );
}

function ImportPreviewTable({ artifacts, pointIssues }: { artifacts: ProtocolImportArtifacts | null; pointIssues: Map<string, ValidationSeverity> }) {
  const [previewFilter, setPreviewFilter] = useState("");
  const filteredPreviewPoints = useMemo(() => {
    const points = artifacts?.pointModels ?? [];
    const keyword = previewFilter.trim().toLowerCase();
    if (!keyword) return points;
    return points.filter((point) => [
      point.point_id,
      String(point.address),
      point.name,
      point.data_type,
      point.unit,
      point.rw,
      point.group,
      point.page,
      point.remark,
    ].some((value) => value.toLowerCase().includes(keyword)));
  }, [artifacts, previewFilter]);
  const previewPoints = filteredPreviewPoints.slice(0, 8);
  return (
    <div className="point-preview-panel">
      <h3>导入预览</h3>
      <p>支持表格筛选、错误高亮、字段映射修改；当前展示前 {previewPoints.length} 行 PointModel。</p>
      <label className="preview-filter">
        <span>导入预览筛选</span>
        <input value={previewFilter} placeholder="按 point_id / address / name / type / unit 过滤" onChange={(event) => setPreviewFilter(event.target.value)} />
      </label>
      <span className="sr-only">point-preview-row severity-error 表示导入预览错误行。</span>
      <div className="memory-table-wrap">
        <table className="memory-table point-preview-table">
          <thead>
            <tr><th>point_id</th><th>address</th><th>name</th><th>data_type</th><th>word_count</th><th>scale</th><th>unit</th><th>rw</th><th>enum_map</th><th>bit_define</th></tr>
          </thead>
          <tbody>
            {previewPoints.map((point) => {
              const severityClass = `severity-${pointIssues.get(point.point_id) ?? "info"}`;
              return (
                <tr className={`point-preview-row ${severityClass}`} key={point.point_id}>
                  <td>{point.point_id}</td><td>{point.address}</td><td>{point.name}</td><td>{point.data_type}</td><td>{point.word_count}</td><td>{point.scale}</td><td>{point.unit || "-"}</td><td>{point.rw || "-"}</td><td>{Object.keys(point.enum_map).length}</td><td>{Object.keys(point.bit_define).length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PointValidationPanel({ counts, items }: { counts: Record<ValidationSeverity, number>; items: PointValidationResult["items"] }) {
  return (
    <div className="point-validation-panel">
      <h3>校验结果</h3>
      <div className="validation-summary">
        {(Object.keys(severityLabels) as ValidationSeverity[]).map((severity) => (
          <span className={`validation-pill severity-${severity}`} key={severity}>{severityLabels[severity]} {counts[severity]}</span>
        ))}
      </div>
      <div className="validation-list">
        {items.slice(0, 10).map((item) => (
          <article className={`validation-item severity-${item.severity}`} key={`${item.code}-${item.message}`}>
            <strong>{item.code}</strong>
            <span>{item.message}</span>
          </article>
        ))}
      </div>
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return <div className="summary-cell"><span>{label}</span><strong>{value}</strong></div>;
}

function metaLabel(key: keyof ImportDraftMeta) {
  const labels: Record<keyof ImportDraftMeta, string> = {
    name: "协议名称",
    version: "协议版本",
    deviceType: "设备类型",
    vendor: "厂家",
    communicationType: "通信类型",
  };
  return labels[key];
}

function WizardStep({ index, title, detail, active }: { index: string; title: string; detail: string; active: boolean }) {
  return (
    <div className={active ? "wizard-step active" : "wizard-step"}>
      <span>{index}</span>
      <strong>{title}</strong>
      <small>{detail}</small>
    </div>
  );
}

function ValidationPanel({ counts, items }: { counts: Record<ValidationSeverity, number>; items: { severity: ValidationSeverity; code: string; message: string }[] }) {
  return (
    <section className="lab-card glass-panel">
      <SectionTitle icon={AlertTriangle} title="协议校验" helper="错误会阻止协议确认导入" />
      <div className="validation-summary">
        {(Object.keys(severityLabels) as ValidationSeverity[]).map((severity) => (
          <span className={`validation-pill severity-${severity}`} key={severity}>{severityLabels[severity]} {counts[severity]}</span>
        ))}
      </div>
      <div className="validation-list">
        {items.slice(0, 8).map((item) => (
          <article className={`validation-item severity-${item.severity}`} key={`${item.code}-${item.message}`}>
            <strong>{item.code}</strong>
            <span>{item.message}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProfileRegisterTable({ registers }: { registers: DeviceRegister[] }) {
  return (
    <section className="lab-card glass-panel wide-card">
      <SectionTitle icon={FileJson} title="协议寄存器表" helper="地址、名称、功能码、数据类型、长度、单位、倍率、读写和默认值" />
      <div className="memory-table-wrap">
        <table className="memory-table">
          <thead>
            <tr>
              <th>地址</th><th>名称</th><th>功能码</th><th>类型</th><th>长度</th><th>当前值</th><th>单位</th><th>倍率</th><th>读写</th><th>分组</th>
            </tr>
          </thead>
          <tbody>
            {registers.map((register) => (
              <tr key={register.id}>
                <td>{register.address}</td>
                <td><strong>{register.name}</strong><small>{register.description || register.group}</small></td>
                <td>{register.functionCode}</td>
                <td>{register.dataType}</td>
                <td>{register.length}</td>
                <td>{String(register.currentValue)}</td>
                <td>{register.unit || "-"}</td>
                <td>{register.scale}</td>
                <td>{accessLabel(register.access)}</td>
                <td>{register.group || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SectionTitle({ icon: Icon, title, helper }: { icon: typeof FileJson; title: string; helper: string }) {
  return (
    <div className="lab-section-title">
      <Icon size={18} />
      <div>
        <h2>{title}</h2>
        <p>{helper}</p>
      </div>
    </div>
  );
}

function accessLabel(access: string) {
  if (access === "read") return "只读";
  if (access === "write") return "只写";
  if (access === "readWrite") return "读写";
  return access;
}
