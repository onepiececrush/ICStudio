import type { LucideIcon } from "lucide-react";
import {
  Cable,
  Cpu,
  Database,
  FileChartColumn,
  FlaskConical,
  Gauge,
  Layers3,
  RadioTower,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  UploadCloud,
  Waves,
} from "lucide-react";
import type { AppSnapshot, ModuleKey } from "../types";

type ModuleMeta = {
  title: string;
  icon: LucideIcon;
  rows: string[];
};

const moduleMeta: Record<Exclude<ModuleKey, "dashboard">, ModuleMeta> = {
  communication: {
    title: "通信中心",
    icon: Cable,
    rows: ["连接配置", "报文助手", "报文监控", "通信统计"],
  },
  protocol: {
    title: "协议管理",
    icon: Layers3,
    rows: ["协议列表", "导入向导", "点位编辑", "版本对比"],
  },
  devices: {
    title: "设备管理",
    icon: Cpu,
    rows: ["设备树", "设备属性", "设备点位", "设备拓扑"],
  },
  monitor: {
    title: "实时监控",
    icon: Gauge,
    rows: ["PCS 实时数据", "BMS 实时数据", "PMU 汇总", "液冷动环"],
  },
  parameters: {
    title: "参数配置",
    icon: SlidersHorizontal,
    rows: ["PCS 参数", "BMS 参数", "保护参数", "参数标定"],
  },
  waveform: {
    title: "波形录波",
    icon: Waves,
    rows: ["实时波形", "故障 ID", "通道配置", "录波导出"],
  },
  alarms: {
    title: "告警管理",
    icon: ShieldAlert,
    rows: ["当前故障", "历史事件", "故障配置", "事件导出"],
  },
  autotest: {
    title: "自动化测试",
    icon: FlaskConical,
    rows: ["用例树", "运行队列", "测试日志", "结果汇总"],
  },
  simulator: {
    title: "从机模拟",
    icon: RadioTower,
    rows: ["模拟总览", "模拟设备", "寄存器表", "故障注入"],
  },
  data: {
    title: "数据服务",
    icon: Database,
    rows: ["数据源", "历史库", "转发配置", "API 服务"],
  },
  reports: {
    title: "报表中心",
    icon: FileChartColumn,
    rows: ["历史报表", "测试报告", "升级报告", "导出队列"],
  },
  upgrade: {
    title: "固件升级",
    icon: UploadCloud,
    rows: ["升级任务", "传输进度", "版本校验", "升级日志"],
  },
  settings: {
    title: "系统设置",
    icon: Settings,
    rows: ["默认路径", "操作确认", "用户权限", "日志级别"],
  },
};

export function ModulePanel(props: { moduleKey: ModuleKey; snapshot: AppSnapshot }) {
  if (props.moduleKey === "dashboard") {
    return null;
  }

  const meta = moduleMeta[props.moduleKey];
  const Icon = meta.icon;

  return (
    <section className="module-panel">
      <div className="module-header">
        <Icon size={34} />
        <div>
          <h1>{meta.title}</h1>
          <p>{props.snapshot.project.protocolVersion}</p>
        </div>
      </div>
      <div className="module-grid">
        {meta.rows.map((row, index) => (
          <article key={row}>
            <span>0{index + 1}</span>
            <strong>{row}</strong>
            <small>{props.snapshot.connection.mode}</small>
          </article>
        ))}
      </div>
    </section>
  );
}
