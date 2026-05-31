import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BatteryCharging,
  Cable,
  Cpu,
  Database,
  Droplets,
  Gauge,
  PlugZap,
  RadioTower,
  Server,
  ShieldCheck,
  Thermometer,
  Zap,
} from "lucide-react";
import type { AppSnapshot, HomeLoopbackDashboard } from "../types";
import type { ControlOperationLog } from "../control/controlSafetyCenter";
import { getAlarmCenterSummary, type AlarmEngineState } from "../alarm/alarmRuleEngine";

type Tone = "green" | "blue" | "cyan" | "orange" | "purple" | "red" | "amber" | "gray";

type KpiCard = {
  key: string;
  label: string;
  value: string;
  unit?: string;
  subtitle: string;
  source: string;
  updated: string;
  tone: Tone;
  icon: LucideIcon;
  accent?: "warning" | "danger" | "discharge";
};

type MetricLine = {
  label: string;
  value: string;
  source: string;
  pointId?: string;
};

type PCSState = "运行" | "待机" | "告警" | "故障" | "离线";

type PCSModule = {
  id: number;
  state: PCSState;
  power: string;
  maxTemp: string;
  base: number;
  hasFault: boolean;
};

type HealthCard = {
  title: string;
  icon: LucideIcon;
  status: string;
  tone: Tone;
  progress: number;
  summary: string;
  items: MetricLine[];
};

const updateTime = "14:35:40";

type AlarmCenterSummary = ReturnType<typeof getAlarmCenterSummary>;

const kpiCards: KpiCard[] = [
  {
    key: "pcs-online",
    label: "PCS 在线台数",
    value: "12",
    unit: "/ 16",
    subtitle: "在线 / 总数",
    source: "14001",
    updated: updateTime,
    tone: "green",
    icon: Server,
  },
  {
    key: "system-state",
    label: "系统运行状态",
    value: "并网运行",
    subtitle: "更新 14:35:40",
    source: "14002",
    updated: updateTime,
    tone: "green",
    icon: ShieldCheck,
  },
  {
    key: "active-power",
    label: "总有功功率",
    value: "1,250.00",
    unit: "kW",
    subtitle: "PCS 汇总输出",
    source: "14006",
    updated: updateTime,
    tone: "orange",
    icon: PlugZap,
  },
  {
    key: "reactive-power",
    label: "总无功功率",
    value: "-120.50",
    unit: "kvar",
    subtitle: "无功调节中",
    source: "14007",
    updated: updateTime,
    tone: "blue",
    icon: Gauge,
  },
  {
    key: "dc-voltage",
    label: "电池直流电压",
    value: "768.20",
    unit: "V",
    subtitle: "直流母线稳定",
    source: "14031",
    updated: updateTime,
    tone: "purple",
    icon: BatteryCharging,
  },
  {
    key: "battery-current",
    label: "电池电流",
    value: "-325.40",
    unit: "A",
    subtitle: "负数表示放电",
    source: "14032",
    updated: updateTime,
    tone: "cyan",
    icon: Zap,
    accent: "discharge",
  },
  {
    key: "current-alarms",
    label: "当前告警",
    value: "3",
    subtitle: "严重 1 / 一般 2",
    source: "PCS 14003/14004 · BMS 33601~33615 · 动环 13203~13206 · 液冷 13134~13146",
    updated: updateTime,
    tone: "red",
    icon: AlertTriangle,
    accent: "danger",
  },
];

const gridSideMetrics: MetricLine[] = [
  { label: "电网频率", value: "50.00 Hz", source: "14005", pointId: "home.topology.grid-frequency" },
  { label: "A/B/C 相电压", value: "380.6 / 381.2 / 379.9 V", source: "14022 / 14023 / 14024", pointId: "home.topology.grid-phase-voltage" },
  { label: "A/B/C 相电流", value: "620.4 / 618.7 / 622.1 A", source: "14025 / 14026 / 14027", pointId: "home.topology.grid-phase-current" },
  { label: "AB/BC/CA 线电压", value: "660.1 / 659.8 / 660.4 V", source: "14028 / 14029 / 14030", pointId: "home.topology.grid-line-voltage" },
];

const pcsCoreMetrics: MetricLine[] = [
  { label: "状态", value: "并网运行", source: "14002", pointId: "home.topology.pcs-state" },
  { label: "总有功功率", value: "1,250.00 kW", source: "14006", pointId: "home.topology.pcs-total-active-power" },
  { label: "总无功功率", value: "-120.50 kvar", source: "14007", pointId: "home.topology.pcs-total-reactive-power" },
  { label: "总视在功率", value: "1,255.79 kVA", source: "14008", pointId: "home.topology.pcs-apparent-power" },
  { label: "直流侧功率", value: "-1,232.40 kW", source: "14021", pointId: "home.topology.pcs-dc-power" },
];

const bmsMetrics: MetricLine[] = [
  { label: "电池电压", value: "768.20 V", source: "14031 / 25605", pointId: "home.topology.battery-voltage" },
  { label: "电池电流", value: "-325.40 A", source: "14032 / 25606", pointId: "home.topology.battery-current" },
  { label: "SOC", value: "72.6%", source: "25609", pointId: "home.topology.battery-soc" },
  { label: "SOH", value: "98.1%", source: "25611", pointId: "home.topology.battery-soh" },
  { label: "允许充放电状态", value: "允许充放电", source: "25603", pointId: "home.topology.battery-charge-discharge-state" },
];

