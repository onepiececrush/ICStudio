import { Fragment, useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileInput,
  PauseCircle,
  Pin,
  PinOff,
  PlayCircle,
  RadioTower,
  RefreshCw,
  X,
} from "lucide-react";
import type { DeviceProfile, DeviceRegister } from "../protocol/deviceProfile";
import type { ImportedProtocolInput, ImportFileType } from "../protocol/importer";
import { importDeviceProfileFromProtocolInput } from "../protocol/quickImport";
import type { FrameLog } from "../simulator/simulatorEngine";
import { formatSimulatorRegisterEditorValue } from "../simulator/registerValue";
import type { SimulatorExceptionStats, SimulatorRegisterMeta, SimulatorWorkspaceState } from "../simulator/workspace";
import type { TransportListenConfig } from "../transport/transportLayer";
import { SimulatorRegisterValueInput } from "./SimulatorRegisterValueInput";

export function SimulatorWorkbench({
  workspace,
  selectedProfile,
  onSelectProfile,
  onImportProfile,
  onTransportConfigChange,
  onRegisterCommit,
  onTogglePin,
  onStart,
  onStop,
  onApplyScenario,
  onNoticeClear,
  onRefreshLogs,
}: {
  workspace: SimulatorWorkspaceState;
  selectedProfile: DeviceProfile | null;
  onSelectProfile: (profileId: string) => void;
  onImportProfile: (profile: DeviceProfile) => void;
  onTransportConfigChange: (config: TransportListenConfig) => void;
  onRegisterCommit: (registerId: string, value: string) => Promise<boolean>;
  onTogglePin: (registerId: string) => void;
  onStart: () => Promise<void>;
  onStop: () => Promise<void>;
  onApplyScenario: (scenarioId: string) => Promise<void>;
  onNoticeClear: () => void;
  onRefreshLogs: () => Promise<void>;
}) {
  const [quickImportBusy, setQuickImportBusy] = useState(false);
  const [quickImportNotice, setQuickImportNotice] = useState("");
  const registerCount = selectedProfile?.registers.length ?? 0;
  const writableCount = selectedProfile?.registers.filter((register) => register.access === "write" || register.access === "readWrite").length ?? 0;
  const endpoint = workspace.running ? workspace.serverStatus.endpoint : `${workspace.transportConfig.tcp.ip}:${workspace.transportConfig.tcp.port}`;
  const unitId = workspace.running ? workspace.serverStatus.unitId : workspace.transportConfig.rtu.slaveId;

  async function handleQuickImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const fileType = inferImportFileType(file.name);
    const content = fileType === "excel" ? await file.arrayBuffer() : await file.text();
    const name = file.name.replace(/\.[^.]+$/, "") || "导入模拟协议";
    const input: ImportedProtocolInput = { fileName: file.name, fileType, content };
    setQuickImportBusy(true);
    setQuickImportNotice(`正在导入 ${file.name} ...`);
    try {
      const result = await importDeviceProfileFromProtocolInput(input, {
        name,
        version: "1.0.0",
        deviceType: "通用设备",
        vendor: "未指定厂家",
        communicationType: "Modbus TCP",
      });
      onImportProfile(result.profile);
      setQuickImportNotice(`已导入 ${result.pointCount} 个寄存器，数据源：${result.dataSource?.name ?? file.name}${result.warningCount ? `，${result.warningCount} 个提示/警告` : ""}`);
    } catch (error) {
      setQuickImportNotice(`导入失败：${String(error || "未知错误")}`);
    } finally {
      setQuickImportBusy(false);
    }
  }

  return (
    <section className="protocol-lab simulator-workbench" aria-label="从机模拟中心">
      <header className="protocol-hero glass-panel">
        <div>
          <span className="eyebrow">Simulator Center</span>
          <h1>从机模拟中心</h1>
          <p>运行态页面只处理设备选择、监听配置、寄存器写值、场景、故障和报文；跨页面快速改值请用标题栏“模拟快调”。</p>
        </div>
        <div className="hero-actions">
          <label className={workspace.running || workspace.busy || quickImportBusy ? "lab-button disabled" : "lab-button"}>
            <FileInput size={17} />导入协议
            <input accept=".csv,.json,.xlsx,.xls" disabled={workspace.running || workspace.busy || quickImportBusy} type="file" onChange={handleQuickImportFile} />
          </label>
          <button className="lab-button primary" type="button" onClick={() => void onStart()} disabled={!selectedProfile || workspace.running || workspace.busy}>
            <PlayCircle size={17} />启动模拟
          </button>
          <button className="lab-button danger" type="button" onClick={() => void onStop()} disabled={!workspace.running || workspace.busy}>
            <PauseCircle size={17} />停止模拟
          </button>
        </div>
      </header>

      {workspace.notice ? (
        <section className={`simulator-notice glass-panel tone-${workspace.notice.tone}`}>
          <div>
            <strong>{workspace.notice.tone === "error" ? "模拟异常" : workspace.notice.tone === "success" ? "模拟状态已更新" : "模拟处理中"}</strong>
            <span>{workspace.notice.text}</span>
          </div>
          <button type="button" aria-label="关闭模拟提示" onClick={onNoticeClear}>
            <X size={16} />
          </button>
        </section>
      ) : null}

      {quickImportNotice ? (
        <section className={`simulator-notice glass-panel ${quickImportNotice.startsWith("导入失败") ? "tone-error" : quickImportNotice.startsWith("已导入") ? "tone-success" : "tone-info"}`}>
          <div>
            <strong>{quickImportNotice.startsWith("导入失败") ? "协议导入失败" : quickImportNotice.startsWith("已导入") ? "协议已导入" : "正在导入协议"}</strong>
            <span>{quickImportNotice}</span>
          </div>
          <button type="button" aria-label="关闭协议导入提示" onClick={() => setQuickImportNotice("")}>
            <X size={16} />
          </button>
        </section>
      ) : null}

      <section className="current-profile-strip glass-panel">
        <ProfileFact label="当前模拟设备" value={selectedProfile?.name ?? "未选择"} />
        <ProfileFact label="设备类型" value={selectedProfile?.deviceType ?? "--"} />
        <ProfileFact label="运行状态" value={workspace.running ? "运行中" : "未启动"} tone={workspace.running ? "info" : undefined} />
        <ProfileFact label="监听地址" value={endpoint} />
        <ProfileFact label="Unit ID" value={String(unitId)} />
      </section>

      <SimulatorRunningBanner
        running={workspace.running}
        endpoint={endpoint}
        unitId={unitId}
        frameCount={workspace.frameLogs.length}
        registerCount={registerCount}
        writableCount={writableCount}
      />

      <div className="protocol-layout simulator-layout">
        <aside className="protocol-sidebar glass-panel simulator-device-sidebar">
          <h2>模拟工程 / 设备</h2>
          <p>导入协议后会自动成为可选模拟设备。运行中锁定设备切换，避免误把同一端口切到另一套寄存器。</p>
          <div className="profile-list">
            {workspace.profiles.map((profile) => (
              <button
                className={profile.id === selectedProfile?.id ? "profile-card active" : "profile-card"}
                key={profile.id}
                type="button"
                disabled={workspace.running || workspace.busy}
                onClick={() => onSelectProfile(profile.id)}
              >
                <strong>{profile.name}</strong>
                <span>{profile.deviceType} · {profile.communicationType}</span>
                <small>{profile.vendor} / v{profile.version}</small>
              </button>
            ))}
          </div>
          <div className="simulator-sidebar-facts">
            <SidebarFact label="寄存器总数" value={String(registerCount)} />
            <SidebarFact label="协议可写" value={String(writableCount)} />
            <SidebarFact label="已 Pin 快调项" value={String(workspace.pinnedRegisterIds.length)} />
            <SidebarFact label="报文记录" value={String(workspace.frameLogs.length)} />
          </div>
        </aside>

        <main className="protocol-main-stack">
          <TransportPanel
            config={workspace.transportConfig}
            running={workspace.running}
            busy={workspace.busy}
            onChange={onTransportConfigChange}
          />
          {selectedProfile ? (
            <RegisterMemoryTable
              registers={selectedProfile.registers}
              pinnedRegisterIds={workspace.pinnedRegisterIds}
              registerMeta={workspace.registerMeta}
              onRegisterCommit={onRegisterCommit}
              onTogglePin={onTogglePin}
            />
          ) : null}
          {selectedProfile ? <ScenarioPanel profile={selectedProfile} onApply={onApplyScenario} /> : null}
          <RuntimePanels
            running={workspace.running}
            frameLogs={workspace.frameLogs}
            backendLogs={workspace.backendLogs}
            exceptionStats={workspace.exceptionStats}
            onRefreshLogs={onRefreshLogs}
          />
        </main>
      </div>
    </section>
  );
}

