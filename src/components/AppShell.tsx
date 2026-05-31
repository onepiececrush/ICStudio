import { useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
  Maximize2,
  Minus,
  RadioTower,
  Search,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  UploadCloud,
  UserRound,
  Waves,
  X,
  Zap,
} from "lucide-react";
import type { AppSnapshot, ModuleKey } from "../types";
import type { PointBindingTrace } from "../pointBinding/registry";
import type { DeviceProfile, DeviceRegister } from "../protocol/deviceProfile";
import type { FrameLog } from "../simulator/simulatorEngine";
import { formatSimulatorRegisterEditorValue } from "../simulator/registerValue";
import type { SimulatorRegisterCommitSource, SimulatorRegisterMeta, SimulatorWorkspaceState } from "../simulator/workspace";
import { PointBindingInspectorDrawer } from "./PointBindingInspectorDrawer";
import { SimulatorRegisterValueInput } from "./SimulatorRegisterValueInput";

type NavItem = {
  key: ModuleKey;
  label: string;
  icon: LucideIcon;
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

type FloatingPanelBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ResizeEdge = "n" | "e" | "s" | "w" | "ne" | "nw" | "se" | "sw";

const framePanelMinWidth = 380;
const framePanelMinHeight = 300;
const framePanelMargin = 14;
const framePanelTopGuard = 64;
const frameResizeEdges: ResizeEdge[] = ["n", "e", "s", "w", "ne", "nw", "se", "sw"];

function createFramePanelBounds(): FloatingPanelBounds {
  if (typeof window === "undefined") {
    return { x: 560, y: 78, width: 720, height: 560 };
  }
  const width = Math.min(720, Math.max(framePanelMinWidth, window.innerWidth - framePanelMargin * 2));
  const height = Math.min(620, Math.max(framePanelMinHeight, window.innerHeight - framePanelTopGuard - framePanelMargin * 2));
  return clampFramePanelBounds({
    x: window.innerWidth - width - 24,
    y: framePanelTopGuard + 14,
    width,
    height,
  });
}

function clampFramePanelBounds(bounds: FloatingPanelBounds): FloatingPanelBounds {
  if (typeof window === "undefined") return bounds;
  const maxWidth = Math.max(framePanelMinWidth, window.innerWidth - framePanelMargin * 2);
  const maxHeight = Math.max(framePanelMinHeight, window.innerHeight - framePanelTopGuard - framePanelMargin * 2);
  const width = Math.min(Math.max(bounds.width, framePanelMinWidth), maxWidth);
  const height = Math.min(Math.max(bounds.height, framePanelMinHeight), maxHeight);
  return {
    width,
    height,
    x: Math.min(Math.max(bounds.x, framePanelMargin), window.innerWidth - width - framePanelMargin),
    y: Math.min(Math.max(bounds.y, framePanelTopGuard), window.innerHeight - height - framePanelMargin),
  };
}

function clampValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function resizeFramePanelBounds(bounds: FloatingPanelBounds, edge: ResizeEdge, deltaX: number, deltaY: number): FloatingPanelBounds {
  if (typeof window === "undefined") return bounds;

  let left = bounds.x;
  let right = bounds.x + bounds.width;
  let top = bounds.y;
  let bottom = bounds.y + bounds.height;
  const maxRight = window.innerWidth - framePanelMargin;
  const maxBottom = window.innerHeight - framePanelMargin;

  if (edge.includes("w")) {
    left = clampValue(left + deltaX, framePanelMargin, right - framePanelMinWidth);
  }
  if (edge.includes("e")) {
    right = clampValue(right + deltaX, left + framePanelMinWidth, maxRight);
  }
  if (edge.includes("n")) {
    top = clampValue(top + deltaY, framePanelTopGuard, bottom - framePanelMinHeight);
  }
  if (edge.includes("s")) {
    bottom = clampValue(bottom + deltaY, top + framePanelMinHeight, maxBottom);
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

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

function CustomTitleBar({
  snapshot,
  onEmergencyStop,
  simulatorFrameCount,
  simulatorRunning,
  simulatorQuickCount,
  onOpenFrameLog,
  onOpenQuickAdjust,
}: {
  snapshot: AppSnapshot;
  onEmergencyStop?: () => void;
  simulatorFrameCount: number;
  simulatorRunning: boolean;
  simulatorQuickCount: number;
  onOpenFrameLog: () => void;
  onOpenQuickAdjust: () => void;
}) {
  const currentTime = useCurrentTime();

  const handleMinimize = () => {
    void runWindowAction((window) => window.minimize());
  };

  const handleToggleMaximize = () => {
    void runWindowAction((window) => window.toggleMaximize());
  };

  const handleClose = () => {
    void runWindowAction((window) => window.close());
  };
  const connectionClass = snapshot.connection.status === "已连接" ? "is-connected" : "is-disconnected";

  return (
    <header className="app-titlebar">
      <div
        className="titlebar-brand titlebar-drag-source"
        data-tauri-drag-region
        onDoubleClick={handleToggleMaximize}
      >
        <Brand />
      </div>

      <div className="titlebar-command-center">
        <button className="project-pill glass-widget" type="button">
          <span>当前工程</span>
          <strong>{snapshot.project.name}</strong>
          <ChevronDown size={16} />
        </button>
        <StatusChip
          label="协议版本"
          value={snapshot.project.protocolVersion}
          onDoubleClick={handleToggleMaximize}
        />
        <StatusChip
          label="通信模式"
          value={snapshot.connection.mode}
          onDoubleClick={handleToggleMaximize}
        />
        <div
          className={`connection-pill glass-widget titlebar-drag-source ${connectionClass}`}
          aria-label={`连接状态：${snapshot.connection.status}`}
          data-tauri-drag-region
          onDoubleClick={handleToggleMaximize}
        >
          <span className="status-dot" />
          <span>连接状态</span>
          <strong>{snapshot.connection.status}</strong>
          <span>{snapshot.connection.endpoint}</span>
        </div>
        <label className="search-box glass-widget">
          <Search size={17} />
          <input placeholder="搜索功能、设备、参数..." />
        </label>
      </div>

      <div
        className="titlebar-drag-fill titlebar-drag-source"
        data-tauri-drag-region
        onDoubleClick={handleToggleMaximize}
      />

      <div className="titlebar-actions">
        <button className="emergency-stop" type="button" onClick={() => onEmergencyStop?.()}>
          急停
        </button>
        <button className="quick-action" type="button">
          <Zap size={17} />
          <span>快捷操作</span>
          <ChevronDown size={14} />
        </button>
        <button className={`frame-log-button glass-widget ${simulatorRunning ? "is-running" : ""}`} type="button" onClick={onOpenFrameLog}>
          <Cable size={17} />
          <span>报文记录</span>
          <strong>{simulatorFrameCount}</strong>
        </button>
        <button className={`frame-log-button glass-widget ${simulatorRunning ? "is-running" : ""}`} type="button" onClick={onOpenQuickAdjust}>
          <RadioTower size={17} />
          <span>模拟快调</span>
          <strong>{simulatorQuickCount}</strong>
        </button>
        <button className="icon-button glass-widget" type="button" aria-label="告警通知">
          <Bell size={18} />
        </button>
        <div
          className="user-chip glass-widget titlebar-drag-source"
          data-tauri-drag-region
          onDoubleClick={handleToggleMaximize}
        >
          <UserRound size={17} />
          <span>{snapshot.project.operator}</span>
        </div>
        <div
          className="time-chip glass-widget titlebar-drag-source"
          data-tauri-drag-region
          onDoubleClick={handleToggleMaximize}
        >
          <span>{currentTime}</span>
        </div>
        <div className="window-controls" aria-label="窗口控制">
          <button className="window-control" type="button" aria-label="最小化窗口" onClick={handleMinimize}>
            <Minus size={16} />
          </button>
          <button className="window-control" type="button" aria-label="最大化或还原窗口" onClick={handleToggleMaximize}>
            <Maximize2 size={15} />
          </button>
          <button className="window-control close" type="button" aria-label="关闭窗口" onClick={handleClose}>
            <X size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}

function GlobalSimulatorQuickDrawer({
  open,
  workspace,
  profile,
  onClose,
  onRegisterCommit,
  onTogglePin,
}: {
  open: boolean;
  workspace: SimulatorWorkspaceState;
  profile: DeviceProfile | null;
  onClose: () => void;
  onRegisterCommit: (registerId: string, value: string, source?: SimulatorRegisterCommitSource) => Promise<boolean>;
  onTogglePin: (registerId: string) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const registers = profile?.registers ?? [];
  const pinnedRegisters = workspace.pinnedRegisterIds
    .map((registerId) => registers.find((register) => register.id === registerId))
    .filter((register): register is DeviceRegister => Boolean(register));
  const recentRegisters = workspace.recentRegisterIds
    .map((registerId) => registers.find((register) => register.id === registerId))
    .filter((register): register is DeviceRegister => Boolean(register));
  const filteredRegisters = registers.filter((register) => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) return true;
    return [
      String(register.address),
      register.name,
      register.dataType,
      register.group,
    ].some((field) => String(field ?? "").toLowerCase().includes(normalizedKeyword));
  }).slice(0, 12);

  return (
    <aside className={`global-frame-drawer global-simulator-drawer ${open ? "open" : ""}`} aria-label="全局模拟快调台">
      <div className="global-frame-head">
        <div>
          <span>Global Simulator Quick Adjust</span>
          <strong>模拟快调</strong>
          <small>{profile ? `${profile.name} · ${workspace.running ? "运行中" : "未启动"}` : "当前没有可用模拟设备"}</small>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭模拟快调"><X size={17} /></button>
      </div>
      <div className="global-frame-list simulator-quick-list">
        <label className="preview-filter">
          <span>搜索地址 / 名称</span>
          <input value={keyword} placeholder="例如 14006 / active power" onChange={(event) => setKeyword(event.target.value)} />
        </label>

        <QuickSection
          title="常用快调"
          helper={pinnedRegisters.length ? `已 Pin ${pinnedRegisters.length} 个寄存器` : "在从机模拟页 Pin 常用点，这里会常驻显示"}
          registers={pinnedRegisters}
          pinnedRegisterIds={workspace.pinnedRegisterIds}
          registerMeta={workspace.registerMeta}
          onRegisterCommit={onRegisterCommit}
          onTogglePin={onTogglePin}
        />

        <QuickSection
          title="最近修改"
          helper={recentRegisters.length ? "跨页面改值记录会出现在这里" : "还没有修改记录"}
          registers={recentRegisters}
          pinnedRegisterIds={workspace.pinnedRegisterIds}
          registerMeta={workspace.registerMeta}
          onRegisterCommit={onRegisterCommit}
          onTogglePin={onTogglePin}
        />

        <QuickSection
          title="快速搜索结果"
          helper="默认展示当前设备前 12 个匹配寄存器"
          registers={filteredRegisters}
          pinnedRegisterIds={workspace.pinnedRegisterIds}
          registerMeta={workspace.registerMeta}
          onRegisterCommit={onRegisterCommit}
          onTogglePin={onTogglePin}
        />
      </div>
    </aside>
  );
}

function QuickSection({
  title,
  helper,
  registers,
  pinnedRegisterIds,
  registerMeta,
  onRegisterCommit,
  onTogglePin,
}: {
  title: string;
  helper: string;
  registers: DeviceRegister[];
  pinnedRegisterIds: string[];
  registerMeta: Record<string, SimulatorRegisterMeta>;
  onRegisterCommit: (registerId: string, value: string, source?: SimulatorRegisterCommitSource) => Promise<boolean>;
  onTogglePin: (registerId: string) => void;
}) {
  return (
    <section className="simulator-quick-section">
      <div className="simulator-quick-section-head">
        <div>
          <strong>{title}</strong>
          <small>{helper}</small>
        </div>
      </div>
      {registers.length ? registers.map((register) => (
        <article className="simulator-quick-card" key={register.id}>
          <div className="simulator-quick-card-head">
            <div>
              <strong>{register.name}</strong>
              <span>{register.address} · {register.dataType} · 倍率 {register.scale || 1} · {accessLabel(register.access)}</span>
            </div>
            <button className={`pin-toggle ${pinnedRegisterIds.includes(register.id) ? "active" : ""}`} type="button" aria-label="切换寄存器快调置顶" onClick={() => onTogglePin(register.id)}>
              <RadioTower size={15} />
            </button>
          </div>
          <div className="simulator-quick-card-body">
            <SimulatorRegisterValueInput
              value={formatSimulatorRegisterEditorValue(register)}
              compact
              onCommit={(value) => onRegisterCommit(register.id, value, "quick-drawer")}
            />
            <small>{registerMeta[register.id]?.lastModifiedAt ? `${registerMeta[register.id]?.lastModifiedAt} · ${sourceLabel(registerMeta[register.id]?.lastModifiedSource)}` : "尚未修改"}</small>
          </div>
        </article>
      )) : (
        <div className="global-frame-empty compact">
          <RadioTower size={22} />
          <span>{helper}</span>
        </div>
      )}
    </section>
  );
}

function GlobalFrameLogDrawer({
  open,
  logs,
  onClose,
}: {
  open: boolean;
  logs: FrameLog[];
  onClose: () => void;
}) {
  const [bounds, setBounds] = useState(createFramePanelBounds);
  const [interaction, setInteraction] = useState<"drag" | "resize" | null>(null);

  useEffect(() => {
    if (!open) return;
    setBounds((current) => clampFramePanelBounds(current));
  }, [open]);

  useEffect(() => {
    const handleResize = () => setBounds((current) => clampFramePanelBounds(current));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target instanceof HTMLElement && event.target.closest("button"))) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startBounds = bounds;
    setInteraction("drag");
    const handleMove = (moveEvent: PointerEvent) => {
      setBounds(clampFramePanelBounds({
        ...startBounds,
        x: startBounds.x + moveEvent.clientX - startX,
        y: startBounds.y + moveEvent.clientY - startY,
      }));
    };
    const handleEnd = () => {
      setInteraction(null);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleEnd);
    window.addEventListener("pointercancel", handleEnd);
  };

  const startResize = (edge: ResizeEdge, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startBounds = bounds;
    setInteraction("resize");
    const handleMove = (moveEvent: PointerEvent) => {
      setBounds(resizeFramePanelBounds(startBounds, edge, moveEvent.clientX - startX, moveEvent.clientY - startY));
    };
    const handleEnd = () => {
      setInteraction(null);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleEnd);
    window.addEventListener("pointercancel", handleEnd);
  };

  const panelStyle = {
    "--frame-panel-x": `${bounds.x}px`,
    "--frame-panel-y": `${bounds.y}px`,
    "--frame-panel-width": `${bounds.width}px`,
    "--frame-panel-height": `${bounds.height}px`,
  } as CSSProperties;

  return (
    <aside
      className={`global-frame-drawer global-frame-float ${open ? "open" : ""} ${interaction ? `is-${interaction}` : ""}`}
      style={panelStyle}
      aria-label="全局报文记录"
    >
      <div className="global-frame-head" onPointerDown={startDrag}>
        <div>
          <span>Global Frame Monitor</span>
          <strong>报文记录</strong>
          <small>{logs.length ? `累计 ${logs.length} 条 · 拖标题移动，拖边缘缩放` : "等待从机模拟产生报文 · 可拖拽 / 边缘缩放"}</small>
        </div>
        <div className="global-frame-tools">
          <button type="button" onClick={onClose} aria-label="关闭报文记录"><X size={17} /></button>
        </div>
      </div>
      <div className="global-frame-list">
        {logs.length ? logs.map((log, index) => (
          <article className={`global-frame-row ${log.direction}`} key={`${log.time}-${index}-${log.frame}`}>
            <span>{log.time}</span>
            <b>{log.direction === "request" ? "REQ" : "RES"}</b>
            <code>{log.frame}</code>
            <small>{log.note}</small>
          </article>
        )) : (
          <div className="global-frame-empty">
            <Cable size={24} />
            <strong>暂无报文</strong>
            <span>进入“从机模拟”并启动模拟后，请求/响应报文会持续记录在这里。</span>
          </div>
        )}
      </div>
      {frameResizeEdges.map((edge) => (
        <span
          className={`global-frame-resize-handle resize-${edge}`}
          onPointerDown={(event) => startResize(edge, event)}
          aria-hidden="true"
          key={edge}
        />
      ))}
    </aside>
  );
}

function StatusChip({
  label,
  value,
  onDoubleClick,
}: {
  label: string;
  value: string;
  onDoubleClick: () => void;
}) {
  return (
    <div
      className="status-chip glass-widget titlebar-drag-source"
      data-tauri-drag-region
      onDoubleClick={onDoubleClick}
    >
      <span>{label}</span>
      <strong>{value}</strong>
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

function useCurrentTime() {
  const [currentTime, setCurrentTime] = useState(() => formatCurrentTime(new Date()));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(formatCurrentTime(new Date()));
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  return currentTime;
}

function formatCurrentTime(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date).replace(/\//g, "-");
}

type AppWindow = ReturnType<typeof getCurrentWindow>;

async function runWindowAction(action: (window: AppWindow) => Promise<unknown>) {
  try {
    await action(getCurrentWindow());
  } catch {
    // Tauri APIs are unavailable in plain browser dev/preview mode.
  }
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
    <button className={active ? "nav-item active" : "nav-item"} onClick={onClick} type="button">
      <Icon size={18} />
      <span>{item.label}</span>
    </button>
  );
}
