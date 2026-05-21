import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Cable,
  ChevronDown,
  Cpu,
  Database,
  FileChartColumn,
  FlaskConical,
  Gauge,
  Home,
  Layers3,
  RadioTower,
  Search,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  UploadCloud,
  UserRound,
  Waves,
  Zap,
} from "lucide-react";
import type { AppSnapshot, ModuleKey } from "../types";

type NavItem = {
  key: ModuleKey;
  label: string;
  icon: LucideIcon;
};

const navItems: NavItem[] = [
  { key: "dashboard", label: "首页总览", icon: Home },
  { key: "communication", label: "通信中心", icon: Cable },
  { key: "protocol", label: "协议管理", icon: Layers3 },
  { key: "devices", label: "设备管理", icon: Cpu },
  { key: "monitor", label: "实时监控", icon: Gauge },
  { key: "parameters", label: "参数配置", icon: SlidersHorizontal },
  { key: "waveform", label: "波形录波", icon: Waves },
  { key: "alarms", label: "告警管理", icon: ShieldAlert },
  { key: "autotest", label: "自动化测试", icon: FlaskConical },
  { key: "simulator", label: "从机模拟", icon: RadioTower },
  { key: "data", label: "数据服务", icon: Database },
  { key: "reports", label: "报表中心", icon: FileChartColumn },
  { key: "upgrade", label: "固件升级", icon: UploadCloud },
  { key: "settings", label: "系统设置", icon: Settings },
];

type AppShellProps = {
  activeModule: ModuleKey;
  snapshot: AppSnapshot;
  children: ReactNode;
  onNavigate: (key: ModuleKey) => void;
};

export function AppShell(props: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <nav className="nav-list">
          {navItems.map((item) => (
            <NavButton
              item={item}
              active={props.activeModule === item.key}
              onClick={() => props.onNavigate(item.key)}
              key={item.key}
            />
          ))}
        </nav>
      </aside>
      <section className="workbench">
        <Header snapshot={props.snapshot} />
        <main className="workspace">{props.children}</main>
      </section>
    </div>
  );
}

function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark">IC</div>
      <div>
        <strong>ICStudio</strong>
        <span>工控上位机平台</span>
      </div>
    </div>
  );
}

type NavButtonProps = {
  item: NavItem;
  active: boolean;
  onClick: () => void;
};

function NavButton({ item, active, onClick }: NavButtonProps) {
  const Icon = item.icon;
  return (
    <button className={active ? "nav-item active" : "nav-item"} onClick={onClick}>
      <Icon size={18} />
      <span>{item.label}</span>
    </button>
  );
}

function Header({ snapshot }: { snapshot: AppSnapshot }) {
  return (
    <header className="topbar">
      <div className="project-pill">
        <span>当前项目</span>
        <strong>{snapshot.project.name}</strong>
        <ChevronDown size={16} />
      </div>
      <div className="connection-pill">
        <span className="status-dot" />
        <strong>{snapshot.connection.status}</strong>
        <span>{snapshot.connection.endpoint}</span>
      </div>
      <label className="search-box">
        <Search size={17} />
        <input placeholder="搜索功能、设备、参数..." />
      </label>
      <button className="quick-action">
        <Zap size={17} />
        <span>快捷操作</span>
        <ChevronDown size={14} />
      </button>
      <button className="icon-button" aria-label="告警通知">
        <Bell size={18} />
      </button>
      <div className="user-chip">
        <UserRound size={17} />
        <span>{snapshot.project.operator}</span>
      </div>
      <span className="clock">2026-05-21 16:24</span>
    </header>
  );
}