function ProfileFact({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className={`profile-fact ${tone ? `tone-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SidebarFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-cell">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function inferImportFileType(fileName: string): ImportFileType {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".xls") || lower.endsWith(".xlsx")) return "excel";
  return "csv";
}

function SimulatorRunningBanner({
  running,
  endpoint,
  unitId,
  frameCount,
  registerCount,
  writableCount,
}: {
  running: boolean;
  endpoint: string;
  unitId: number;
  frameCount: number;
  registerCount: number;
  writableCount: number;
}) {
  return (
    <section className={`simulator-live-banner glass-panel ${running ? "is-running" : "is-stopped"}`} aria-label="从机模拟运行状态">
      <div className="simulator-live-orb" aria-hidden="true">
        <RadioTower size={24} />
      </div>
      <div className="simulator-live-main">
        <span className="eyebrow">Simulator Runtime</span>
        <h2>{running ? "从机模拟已开启" : "从机模拟未启动"}</h2>
        <p>{running ? `正在监听 tcp://${endpoint} · unit=${unitId}` : "选择设备并确认监听配置后启动模拟。启动后可在任意页面通过全局快调抽屉修改值。"}</p>
      </div>
      <div className="simulator-live-stats">
        <div><span>运行状态</span><strong>{running ? "RUNNING" : "STOPPED"}</strong></div>
        <div><span>寄存器</span><strong>{registerCount}</strong></div>
        <div><span>可写点</span><strong>{writableCount}</strong></div>
        <div><span>报文记录</span><strong>{frameCount}</strong></div>
      </div>
      {running ? <div className="simulator-signal-wave" aria-hidden="true" /> : null}
    </section>
  );
}

function TransportPanel({
  config,
  running,
  busy,
  onChange,
}: {
  config: TransportListenConfig;
  running: boolean;
  busy: boolean;
  onChange: (config: TransportListenConfig) => void;
}) {
  function updateTcp(key: keyof TransportListenConfig["tcp"], value: string) {
    onChange({
      ...config,
      tcp: {
        ...config.tcp,
        [key]: key === "port" ? Number(value) || 0 : value,
      },
    });
  }

  function updateRtu(key: keyof TransportListenConfig["rtu"], value: string) {
    onChange({
      ...config,
      rtu: {
        ...config.rtu,
        [key]: key === "serialPort" ? value : Number(value) || 0,
      },
    });
  }

  return (
    <section className="lab-card glass-panel">
      <SectionTitle
        icon={CheckCircle2}
        title="监听配置"
        helper={running ? `模拟运行中：tcp://${config.tcp.ip}:${config.tcp.port} · unit=${config.rtu.slaveId}` : "先配置 TCP / RTU 监听信息，再启动当前模拟设备"}
      />
      <div className="transport-grid">
        <ConfigInputCell label="TCP IP" value={config.tcp.ip} disabled={running || busy} onChange={(value) => updateTcp("ip", value)} />
        <ConfigInputCell label="TCP 端口" type="number" value={String(config.tcp.port)} disabled={running || busy} min={1} max={65535} onChange={(value) => updateTcp("port", value)} />
        <ConfigInputCell label="RTU 串口" value={config.rtu.serialPort} disabled={running || busy} onChange={(value) => updateRtu("serialPort", value)} />
        <ConfigInputCell label="RTU 波特率" type="number" value={String(config.rtu.baudRate)} disabled={running || busy} min={1} onChange={(value) => updateRtu("baudRate", value)} />
        <ConfigInputCell label="RTU 从站地址" type="number" value={String(config.rtu.slaveId)} disabled={running || busy} min={1} max={247} onChange={(value) => updateRtu("slaveId", value)} />
        <ConfigCell label="提示" value="标题栏“模拟快调”支持跨页面随时改值" />
      </div>
    </section>
  );
}

function ConfigCell({ label, value }: { label: string; value: string }) {
  return <div className="config-cell"><span>{label}</span><strong>{value}</strong></div>;
}

function ConfigInputCell({
  label,
  value,
  type = "text",
  disabled,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  type?: "text" | "number";
  disabled: boolean;
  min?: number;
  max?: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="config-cell config-input-cell">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function RegisterMemoryTable({
  registers,
  pinnedRegisterIds,
  registerMeta,
  onRegisterCommit,
  onTogglePin,
}: {
  registers: DeviceRegister[];
  pinnedRegisterIds: string[];
  registerMeta: Record<string, SimulatorRegisterMeta>;
  onRegisterCommit: (registerId: string, value: string) => Promise<boolean>;
  onTogglePin: (registerId: string) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [accessFilter, setAccessFilter] = useState<"all" | "writable" | "pinned">("all");
  const [expandedGroupNames, setExpandedGroupNames] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const filteredRegisters = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return registers.filter((register) => {
      if (accessFilter === "writable" && !(register.access === "write" || register.access === "readWrite")) return false;
      if (accessFilter === "pinned" && !pinnedRegisterIds.includes(register.id)) return false;
      if (!normalizedKeyword) return true;
      return [
        String(register.address),
        register.name,
        register.dataType,
        register.group,
        register.description,
      ].some((field) => String(field ?? "").toLowerCase().includes(normalizedKeyword));
    });
  }, [accessFilter, keyword, pinnedRegisterIds, registers]);
  const pageCount = Math.max(1, Math.ceil(filteredRegisters.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * pageSize;
  const pageRegisters = filteredRegisters.slice(pageStart, pageStart + pageSize);
  const pageStartLabel = filteredRegisters.length ? pageStart + 1 : 0;
  const pageEnd = pageStart + pageRegisters.length;
  const registerGroups = useMemo(() => groupRegisters(pageRegisters), [pageRegisters]);
  const defaultExpandedGroupNames = registerGroups.slice(0, 1).map((group) => group.name);
  const shouldExpandMatches = keyword.trim().length > 0 || accessFilter !== "all" || registerGroups.length <= 1;
  const registerGroupNames = registerGroups.map((group) => group.name);
  const validExpandedGroupNames = expandedGroupNames.filter((name) => registerGroupNames.includes(name));
  const visibleExpandedGroupNames = shouldExpandMatches
    ? registerGroupNames
    : (validExpandedGroupNames.length ? validExpandedGroupNames : defaultExpandedGroupNames);
  const allGroupsExpanded = registerGroups.length > 0 && visibleExpandedGroupNames.length === registerGroups.length;

  useEffect(() => {
    setPage(1);
  }, [accessFilter, keyword, pageSize]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  function toggleGroup(groupName: string) {
    setExpandedGroupNames((current) => {
      const activeGroupNames = current.length ? current : defaultExpandedGroupNames;
      return activeGroupNames.includes(groupName)
        ? activeGroupNames.filter((name) => name !== groupName)
        : [...activeGroupNames, groupName];
    });
  }

  return (
    <section className="lab-card glass-panel wide-card">
      <SectionTitle icon={RadioTower} title="寄存器模拟表" helper="输入工程值，写入时按倍率换算为下位机原始寄存器值并同步到运行态模拟器" />
      <div className="simulator-table-toolbar">
        <label className="preview-filter">
          <span>搜索寄存器</span>
          <input value={keyword} placeholder="按地址 / 名称 / 类型 / 分组过滤" onChange={(event) => setKeyword(event.target.value)} />
        </label>
        <div className="simulator-filter-pills">
          <button className={`mini-button ${accessFilter === "all" ? "active" : ""}`} type="button" onClick={() => setAccessFilter("all")}>全部</button>
          <button className={`mini-button ${accessFilter === "writable" ? "active" : ""}`} type="button" onClick={() => setAccessFilter("writable")}>可写</button>
          <button className={`mini-button ${accessFilter === "pinned" ? "active" : ""}`} type="button" onClick={() => setAccessFilter("pinned")}>已 Pin</button>
        </div>
      </div>
      <div className="simulator-group-summary">
        <span>当前 {filteredRegisters.length} 个寄存器，显示 {pageStartLabel} - {pageEnd}，按本页 {registerGroups.length} 个分组显示</span>
        {registerGroups.length > 1 && !shouldExpandMatches ? (
          <button
            className="mini-button"
            type="button"
            onClick={() => setExpandedGroupNames(allGroupsExpanded ? defaultExpandedGroupNames : registerGroups.map((group) => group.name))}
          >
            {allGroupsExpanded ? "只展开首组" : "展开全部"}
          </button>
        ) : null}
      </div>
      <div className="memory-table-wrap">
        <table className="memory-table">
          <thead>
            <tr>
              <th>快调</th><th>地址</th><th>名称</th><th>工程值</th><th>倍率</th><th>单位</th><th>类型</th><th>读写</th><th>最后修改</th><th>范围</th>
            </tr>
          </thead>
          <tbody>
            {registerGroups.length ? registerGroups.map((group) => {
              const expanded = visibleExpandedGroupNames.includes(group.name);
              return (
                <Fragment key={group.name}>
                  <tr className="memory-group-row">
                    <td colSpan={10}>
                      <button className="memory-group-toggle" type="button" onClick={() => toggleGroup(group.name)} aria-expanded={expanded}>
                        <span className="memory-group-caret">{expanded ? "▾" : "▸"}</span>
                        <strong>{group.name}</strong>
                        <small>{group.registers.length} 个 · 协议可写 {group.writableCount} · 地址 {group.addressRange}</small>
                      </button>
                    </td>
                  </tr>
                  {expanded ? group.registers.map((register) => {
                    const pinned = pinnedRegisterIds.includes(register.id);
                    const meta = registerMeta[register.id];
                    return (
                      <tr key={register.id}>
                        <td>
                          <button className={`pin-toggle ${pinned ? "active" : ""}`} type="button" aria-label={pinned ? "取消快调置顶" : "加入全局快调"} onClick={() => onTogglePin(register.id)}>
                            {pinned ? <PinOff size={15} /> : <Pin size={15} />}
                          </button>
                        </td>
                        <td>{register.address}</td>
                        <td><strong>{register.name}</strong><small>{register.group || register.description || "-"}</small></td>
                        <td>
                          <SimulatorRegisterValueInput
                            value={formatSimulatorRegisterEditorValue(register)}
                            onCommit={(value) => onRegisterCommit(register.id, value)}
                          />
                        </td>
                        <td>{formatScale(register.scale)}</td>
                        <td>{register.unit || "-"}</td>
                        <td>{register.dataType}</td>
                        <td>{accessLabel(register.access)}</td>
                        <td>{meta?.lastModifiedAt ? `${meta.lastModifiedAt} · ${sourceLabel(meta.lastModifiedSource)}` : "--"}</td>
                        <td>{register.range ? `${register.range.min} ~ ${register.range.max}` : "-"}</td>
                      </tr>
                    );
                  }) : null}
                </Fragment>
              );
            }) : (
              <tr>
                <td colSpan={10}>
                  <div className="memory-table-empty">没有匹配寄存器</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="simulator-pagination">
        <span>第 {safePage} / {pageCount} 页 · 本页 {pageRegisters.length} 个 · 共 {filteredRegisters.length} 个</span>
        <div>
          <label>
            <span>每页</span>
            <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
          <button className="mini-button" type="button" disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>上一页</button>
          <button className="mini-button" type="button" disabled={safePage >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>下一页</button>
        </div>
      </div>
    </section>
  );
}

function groupRegisters(registers: DeviceRegister[]) {
  const groups = new Map<string, DeviceRegister[]>();
  for (const register of registers) {
    const groupName = (register.group || "").trim() || "默认分组";
    groups.set(groupName, [...(groups.get(groupName) ?? []), register]);
  }
  return [...groups.entries()].map(([name, groupRegisters]) => ({
    name,
    registers: groupRegisters,
    writableCount: groupRegisters.filter((register) => register.access === "write" || register.access === "readWrite").length,
    addressRange: formatRegisterAddressRange(groupRegisters),
  }));
}

function formatRegisterAddressRange(registers: DeviceRegister[]) {
  const addresses = registers.map((register) => register.address).filter(Number.isFinite);
  if (!addresses.length) return "未定义";
  return `${Math.min(...addresses)} ~ ${Math.max(...addresses)}`;
}

function formatScale(scale: number) {
  return Number.isFinite(scale) && scale !== 0 ? String(scale) : "1";
}

function ScenarioPanel({ profile, onApply }: { profile: DeviceProfile; onApply: (scenarioId: string) => Promise<void> }) {
  return (
    <section className="lab-card glass-panel">
      <SectionTitle icon={PlayCircle} title="场景脚本 / 故障注入" helper="复用 Profile 中的模拟场景，一键批量更新寄存器值" />
      <div className="scenario-grid">
        {profile.scenarios.map((scenario) => (
          <article className="scenario-card" key={scenario.id}>
            <div>
              <strong>{scenario.name}</strong>
              <p>{scenario.description}</p>
            </div>
            <small>策略：{scenario.steps.map((step) => step.strategy).join(" / ") || "仅故障注入"}</small>
            <small>故障注入：{scenario.faultInjection.mode}{scenario.faultInjection.exceptionCode ? ` ${scenario.faultInjection.exceptionCode}` : ""}</small>
            <button className="mini-button" type="button" onClick={() => void onApply(scenario.id)}>应用场景</button>
          </article>
        ))}
      </div>
    </section>
  );
}

function RuntimePanels({
  running,
  frameLogs,
  backendLogs,
  exceptionStats,
  onRefreshLogs,
}: {
  running: boolean;
  frameLogs: FrameLog[];
  backendLogs: string[];
  exceptionStats: SimulatorExceptionStats;
  onRefreshLogs: () => Promise<void>;
}) {
  return (
    <div className="runtime-grid">
      <section className="lab-card glass-panel">
        <SectionTitle icon={CheckCircle2} title="请求 / 响应报文日志" helper={running ? "模拟运行中" : "模拟未启动"} />
        <div className="frame-log-list">
          {frameLogs.length ? frameLogs.map((log, index) => (
            <div className={`frame-log ${log.direction}`} key={`${log.time}-${index}`}>
              <span>{log.time}</span>
              <strong>{log.direction === "request" ? "REQ" : "RES"}</strong>
              <code>{log.frame}</code>
              <small>{log.note}</small>
            </div>
          )) : (
            <div className="global-frame-empty">
              <RadioTower size={24} />
              <strong>暂无报文</strong>
              <span>启动模拟或通过全局快调台改值后，这里会持续记录运行态信息。</span>
            </div>
          )}
        </div>
      </section>
      <section className="lab-card glass-panel">
        <div className="runtime-panel-head">
          <SectionTitle icon={RadioTower} title="从机运行日志" helper={running ? "自动刷新中" : "模拟未启动"} />
          <button className="mini-button icon-text-button" type="button" onClick={() => void onRefreshLogs()}>
            <RefreshCw size={14} />刷新
          </button>
        </div>
        <div className="backend-log-list">
          {backendLogs.length ? backendLogs.map((log, index) => (
            <div className="backend-log-line" key={`${log}-${index}`}>
              <span>{formatBackendLogTime(log)}</span>
              <code>{formatBackendLogMessage(log)}</code>
            </div>
          )) : (
            <div className="global-frame-empty">
              <RadioTower size={24} />
              <strong>暂无运行日志</strong>
              <span>启动模拟后，外部主站连接、读写请求和异常断开会显示在这里。</span>
            </div>
          )}
        </div>
      </section>
      <section className="lab-card glass-panel">
        <SectionTitle icon={AlertTriangle} title="异常码统计" helper="按故障注入模式累计" />
        <div className="exception-grid">
          {Object.entries(exceptionStats).map(([key, value]) => (
            <div className="exception-cell" key={key}><span>{key}</span><strong>{value}</strong></div>
          ))}
        </div>
      </section>
    </div>
  );
}

function formatBackendLogTime(log: string) {
  const match = log.match(/^(\d+):\s*(.*)$/);
  if (!match) return "--";
  const date = new Date(Number(match[1]) * 1000);
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatBackendLogMessage(log: string) {
  return log.replace(/^\d+:\s*/, "");
}

function SectionTitle({ icon: Icon, title, helper }: { icon: typeof RadioTower; title: string; helper: string }) {
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

function sourceLabel(source?: string) {
  if (source === "quick-drawer") return "全局快调";
  if (source === "scenario") return "场景";
  if (source === "main-table") return "寄存器表";
  return "手动";
}
