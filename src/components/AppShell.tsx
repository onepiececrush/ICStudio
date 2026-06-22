import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Cable,
  Cpu,
  Database,
  FileChartColumn,
  FlaskConical,
  Gauge,
  Home,
  Layers3,
  RadioTower,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  UploadCloud,
  Waves,
  Zap,
} from "lucide-react";
import type { AppSnapshot, ModuleKey } from "../types";
import type { PointBindingTrace } from "../pointBinding/registry";
import type { DeviceProfile } from "../protocol/deviceProfile";
import type { SimulatorRegisterCommitSource, SimulatorWorkspaceState } from "../simulator/workspace";
import { CustomTitleBar } from "./CustomTitleBar";
import { GlobalFrameLogDrawer } from "./GlobalFrameLogDrawer";
import { GlobalSimulatorQuickDrawer } from "./GlobalSimulatorQuickDrawer";
import { PointBindingInspectorDrawer } from "./PointBindingInspectorDrawer";

type NavItem = {
  key: ModuleKey;
  label: string;
  icon: LucideIcon;
};

type AppShellProps = {
  activeModule: ModuleKey;
  snapshot: AppSnapshot;
  children: ReactNode;
  onNavigate: (key: ModuleKey) => void;
  selectedPointTrace: PointBindingTrace | null;
  onClosePointInspector: () => void;
  onEmergencyStop?: () => void;
  simulatorWorkspace: SimulatorWorkspaceState;
  selectedSimulatorProfile: DeviceProfile | null;
  onSimulatorRegisterCommit: (registerId: string, value: string, source?: SimulatorRegisterCommitSource) => Promise<boolean>;
  onSimulatorTogglePin: (registerId: string) => void;
};

const navItems: NavItem[] = [
  { key: "dashboard", label: "工程首页", icon: Home },
  { key: "communication", label: "通信调试", icon: Cable },
  { key: "hostVerification", label: "主机验证", icon: Gauge },
  { key: "protocol", label: "协议管理", icon: Layers3 },
  { key: "devices", label: "设备管理", icon: Cpu },
  { key: "monitor", label: "实时监控", icon: Gauge },
  { key: "parameters", label: "参数配置", icon: SlidersHorizontal },
  { key: "control", label: "运行控制", icon: Zap },
  { key: "events", label: "故障事件", icon: ShieldAlert },
  { key: "waveform", label: "波形录波", icon: Waves },
  { key: "history", label: "历史数据", icon: Database },
  { key: "upgrade", label: "固件升级", icon: UploadCloud },
  { key: "autotest", label: "自动化测试", icon: FlaskConical },
  { key: "simulator", label: "从机模拟", icon: RadioTower },
  { key: "scada", label: "组态大屏", icon: FileChartColumn },
  { key: "data", label: "数据服务", icon: Database },
  { key: "settings", label: "系统设置", icon: Settings },
];

export function AppShell(props: AppShellProps) {
  const [frameDrawerOpen, setFrameDrawerOpen] = useState(false);
  const [quickDrawerOpen, setQuickDrawerOpen] = useState(false);
  const simulatorFrameLogs = props.simulatorWorkspace.frameLogs;

  return (
    <div className="app-shell">
      <CustomTitleBar
        snapshot={props.snapshot}
        onEmergencyStop={props.onEmergencyStop}
        simulatorFrameCount={simulatorFrameLogs.length}
        simulatorRunning={props.simulatorWorkspace.running}
        simulatorQuickCount={props.simulatorWorkspace.pinnedRegisterIds.length}
        onOpenFrameLog={() => setFrameDrawerOpen(true)}
        onOpenQuickAdjust={() => setQuickDrawerOpen(true)}
      />
      <div className="app-body">
        <aside className="sidebar">
          <nav className="nav-list" aria-label="主导航">
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
          <main className="workspace">{props.children}</main>
          <BottomStatusBar />
        </section>
        <PointBindingInspectorDrawer trace={props.selectedPointTrace} onClose={props.onClosePointInspector} />
        <GlobalFrameLogDrawer open={frameDrawerOpen} logs={simulatorFrameLogs} onClose={() => setFrameDrawerOpen(false)} />
        <GlobalSimulatorQuickDrawer
          open={quickDrawerOpen}
          workspace={props.simulatorWorkspace}
          profile={props.selectedSimulatorProfile}
          onClose={() => setQuickDrawerOpen(false)}
          onRegisterCommit={props.onSimulatorRegisterCommit}
          onTogglePin={props.onSimulatorTogglePin}
        />
      </div>
    </div>
  );
}

function BottomStatusBar() {
  return (
    <footer className="bottom-statusbar" aria-label="系统底部状态栏">
      <span className="statusbar-ok"><i />连接正常</span>
      <span>轮询周期：1000 ms</span>
      <span>数据更新时间：2025-05-23 14:35:40</span>
      <span>数据点总数：2686</span>
      <span>CPU：18%</span>
      <span>内存：42%</span>
    </footer>
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
    <button className={active ? "nav-item active" : "nav-item"} onClick={onClick} type="button">
      <Icon size={18} />
      <span>{item.label}</span>
    </button>
  );
}
