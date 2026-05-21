import type { LucideIcon } from "lucide-react";
import {
  BatteryCharging,
  Cable,
  CirclePlay,
  Cpu,
  Gauge,
  PlugZap,
  RadioTower,
  Server,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import type { AppSnapshot, MetricCard, TrendPoint } from "../types";

const metricIcons: Record<string, LucideIcon> = {
  health: ShieldCheck,
  online: Server,
  alarm: PlugZap,
  simulation: Cpu,
  autotest: Gauge,
  upgrade: UploadCloud,
};

export function Dashboard({ snapshot }: { snapshot: AppSnapshot }) {
  return (
    <div className="dashboard">
      <MetricGrid metrics={snapshot.metrics} />
      <div className="dashboard-main">
        <TopologyPanel />
        <TrendPanel snapshot={snapshot} />
      </div>
      <ShortcutRow />
      <div className="dashboard-bottom">
        <DeviceTable snapshot={snapshot} />
        <ActivityList snapshot={snapshot} />
      </div>
    </div>
  );
}

function MetricGrid({ metrics }: { metrics: MetricCard[] }) {
  return (
    <section className="metric-grid">
      {metrics.map((metric) => {
        const Icon = metricIcons[metric.key] ?? Gauge;
        return (
          <article className={`metric-card tone-${metric.tone}`} key={metric.key}>
            <div className="metric-label">
              <Icon size={18} />
              <span>{metric.label}</span>
            </div>
            <div className="metric-value">
              <strong>{metric.value}</strong>
              <span>{metric.unit}</span>
            </div>
            <p>{metric.helper}</p>
          </article>
        );
      })}
    </section>
  );
}

function TopologyPanel() {
  return (
    <section className="panel topology-panel">
      <PanelTitle title="储能系统拓扑总览" status="正常" />
      <div className="topology-map">
        <TopologyNode icon={Cable} label="电网" className="node-grid" />
        <TopologyNode icon={Gauge} label="电表" className="node-meter" />
        <TopologyNode icon={Server} label="PCS 集群" className="node-pcs" />
        <TopologyNode icon={RadioTower} label="PMU" className="node-pmu" />
        <TopologyNode icon={BatteryCharging} label="电池簇" className="node-battery" />
        <TopologyNode icon={Cpu} label="BMS" className="node-bms" />
        <span className="link link-a" />
        <span className="link link-b" />
        <span className="link link-c" />
        <span className="link link-d" />
      </div>
    </section>
  );
}

type TopologyNodeProps = {
  icon: LucideIcon;
  label: string;
  className: string;
};

function TopologyNode({ icon: Icon, label, className }: TopologyNodeProps) {
  return (
    <div className={`topology-node ${className}`}>
      <Icon size={25} />
      <span>{label}</span>
    </div>
  );
}

function TrendPanel({ snapshot }: { snapshot: AppSnapshot }) {
  return (
    <section className="panel trend-panel">
      <PanelTitle title="关键指标趋势" status="最近 1 小时" />
      <div className="trend-chart">
        <TrendChart data={snapshot.trends} />
      </div>
      <div className="trend-stats">
        <TrendStat label="功率" value="215.6 kW" />
        <TrendStat label="SOC" value="78.4%" />
        <TrendStat label="通信质量" value="99.2%" />
      </div>
    </section>
  );
}

function TrendChart({ data }: { data: TrendPoint[] }) {
  const powerPath = buildPath(data, "power", 300);
  const socPath = buildPath(data, "soc", 100);
  const qualityPath = buildPath(data, "quality", 100);

  return (
    <svg viewBox="0 0 420 210" role="img" aria-label="关键指标趋势">
      <path className="grid-line" d="M24 42H400M24 84H400M24 126H400M24 168H400" />
      <path className="trend-line power" d={powerPath} />
      <path className="trend-line soc" d={socPath} />
      <path className="trend-line quality" d={qualityPath} />
      {data.map((point, index) => (
        <text className="trend-tick" x={36 + index * 86} y="198" key={point.time}>
          {point.time}
        </text>
      ))}
    </svg>
  );
}

function buildPath(data: TrendPoint[], key: keyof TrendPoint, max: number) {
  return data
    .map((point, index) => {
      const raw = Number(point[key]);
      const x = 36 + index * 86;
      const y = 178 - (raw / max) * 142;
      return `${index === 0 ? "M" : "L"}${x} ${Math.max(28, y)}`;
    })
    .join(" ");
}

function TrendStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ShortcutRow() {
  return (
    <section className="shortcut-row">
      <Shortcut icon={Cable} label="打开连接" meta="通道 2 可用" />
      <Shortcut icon={Gauge} label="进入实时监控" meta="12 台设备在线" />
      <Shortcut icon={RadioTower} label="启动从机模拟" meta="3 个仿真运行" />
      <Shortcut icon={CirclePlay} label="运行自动化测试" meta="5 项待执行" />
    </section>
  );
}

function Shortcut({ icon: Icon, label, meta }: { icon: LucideIcon; label: string; meta: string }) {
  return (
    <button className="shortcut">
      <Icon size={24} />
      <span>{label}</span>
      <small>{meta}</small>
    </button>
  );
}

function DeviceTable({ snapshot }: { snapshot: AppSnapshot }) {
  return (
    <section className="panel device-panel">
      <PanelTitle title="设备状态总览" status="共 12 台设备" />
      <table>
        <thead>
          <tr>
            <th>设备名称</th>
            <th>设备类型</th>
            <th>连接状态</th>
            <th>运行状态</th>
            <th>通信质量</th>
            <th>最后上报</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.devices.map((device) => (
            <tr key={device.name}>
              <td>{device.name}</td>
              <td>{device.deviceType}</td>
              <td><span className="state-dot" />{device.connection}</td>
              <td><span className="run-badge">{device.runtime}</span></td>
              <td>{device.quality}</td>
              <td>{device.lastSeen}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ActivityList({ snapshot }: { snapshot: AppSnapshot }) {
  return (
    <section className="panel activity-panel">
      <PanelTitle title="最近活动" status="查看全部" />
      <div className="activity-list">
        {snapshot.activities.map((activity) => (
          <article className="activity-item" key={`${activity.title}-${activity.time}`}>
            <span className={`activity-marker tone-${activity.tone}`} />
            <div>
              <strong>{activity.title}</strong>
              <p>{activity.detail}</p>
            </div>
            <time>{activity.time}</time>
          </article>
        ))}
      </div>
    </section>
  );
}

function PanelTitle({ title, status }: { title: string; status: string }) {
  return (
    <div className="panel-title">
      <h2>{title}</h2>
      <span>{status}</span>
    </div>
  );
}