const auxNodes = [
  { title: "液冷系统", icon: Droplets, value: "出水 24.8 ℃", source: "13122 / 13006", tone: "cyan", pointId: "home.topology.liquid-outlet-temp" },
  { title: "动环环境", icon: Thermometer, value: "柜内 28.4 ℃ · 46%", source: "13209 / 13210", tone: "green", pointId: "home.topology.environment-cabinet-temp" },
  { title: "电表", icon: Gauge, value: "PF 0.98 · 1,248 kW", source: "13224 / 13225", tone: "blue", pointId: "home.topology.meter-active-power" },
  { title: "箱变测控", icon: RadioTower, value: "绕组 61.2 ℃", source: "13522~13525", tone: "purple", pointId: "home.topology.transformer-winding-temp" },
] as const;

const energyStats: MetricLine[] = [
  { label: "今日充电量", value: "5,820.6 kWh", source: "14033", pointId: "home.energy.today-charge" },
  { label: "今日放电量", value: "6,104.2 kWh", source: "14035", pointId: "home.energy.today-discharge" },
  { label: "累计充电量", value: "1,842.36 MWh", source: "14037", pointId: "home.energy.total-charge" },
  { label: "累计放电量", value: "1,806.92 MWh", source: "14039", pointId: "home.energy.total-discharge" },
];


const communicationRows = [
  "PCS 模块",
  "BMS 系统",
  "液冷系统",
  "动环系统",
  "电表系统",
  "箱变测控",
].map((name) => ({ name, state: "正常" }));

const healthCards: HealthCard[] = [
  {
    title: "BMS 电池健康",
    icon: BatteryCharging,
    status: "健康",
    tone: "green",
    progress: 82,
    summary: "SOC 72.6% · SOH 98.1%",
    items: [
      { label: "SOC / SOH", value: "72.6% / 98.1%", source: "25609 / 25611", pointId: "home.health.bms.soc-soh" },
      { label: "总电压 / 总电流", value: "768.20 V / -325.40 A", source: "25605 / 25606", pointId: "home.health.bms.voltage-current" },
      { label: "总功率", value: "-250.01 kW", source: "25608", pointId: "home.health.bms.power" },
      { label: "单体最高/最低电压", value: "3.421 / 3.318 V", source: "25619 / 25620", pointId: "home.health.bms.cell-voltage" },
      { label: "单体最高/最低温度", value: "31.8 / 24.6 ℃", source: "25623 / 25624", pointId: "home.health.bms.cell-temp" },
    ],
  },
  {
    title: "液冷系统",
    icon: Droplets,
    status: "恒温运行",
    tone: "cyan",
    progress: 76,
    summary: "水泵 2860 rpm · 告警 0",
    items: [
      { label: "出水 / 进水温度", value: "24.8 / 27.2 ℃", source: "13122 或 13006 / 13120 或 13007", pointId: "home.health.liquid-cooling.temperature" },
      { label: "出水压力", value: "0.42 MPa", source: "13126", pointId: "home.health.liquid-cooling.pressure" },
      { label: "水泵转速", value: "2860 rpm", source: "13001", pointId: "home.health.liquid-cooling.pump-speed" },
      { label: "告警等级 / 故障等级", value: "0 / 0", source: "13039 / 13134", pointId: "home.health.liquid-cooling.alarm" },
    ],
  },
  {
    title: "动环环境",
    icon: Thermometer,
    status: "环境正常",
    tone: "green",
    progress: 68,
    summary: "柜内 28.4 ℃ · 湿度 46%",
    items: [
      { label: "柜内温度 / 湿度", value: "28.4 ℃ / 46%", source: "13209 / 13210", pointId: "home.health.environment.cabinet" },
      { label: "外环温度 / 湿度", value: "31.2 ℃ / 52%", source: "13211 / 13212", pointId: "home.health.environment.outdoor" },
      { label: "DI 状态", value: "门禁闭合 · 烟感正常", source: "13201", pointId: "home.health.environment.di" },
      { label: "报警", value: "无活动报警", source: "13205 / 13206", pointId: "home.health.environment.alarm" },
    ],
  },
  {
    title: "电表数据",
    icon: Database,
    status: "计量正常",
    tone: "blue",
    progress: 88,
    summary: "PF 0.98 · 正向 824.6 MWh",
    items: [
      { label: "总有功功率 / 功率因数", value: "1,248.4 kW / 0.98", source: "13224 / 13225", pointId: "home.health.meter.active-power" },
      { label: "A/B/C 相电压", value: "380.6 / 381.2 / 379.9 V", source: "13226 / 13227 / 13228", pointId: "home.health.meter.voltage" },
      { label: "A/B/C 相电流", value: "619.8 / 620.5 / 618.9 A", source: "13229 / 13230 / 13231", pointId: "home.health.meter.current" },
      { label: "正向有功电能", value: "824.6 MWh", source: "13232", pointId: "home.health.meter.energy" },
    ],
  },
  {
    title: "箱变测控",
    icon: RadioTower,
    status: "温升可控",
    tone: "purple",
    progress: 72,
    summary: "铁芯 58.2 ℃ · 绕组最高 61.4 ℃",
    items: [
      { label: "高压侧电流", value: "34.1 / 33.9 / 34.3 A", source: "13501 / 13502 / 13503", pointId: "home.health.transformer.current" },
      { label: "低压侧电压", value: "660.2 / 659.9 / 660.1 V", source: "13504 / 13505 / 13506", pointId: "home.health.transformer.voltage" },
      { label: "变压器温度", value: "59.8 / 61.4 / 60.6 ℃", source: "13522 / 13523 / 13524", pointId: "home.health.transformer.temperature" },
      { label: "铁芯温度 / 温湿度", value: "58.2 ℃ / 29.6 ℃ 48%", source: "13525 / 13530 / 13531", pointId: "home.health.transformer.core-temp" },
    ],
  },
];

