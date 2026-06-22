import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Bell,
  Cable,
  ChevronDown,
  Maximize2,
  Minus,
  RadioTower,
  Search,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import type { AppSnapshot } from "../types";

type CustomTitleBarProps = {
  snapshot: AppSnapshot;
  onEmergencyStop?: () => void;
  simulatorFrameCount: number;
  simulatorRunning: boolean;
  simulatorQuickCount: number;
  onOpenFrameLog: () => void;
  onOpenQuickAdjust: () => void;
};

type StatusChipProps = {
  label: string;
  value: string;
  onDoubleClick: () => void;
};

export function CustomTitleBar({
  snapshot,
  onEmergencyStop,
  simulatorFrameCount,
  simulatorRunning,
  simulatorQuickCount,
  onOpenFrameLog,
  onOpenQuickAdjust,
}: CustomTitleBarProps) {
  const currentTime = useCurrentTime();
  const connectionClass = snapshot.connection.status === "已连接" ? "is-connected" : "is-disconnected";
  const handleMinimize = () => void runWindowAction((window) => window.minimize());
  const handleToggleMaximize = () => void runWindowAction((window) => window.toggleMaximize());
  const handleClose = () => void runWindowAction((window) => window.close());

  return (
    <header className="app-titlebar">
      <div className="titlebar-brand titlebar-drag-source" data-tauri-drag-region onDoubleClick={handleToggleMaximize}>
        <Brand />
      </div>
      <TitlebarCommandCenter snapshot={snapshot} connectionClass={connectionClass} handleToggleMaximize={handleToggleMaximize} />
      <div className="titlebar-drag-fill titlebar-drag-source" data-tauri-drag-region onDoubleClick={handleToggleMaximize} />
      <TitlebarActions
        snapshot={snapshot}
        currentTime={currentTime}
        simulatorFrameCount={simulatorFrameCount}
        simulatorRunning={simulatorRunning}
        simulatorQuickCount={simulatorQuickCount}
        onEmergencyStop={onEmergencyStop}
        onOpenFrameLog={onOpenFrameLog}
        onOpenQuickAdjust={onOpenQuickAdjust}
        handleMinimize={handleMinimize}
        handleToggleMaximize={handleToggleMaximize}
        handleClose={handleClose}
      />
    </header>
  );
}

function TitlebarCommandCenter({ snapshot, connectionClass, handleToggleMaximize }: {
  snapshot: AppSnapshot;
  connectionClass: string;
  handleToggleMaximize: () => void;
}) {
  return (
    <div className="titlebar-command-center">
      <button className="project-pill glass-widget" type="button">
        <span>当前工程</span>
        <strong>{snapshot.project.name}</strong>
        <ChevronDown size={16} />
      </button>
      <StatusChip label="协议版本" value={snapshot.project.protocolVersion} onDoubleClick={handleToggleMaximize} />
      <StatusChip label="通信模式" value={snapshot.connection.mode} onDoubleClick={handleToggleMaximize} />
      <ConnectionPill snapshot={snapshot} className={connectionClass} onDoubleClick={handleToggleMaximize} />
      <label className="search-box glass-widget">
        <Search size={17} />
        <input placeholder="搜索功能、设备、参数..." />
      </label>
    </div>
  );
}

function TitlebarActions(props: CustomTitleBarProps & {
  currentTime: string;
  handleMinimize: () => void;
  handleToggleMaximize: () => void;
  handleClose: () => void;
}) {
  return (
    <div className="titlebar-actions">
      <button className="emergency-stop" type="button" onClick={() => props.onEmergencyStop?.()}>急停</button>
      <button className="quick-action" type="button">
        <Zap size={17} />
        <span>快捷操作</span>
        <ChevronDown size={14} />
      </button>
      <FrameLogButton running={props.simulatorRunning} count={props.simulatorFrameCount} onClick={props.onOpenFrameLog} />
      <QuickAdjustButton running={props.simulatorRunning} count={props.simulatorQuickCount} onClick={props.onOpenQuickAdjust} />
      <button className="icon-button glass-widget" type="button" aria-label="告警通知"><Bell size={18} /></button>
      <UserChip operator={props.snapshot.project.operator} onDoubleClick={props.handleToggleMaximize} />
      <TimeChip currentTime={props.currentTime} onDoubleClick={props.handleToggleMaximize} />
      <WindowControls onMinimize={props.handleMinimize} onToggleMaximize={props.handleToggleMaximize} onClose={props.handleClose} />
    </div>
  );
}

function ConnectionPill({ snapshot, className, onDoubleClick }: {
  snapshot: AppSnapshot;
  className: string;
  onDoubleClick: () => void;
}) {
  return (
    <div className={`connection-pill glass-widget titlebar-drag-source ${className}`} aria-label={`连接状态：${snapshot.connection.status}`} data-tauri-drag-region onDoubleClick={onDoubleClick}>
      <span className="status-dot" />
      <span>连接状态</span>
      <strong>{snapshot.connection.status}</strong>
      <span>{snapshot.connection.endpoint}</span>
    </div>
  );
}

function FrameLogButton({ running, count, onClick }: { running: boolean; count: number; onClick: () => void }) {
  return (
    <button className={`frame-log-button glass-widget ${running ? "is-running" : ""}`} type="button" onClick={onClick}>
      <Cable size={17} />
      <span>报文记录</span>
      <strong>{count}</strong>
    </button>
  );
}

function QuickAdjustButton({ running, count, onClick }: { running: boolean; count: number; onClick: () => void }) {
  return (
    <button className={`frame-log-button glass-widget ${running ? "is-running" : ""}`} type="button" onClick={onClick}>
      <RadioTower size={17} />
      <span>模拟快调</span>
      <strong>{count}</strong>
    </button>
  );
}

function StatusChip({ label, value, onDoubleClick }: StatusChipProps) {
  return (
    <div className="status-chip glass-widget titlebar-drag-source" data-tauri-drag-region onDoubleClick={onDoubleClick}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function UserChip({ operator, onDoubleClick }: { operator: string; onDoubleClick: () => void }) {
  return (
    <div className="user-chip glass-widget titlebar-drag-source" data-tauri-drag-region onDoubleClick={onDoubleClick}>
      <UserRound size={17} />
      <span>{operator}</span>
    </div>
  );
}

function TimeChip({ currentTime, onDoubleClick }: { currentTime: string; onDoubleClick: () => void }) {
  return (
    <div className="time-chip glass-widget titlebar-drag-source" data-tauri-drag-region onDoubleClick={onDoubleClick}>
      <span>{currentTime}</span>
    </div>
  );
}

function WindowControls({ onMinimize, onToggleMaximize, onClose }: {
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
}) {
  return (
    <div className="window-controls" aria-label="窗口控制">
      <button className="window-control" type="button" aria-label="最小化窗口" onClick={onMinimize}>
        <Minus size={16} />
      </button>
      <button className="window-control" type="button" aria-label="最大化或还原窗口" onClick={onToggleMaximize}>
        <Maximize2 size={15} />
      </button>
      <button className="window-control close" type="button" aria-label="关闭窗口" onClick={onClose}>
        <X size={16} />
      </button>
    </div>
  );
}

function useCurrentTime() {
  const [currentTime, setCurrentTime] = useState(() => formatCurrentTime(new Date()));

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(formatCurrentTime(new Date())), 1000);
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