type DashboardProps = {
  snapshot: AppSnapshot;
  homeConnectionBusy?: boolean;
  homeConnectionNotice?: { tone: "info" | "success" | "error"; text: string } | null;
  homeConnection: HomeDeviceConnection;
  onHomeConnectionChange?: (config: HomeDeviceConnection) => void;
  onConnectHomeDevice?: () => void;
  onDisconnectHomeDevice?: () => void;
  onInspectPoint?: (pointId: string) => void;
  alarmState: AlarmEngineState;
  controlSafetyLogs?: ControlOperationLog[];
};

type HomeDeviceConnection = {
  host: string;
  port: number;
  unitId: number;
};

export function Dashboard({
  snapshot,
  homeConnectionBusy = false,
  homeConnectionNotice = null,
  homeConnection,
  onHomeConnectionChange,
  onConnectHomeDevice,
  onDisconnectHomeDevice,
  onInspectPoint,
  alarmState,
  controlSafetyLogs = [],
}: DashboardProps) {
  const loopback = snapshot.loopbackDashboard ?? null;
  const alarmSummary = getAlarmCenterSummary(alarmState);

  return (
    <div className="dashboard">
      <HomeDeviceConnectionPanel
        loopback={loopback}
        busy={homeConnectionBusy}
        notice={homeConnectionNotice}
        connection={homeConnection}
        onConnectionChange={onHomeConnectionChange}
        onConnect={onConnectHomeDevice}
        onDisconnect={onDisconnectHomeDevice}
      />
      <KpiGrid loopback={loopback} alarmSummary={alarmSummary} onInspectPoint={onInspectPoint} />
      <div className="dashboard-layout">
        <div className="dashboard-primary">
          <section className="energy-section">
            <EnergyFlowPanel loopback={loopback} onInspectPoint={onInspectPoint} />
            <EnergyStatsPanel loopback={loopback} onInspectPoint={onInspectPoint} />
          </section>
          <PCSMatrixPanel loopback={loopback} alarmSummary={alarmSummary} onInspectPoint={onInspectPoint} />
          <HealthSummaryPanel loopback={loopback} onInspectPoint={onInspectPoint} />
          {loopback ? <HomeVerifierPanel loopback={loopback} /> : null}
        </div>
        <aside className="dashboard-rail" aria-label="右侧运行状态">
          <AlarmCenterPanel alarmSummary={alarmSummary} />
          <CommunicationPanel loopback={loopback} />
          <OperationPanel loopback={loopback} controlSafetyLogs={controlSafetyLogs} />
        </aside>
      </div>
    </div>
  );
}

const kpiPointIds: Record<string, string> = {
  "pcs-online": "home.kpi.pcs-online",
  "system-state": "home.kpi.system-state",
  "active-power": "home.kpi.active-power",
  "reactive-power": "home.kpi.reactive-power",
  "dc-voltage": "home.kpi.dc-voltage",
  "battery-current": "home.kpi.battery-current",
  "current-alarms": "home.kpi.current-alarms",
};

function KpiGrid({ loopback, alarmSummary, onInspectPoint }: { loopback: HomeLoopbackDashboard | null; alarmSummary: AlarmCenterSummary; onInspectPoint?: (pointId: string) => void }) {
  const cards = createKpiCards(loopback, alarmSummary);
  return (
    <section className="kpi-grid" aria-label="PCS 实时核心数据">
      {cards.map((card) => {
        const Icon = card.icon;
        const pointId = kpiPointIds[card.key] ?? `home.kpi.${card.key}`;

        return (
          <article
            className={`kpi-card glass-card tone-${card.tone} ${card.accent ? `accent-${card.accent}` : ""} trace-clickable-card`}
            data-point-id={pointId}
            role="button"
            tabIndex={0}
            onClick={() => onInspectPoint?.(pointId)}
            onKeyDown={(event) => handleTraceKey(event, () => onInspectPoint?.(pointId))}
            key={card.key}
          >
            <div className="kpi-head">
              <span className="kpi-icon"><Icon size={19} /></span>
              <div>
                <span className="kpi-label">{card.label}</span>
                <small>来源 {card.source}</small>
              </div>
            </div>
            <div className="kpi-value">
              <strong>{card.value}</strong>
              {card.unit ? <span>{card.unit}</span> : null}
            </div>
            <div className="kpi-foot">
              <p>{card.subtitle}</p>
              <time>更新 {card.updated}</time>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function EnergyFlowPanel({ loopback, onInspectPoint }: { loopback: HomeLoopbackDashboard | null; onInspectPoint?: (pointId: string) => void }) {
  const gridMetrics = createGridSideMetrics(loopback);
  const pcsMetrics = createPcsCoreMetrics(loopback);
  const bmsNodeMetrics = createBmsMetrics(loopback);
  const auxMetrics = loopback ? auxNodes : auxNodes.map((node) => ({ ...node, value: "--" }));
  return (
    <section className="panel glass-panel energy-flow-panel">
      <PanelTitle title="能量流向图" status={loopback ? "当前：已连接实时读取" : "未连接"} variant={loopback ? "success" : "neutral"} />
      <div className="energy-canvas">
        <svg className="energy-lines" viewBox="0 0 920 500" aria-hidden="true" preserveAspectRatio="none">
          <defs>
            <linearGradient id="acFlow" x1="1" x2="0" y1="0" y2="0">
              <stop offset="0" stopColor="rgba(110, 243, 165, 0)" />
              <stop offset="0.48" stopColor="rgba(110, 243, 165, 0.95)" />
              <stop offset="1" stopColor="rgba(34, 211, 238, 0.75)" />
            </linearGradient>
            <linearGradient id="dcFlow" x1="1" x2="0" y1="0" y2="0">
              <stop offset="0" stopColor="rgba(167, 139, 250, 0)" />
              <stop offset="0.48" stopColor="rgba(96, 165, 250, 0.94)" />
              <stop offset="1" stopColor="rgba(34, 211, 238, 0.85)" />
            </linearGradient>
            <marker id="flowArrow" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
              <path d="M0 0L8 4L0 8Z" fill="rgba(226, 252, 255, 0.92)" />
            </marker>
            <filter id="energyGlow" x="-25%" y="-80%" width="150%" height="260%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path className="energy-line ac-line" d="M458 168 C374 168 306 168 220 168" markerEnd="url(#flowArrow)" />
          <path className="energy-line dc-line" d="M704 168 C628 168 572 168 494 168" markerEnd="url(#flowArrow)" />
          <path className="energy-line aux-line" d="M458 292 C420 342 326 372 228 398" />
          <path className="energy-line aux-line" d="M472 292 C484 356 588 374 690 398" />
          <path className="energy-line aux-line soft" d="M220 266 C178 318 152 356 126 398" />
          <path className="energy-line aux-line soft" d="M704 266 C746 318 770 356 812 398" />
        </svg>

        <EnergyNode
          className="energy-node-grid"
          icon={Cable}
          title="电网侧"
          tone="cyan"
          status="AC 并网"
          items={gridMetrics}
          onInspectPoint={onInspectPoint}
        />
        <EnergyNode
          className="energy-node-pcs"
          icon={Cpu}
          title="PCS 中央节点"
          tone="green"
          status={dashboardDisplay(loopback, "14002", "未连接")}
          items={pcsMetrics}
          onInspectPoint={onInspectPoint}
        />
        <EnergyNode
          className="energy-node-bms"
          icon={BatteryCharging}
          title="电池侧 BMS"
          tone="purple"
          status={dashboardDisplay(loopback, "25603", "未连接")}
          items={bmsNodeMetrics}
          onInspectPoint={onInspectPoint}
        />

        <div className="aux-node-grid">
          {auxMetrics.map((node) => (
            <AuxNode key={node.title} {...node} onInspectPoint={onInspectPoint} />
          ))}
        </div>
      </div>
    </section>
  );
}

function EnergyNode({
  className,
  icon: Icon,
  title,
  tone,
  status,
  items,
  onInspectPoint,
}: {
  className: string;
  icon: LucideIcon;
  title: string;
  tone: Tone;
  status: string;
  items: MetricLine[];
  onInspectPoint?: (pointId: string) => void;
}) {
  return (
    <article className={`energy-node ${className} tone-${tone}`}>
      <div className="energy-node-head">
        <span className="node-icon"><Icon size={22} /></span>
        <div>
          <strong>{title}</strong>
          <small>{status}</small>
        </div>
      </div>
      <div className="energy-node-data">
        {items.map((item) => (
          <DataLine item={item} onInspectPoint={onInspectPoint} key={`${title}-${item.label}`} />
        ))}
      </div>
    </article>
  );
}

function AuxNode({
  title,
  icon: Icon,
  value,
  source,
  tone,
  pointId,
  onInspectPoint,
}: {
  title: string;
  icon: LucideIcon;
  value: string;
  source: string;
  tone: Tone;
  pointId?: string;
  onInspectPoint?: (pointId: string) => void;
}) {
  const traceable = Boolean(pointId);
  return (
    <article
      className={`aux-node tone-${tone} ${traceable ? "trace-clickable-card" : ""}`}
      data-point-id={pointId}
      role={traceable ? "button" : undefined}
      tabIndex={traceable ? 0 : undefined}
      onClick={() => pointId && onInspectPoint?.(pointId)}
      onKeyDown={(event) => pointId && handleTraceKey(event, () => onInspectPoint?.(pointId))}
    >
      <span><Icon size={17} />{title}</span>
      <strong>{value}</strong>
      <small>来源 {source}</small>
    </article>
  );
}

function EnergyStatsPanel({ loopback, onInspectPoint }: { loopback: HomeLoopbackDashboard | null; onInspectPoint?: (pointId: string) => void }) {
  const stats = createEnergyStats(loopback);
  return (
    <section className="panel glass-panel energy-stats-panel">
      <PanelTitle title="能量统计" status={loopback ? "日累计 / 总累计" : "未连接"} variant={loopback ? "select" : "neutral"} />
      <div className="energy-stat-grid">
        {stats.map((stat, index) => (
          <article
            className={`energy-stat-card tone-${index % 2 === 0 ? "green" : "blue"} ${stat.pointId ? "trace-clickable-card" : ""}`}
            data-point-id={stat.pointId}
            role={stat.pointId ? "button" : undefined}
            tabIndex={stat.pointId ? 0 : undefined}
            onClick={() => stat.pointId && onInspectPoint?.(stat.pointId)}
            onKeyDown={(event) => { if (stat.pointId) handleTraceKey(event, () => onInspectPoint?.(stat.pointId as string)); }}
            key={stat.label}
          >
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>来源 {stat.source}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function PCSMatrixPanel({ loopback, alarmSummary, onInspectPoint }: { loopback: HomeLoopbackDashboard | null; alarmSummary: AlarmCenterSummary; onInspectPoint?: (pointId: string) => void }) {
  const pcsModules = createPCSModules(loopback, alarmSummary);

  return (
    <section className="panel glass-panel pcs-panel">
      <PanelTitle title="PCS 模块状态" status={loopback ? "4 × 4 模块矩阵" : "未连接"} variant="neutral" />
      <div className="pcs-matrix">
        {pcsModules.map((module) => (
          <article
            className={`pcs-card state-${module.state} trace-clickable-card`}
            data-point-id={`home.pcs.${module.id}`}
            role="button"
            tabIndex={0}
            onClick={() => onInspectPoint?.(`home.pcs.${module.id}`)}
            onKeyDown={(event) => handleTraceKey(event, () => onInspectPoint?.(`home.pcs.${module.id}`))}
            key={module.id}
          >
            <div className="pcs-card-head">
              <strong>PCS{module.id}</strong>
              <span className="fault-dot" aria-label={module.hasFault ? "存在故障" : "无故障"} />
            </div>
            <div className="pcs-state-line">
              <span className="module-state-dot" />
              <span>{module.state}</span>
            </div>
            <div className="pcs-card-values">
              <span>
                <small>功率</small>
                <b>{module.power === "--" ? "--" : `${module.power} kW`}</b>
              </span>
              <span>
                <small>最高温度</small>
                <b>{module.maxTemp === "--" ? "--" : `${module.maxTemp} ℃`}</b>
              </span>
            </div>
            <p>基址 {module.base} · 状态 {module.base + 9} · 温度 {module.base + 10}~{module.base + 19} · 故障 {module.base + 20}~{module.base + 29}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function createPCSModules(loopback: HomeLoopbackDashboard | null, alarmSummary: AlarmCenterSummary): PCSModule[] {
  const pcsModuleStates = alarmSummary.pcsModuleStates;
  if (loopback?.pcsModules.length) {
    return loopback.pcsModules.map((module) => {
      const alarmDerivedState = pcsModuleStates[`PCS${module.id}`] as PCSState | undefined;
      const effectiveState = alarmDerivedState ?? (module.state as PCSState);
      return {
        id: module.id,
        state: effectiveState,
        power: module.power,
        maxTemp: module.maxTemp,
        base: module.base,
        hasFault: module.hasFault || effectiveState === "故障",
      };
    });
  }
  return Array.from({ length: 16 }, (_, index) => {
    const id = index + 1;
    const base = 15001 + index * 500;

    return {
      id,
      state: "离线",
      power: "--",
      maxTemp: "--",
      base,
      hasFault: false,
    };
  });
}

function HealthSummaryPanel({ loopback, onInspectPoint }: { loopback: HomeLoopbackDashboard | null; onInspectPoint?: (pointId: string) => void }) {
  const cards = createHealthCards(loopback);
  return (
    <section className="health-summary" aria-label="设备健康状态">
      {cards.map((card) => {
        const Icon = card.icon;

        return (
          <article className={`health-card glass-card tone-${card.tone}`} key={card.title}>
            <div className="health-card-head">
              <span className="health-icon"><Icon size={20} /></span>
              <div>
                <strong>{card.title}</strong>
                <small>{card.summary}</small>
              </div>
              <span className="health-status">{card.status}</span>
            </div>
            <div className="health-body">
              <div className="health-ring" style={progressStyle(card.progress)}>
                <strong>{card.progress}</strong>
                <span>%</span>
              </div>
              <div className="health-lines">
                {card.items.map((item) => (
                  <DataLine item={item} onInspectPoint={onInspectPoint} key={`${card.title}-${item.label}`} />
                ))}
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function AlarmCenterPanel({ alarmSummary }: { alarmSummary: AlarmCenterSummary }) {
  const counts = createAlarmCounts(alarmSummary);
  const alarms = createRecentAlarms(alarmSummary);
  return (
    <section className="panel glass-panel rail-card alarm-center">
      <PanelTitle title="告警中心" status={`当前 ${counts.reduce((sum, count) => sum + Number(count.value), 0)} 条`} variant="danger" />
      <div className="alarm-count-grid">
        {counts.map((count) => (
          <article className={`alarm-count tone-${count.tone}`} key={count.label}>
            <span>{count.label}</span>
            <strong>{count.value}</strong>
          </article>
        ))}
      </div>
      <div className="alarm-list">
        {alarms.map((alarm) => (
          <article className={`alarm-item tone-${alarm.tone}`} key={`${alarm.text}-${alarm.time}`}>
            <span>[{alarm.level}]</span>
            <strong>{alarm.text}</strong>
            <time>{alarm.time}</time>
          </article>
        ))}
      </div>
    </section>
  );
}

function CommunicationPanel({ loopback }: { loopback: HomeLoopbackDashboard | null }) {
  const rows = createCommunicationRows(loopback);
  const variant = !loopback ? "neutral" : loopback.connectionStatus === "通信异常" ? "danger" : "success";
  return (
    <section className="panel glass-panel rail-card">
      <PanelTitle title="通信状态" status={loopback ? `${loopback.endpoint} · ${loopback.connectionStatus}` : "未连接"} variant={variant} />
      <div className="comm-list">
        {rows.map((row) => (
          <div className="comm-row" key={row.name}>
            <span>{row.name}</span>
            <strong>{row.state}</strong>
            <i aria-hidden="true" />
          </div>
        ))}
      </div>
    </section>
  );
}

function OperationPanel({ loopback, controlSafetyLogs }: { loopback: HomeLoopbackDashboard | null; controlSafetyLogs: ControlOperationLog[] }) {
  const logs = loopback?.logs.length ? loopback.logs.slice(-5).reverse() : controlSafetyLogs.length ? controlSafetyLogs.slice(0, 5).map((log) => `${log.operation} ${log.result === "success" ? "成功" : log.failureReason}`) : ["等待首页设备连接"];
  return (
    <section className="panel glass-panel rail-card">
      <PanelTitle title="最近操作记录" status="admin" variant="link" />
      <div className="operation-list">
        {logs.map((log, index) => (
          <article key={log}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{log}</strong>
            <time>14:{35 - index * 2}:{String(40 - index * 3).padStart(2, "0")}</time>
          </article>
        ))}
      </div>
    </section>
  );
}

function HomeDeviceConnectionPanel({
  loopback,
  busy,
  notice,
  connection,
  onConnectionChange,
  onConnect,
  onDisconnect,
}: {
  loopback: HomeLoopbackDashboard | null;
  busy: boolean;
  notice?: { tone: "info" | "success" | "error"; text: string } | null;
  connection: HomeDeviceConnection;
  onConnectionChange?: (config: HomeDeviceConnection) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}) {
  const locked = busy || Boolean(loopback);
  const endpoint = `${connection.host || "未填写IP"}:${connection.port}`;
  const readable = loopback?.values.length ?? 0;
  const abnormal = loopback?.connectionStatus === "通信异常";

  return (
    <section className={`panel glass-panel home-selftest-panel ${loopback ? "is-running" : ""}`} aria-label="首页设备连接">
      <div className="home-selftest-head">
        <div>
          <strong>{loopback ? "首页设备已连接" : "首页设备连接"}</strong>
          <span>{loopback ? `主站正在轮询 ${loopback.endpoint} · unit=${connection.unitId} · ${loopback.connectionStatus}` : `输入下位机 Modbus TCP 的 IP、端口和 Unit ID，连接成功后首页才显示实时数据`}</span>
        </div>
        <div className="selftest-summary">
          <span>{loopback ? `已读取 ${readable}` : "未连接"}</span>
          <span>{abnormal ? "通信异常" : endpoint}</span>
        </div>
      </div>
      <div className="selftest-config-grid" aria-label="首页设备 TCP 连接配置">
        <label>
          <span>下位机 IP</span>
          <input
            value={connection.host}
            disabled={locked}
            onChange={(event) => onConnectionChange?.({ ...connection, host: event.target.value })}
            placeholder="例如 192.168.1.10"
          />
        </label>
        <label>
          <span>TCP 端口</span>
          <input
            type="number"
            min={1}
            max={65535}
            value={connection.port}
            disabled={locked}
            onChange={(event) => onConnectionChange?.({ ...connection, port: Number(event.target.value) || 0 })}
          />
        </label>
        <label>
          <span>Unit ID</span>
          <input
            type="number"
            min={1}
            max={247}
            value={connection.unitId}
            disabled={locked}
            onChange={(event) => onConnectionChange?.({ ...connection, unitId: Number(event.target.value) || 0 })}
          />
        </label>
      </div>
      <div className="selftest-actions">
        <button type="button" onClick={onConnect} disabled={busy || Boolean(loopback)}>连接首页设备</button>
        <button type="button" onClick={onDisconnect} disabled={busy || !loopback}>断开连接</button>
      </div>
      {notice ? <div className={`selftest-notice tone-${notice.tone}`}>{notice.text}</div> : null}
    </section>
  );
}

function HomeVerifierPanel({ loopback }: { loopback: HomeLoopbackDashboard }) {
  return (
    <section className="panel glass-panel home-verifier-panel" aria-label="首页数据读取明细">
      <PanelTitle title="首页数据读取明细" status={`${loopback.verificationRows.length} 项 · ${loopback.connectionStatus}`} variant={loopback.connectionStatus === "通信异常" ? "danger" : "success"} />
      <div className="verifier-table-wrap">
        <table className="verifier-table">
          <thead>
            <tr>
              <th>页面组件</th>
              <th>绑定地址</th>
              <th>点位名称</th>
              <th>协议参考值</th>
              <th>首页解析值</th>
              <th>页面显示值</th>
              <th>单位</th>
              <th>误差</th>
              <th>校验结果</th>
            </tr>
          </thead>
          <tbody>
            {loopback.verificationRows.map((row) => (
              <tr className={row.result === "通过" ? "pass" : "fail"} key={`${row.boundAddress}-${row.pointName}`}>
                <td>{row.component}</td>
                <td>{row.boundAddress}</td>
                <td>{row.pointName}</td>
                <td>{row.expectedValue}</td>
                <td>{row.parsedValue}</td>
                <td>{row.displayValue}</td>
                <td>{row.unit}</td>
                <td>{row.error}</td>
                <td><strong>{row.result}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function createKpiCards(loopback: HomeLoopbackDashboard | null, alarmSummary: AlarmCenterSummary): KpiCard[] {
  const total = Object.values(alarmSummary.currentCounts).reduce((sum, value) => sum + value, 0);
  const alarmCard = (card: KpiCard): KpiCard => ({
    ...card,
    value: String(total),
    subtitle: `严重 ${alarmSummary.currentCounts.严重故障} / 一般 ${alarmSummary.currentCounts.一般告警} / 预警 ${alarmSummary.currentCounts.预警}`,
    updated: "现在",
  });
  if (!loopback) {
    return kpiCards.map((card) => ({
      ...card,
      value: "--",
      subtitle: "等待连接首页设备",
      updated: "--",
    }));
  }
  return kpiCards.map((card) => {
    switch (card.key) {
      case "pcs-online":
        return { ...card, value: dashboardDisplay(loopback, "14001", card.value), updated: "现在" };
      case "system-state":
        return { ...card, value: dashboardDisplay(loopback, "14002", card.value), updated: "现在" };
      case "active-power":
        return { ...card, value: dashboardDisplay(loopback, "14006", card.value), updated: "现在" };
      case "reactive-power":
        return { ...card, value: dashboardDisplay(loopback, "14007", card.value), updated: "现在" };
      case "dc-voltage":
        return { ...card, value: dashboardDisplay(loopback, "14031", card.value), updated: "现在" };
      case "battery-current":
        return { ...card, value: dashboardDisplay(loopback, "14032", card.value), updated: "现在" };
      case "current-alarms":
        return alarmCard(card);
      default:
        return card;
    }
  });
}

function createGridSideMetrics(loopback: HomeLoopbackDashboard | null): MetricLine[] {
  if (!loopback) return unavailableLines(gridSideMetrics);
  return [
    { label: "电网频率", value: withUnit(loopback, "14005", "50.00 Hz"), source: "14005", pointId: "home.topology.grid-frequency" },
    { label: "A/B/C 相电压", value: `${withUnit(loopback, "14022", "229.30 V")} / ${withUnit(loopback, "14023", "229.10 V")} / ${withUnit(loopback, "14024", "229.50 V")}`, source: "14022 / 14023 / 14024", pointId: "home.topology.grid-phase-voltage" },
    { label: "A/B/C 相电流", value: `${withUnit(loopback, "14025", "396.80 A")} / ${withUnit(loopback, "14026", "397.10 A")} / ${withUnit(loopback, "14027", "398.20 A")}`, source: "14025 / 14026 / 14027", pointId: "home.topology.grid-phase-current" },
    { label: "AB/BC/CA 线电压", value: `${withUnit(loopback, "14028", "396.80 V")} / ${withUnit(loopback, "14029", "397.10 V")} / ${withUnit(loopback, "14030", "398.20 V")}`, source: "14028 / 14029 / 14030", pointId: "home.topology.grid-line-voltage" },
  ];
}

function createPcsCoreMetrics(loopback: HomeLoopbackDashboard | null): MetricLine[] {
  if (!loopback) return unavailableLines(pcsCoreMetrics);
  return [
    { label: "状态", value: dashboardDisplay(loopback, "14002", "并网运行"), source: "14002", pointId: "home.topology.pcs-state" },
    { label: "总有功功率", value: withUnit(loopback, "14006", "1,250.00 kW"), source: "14006", pointId: "home.topology.pcs-total-active-power" },
    { label: "总无功功率", value: withUnit(loopback, "14007", "-120.50 kvar"), source: "14007", pointId: "home.topology.pcs-total-reactive-power" },
    { label: "总视在功率", value: withUnit(loopback, "14008", "1,257.80 kVA"), source: "14008", pointId: "home.topology.pcs-apparent-power" },
    { label: "直流侧功率", value: withUnit(loopback, "14021", "-1,280.20 kW"), source: "14021", pointId: "home.topology.pcs-dc-power" },
  ];
}

function createBmsMetrics(loopback: HomeLoopbackDashboard | null): MetricLine[] {
  if (!loopback) return unavailableLines(bmsMetrics);
  return [
    { label: "电池电压", value: withUnit(loopback, "25605", "768.20 V"), source: "25605", pointId: "home.topology.battery-voltage" },
    { label: "电池电流", value: withUnit(loopback, "25606", "-325.40 A"), source: "25606", pointId: "home.topology.battery-current" },
    { label: "SOC", value: withUnit(loopback, "25609", "78.50%"), source: "25609", pointId: "home.topology.battery-soc" },
    { label: "SOH", value: withUnit(loopback, "25611", "95.60%"), source: "25611", pointId: "home.topology.battery-soh" },
    { label: "允许充放电状态", value: dashboardDisplay(loopback, "25603", "允充允放"), source: "25603", pointId: "home.topology.battery-charge-discharge-state" },
  ];
}

function createEnergyStats(loopback: HomeLoopbackDashboard | null): MetricLine[] {
  if (!loopback) return unavailableLines(energyStats);
  return [
    { label: "今日充电量", value: withUnit(loopback, "14033", "256.80 kWh"), source: "14033", pointId: "home.energy.today-charge" },
    { label: "今日放电量", value: withUnit(loopback, "14035", "512.40 kWh"), source: "14035", pointId: "home.energy.today-discharge" },
    { label: "累计充电量", value: withUnit(loopback, "14037", "256800.20 kWh"), source: "14037", pointId: "home.energy.total-charge" },
    { label: "累计放电量", value: withUnit(loopback, "14039", "512400.50 kWh"), source: "14039", pointId: "home.energy.total-discharge" },
  ];
}

function createHealthCards(loopback: HomeLoopbackDashboard | null): HealthCard[] {
  if (!loopback) {
    return healthCards.map((card) => ({
      ...card,
      status: "未连接",
      tone: "gray",
      progress: 0,
      summary: "等待连接首页设备",
      items: unavailableLines(card.items),
    }));
  }
  return healthCards.map((card) => {
    if (card.title !== "BMS 电池健康") return card;
    return {
      ...card,
      progress: Number.parseFloat(dashboardDisplay(loopback, "25609", "78.50")) || card.progress,
      summary: `SOC ${withUnit(loopback, "25609", "78.50 %")} · SOH ${withUnit(loopback, "25611", "95.60 %")}`,
      items: [
        { label: "SOC / SOH", value: `${withUnit(loopback, "25609", "78.50 %")} / ${withUnit(loopback, "25611", "95.60 %")}`, source: "25609 / 25611", pointId: "home.health.bms.soc-soh" },
        { label: "总电压 / 总电流", value: `${withUnit(loopback, "25605", "768.20 V")} / ${withUnit(loopback, "25606", "-325.40 A")}`, source: "25605 / 25606", pointId: "home.health.bms.voltage-current" },
        { label: "总功率", value: withUnit(loopback, "25608", "-1280.20 kW"), source: "25608", pointId: "home.health.bms.power" },
        { label: "单体最高/最低电压", value: `${withUnit(loopback, "25619", "3.421 V")} / ${withUnit(loopback, "25620", "3.318 V")}`, source: "25619 / 25620", pointId: "home.health.bms.cell-voltage" },
        { label: "单体最高/最低温度", value: `${withUnit(loopback, "25623", "31.8 ℃")} / ${withUnit(loopback, "25624", "24.6 ℃")}`, source: "25623 / 25624", pointId: "home.health.bms.cell-temp" },
      ],
    };
  });
}

function createAlarmCounts(alarmSummary: AlarmCenterSummary) {
  return [
    { label: "严重故障", value: String(alarmSummary.currentCounts.严重故障), tone: "red" },
    { label: "一般告警", value: String(alarmSummary.currentCounts.一般告警), tone: "amber" },
    { label: "预警信息", value: String(alarmSummary.currentCounts.预警), tone: "blue" },
    { label: "提示", value: String(alarmSummary.currentCounts.提示), tone: "cyan" },
  ];
}

function createRecentAlarms(alarmSummary: AlarmCenterSummary) {
  return alarmSummary.recentAlarms.map((alarm) => ({
    level: alarm.status === "recovered" ? "恢复" : alarm.level.replace("故障", ""),
    text: `${alarm.deviceInstance} ${alarm.alarmName}`,
    time: formatAlarmTime(alarm.updateTime),
    tone: alarm.status === "recovered" ? "green" : alarm.level === "严重故障" ? "red" : alarm.level === "一般告警" ? "amber" : alarm.level === "预警" ? "blue" : "cyan",
  }));
}

function formatAlarmTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString("zh-CN", { hour12: false });
}

function createCommunicationRows(loopback: HomeLoopbackDashboard | null) {
  if (!loopback) return communicationRows.map((row) => ({ ...row, state: "未连接" }));
  const state = loopback.connectionStatus === "通信异常" ? "异常" : "正常";
  return ["PCS 汇总", "BMS 系统", "PCS 模块矩阵", "首页校验器"].map((name) => ({ name, state }));
}

function dashboardDisplay(loopback: HomeLoopbackDashboard | null, address: string, _fallback: string) {
  return loopback?.values.find((value) => value.address === address)?.displayValue ?? "--";
}

function withUnit(loopback: HomeLoopbackDashboard | null, address: string, _fallback: string) {
  const value = loopback?.values.find((candidate) => candidate.address === address);
  if (!value) return "--";
  return `${value.displayValue}${value.unit ? ` ${value.unit}` : ""}`;
}

function unavailableLines(lines: MetricLine[]): MetricLine[] {
  return lines.map((line) => ({ ...line, value: "--" }));
}

function DataLine({ item, onInspectPoint }: { item: MetricLine; onInspectPoint?: (pointId: string) => void }) {
  const traceable = Boolean(item.pointId);

  return (
    <div
      className={traceable ? "data-line trace-clickable" : "data-line"}
      data-point-id={item.pointId}
      role={traceable ? "button" : undefined}
      tabIndex={traceable ? 0 : undefined}
      onClick={() => item.pointId && onInspectPoint?.(item.pointId)}
      onKeyDown={(event) => { if (item.pointId) handleTraceKey(event, () => onInspectPoint?.(item.pointId as string)); }}
    >
      <span>{item.label}</span>
      <strong>{item.value}</strong>
      <small>{item.source}</small>
    </div>
  );
}

function handleTraceKey(event: { key: string; preventDefault: () => void }, action: () => void | undefined) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  action();
}

function PanelTitle({
  title,
  status,
  variant = "neutral",
}: {
  title: string;
  status: string;
  variant?: "success" | "select" | "link" | "neutral" | "danger";
}) {
  return (
    <div className="panel-title">
      <h2>{title}</h2>
      <span className={`panel-status status-${variant}`}>{status}</span>
    </div>
  );
}

function progressStyle(progress: number): CSSProperties {
  return { "--progress": `${progress}%` } as CSSProperties;
}
