import { useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Cable, Pause, Play, Search, X } from "lucide-react";
import {
  groupGlobalFrameLogViews,
  resolveGlobalFrameLogSnapshot,
  type GlobalFrameLogSummary,
  type GlobalFrameLogView,
} from "../simulator/globalFrameLogView";
import type { FrameLog } from "../simulator/simulatorEngine";
import { frameDrawerClass, panelStyle, RESIZE_EDGES, useFramePanel, type ResizeEdge } from "./globalFramePanel";

type GlobalFrameLogDrawerProps = {
  open: boolean;
  logs: FrameLog[];
  onClose: () => void;
};

export function GlobalFrameLogDrawer({ open, logs, onClose }: GlobalFrameLogDrawerProps) {
  const panel = useFramePanel(open);
  const frozenState = useFrozenFrameLogs(logs);
  const [keyword, setKeyword] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const grouped = useMemo(() => groupGlobalFrameLogViews(frozenState.sourceLogs, keyword), [frozenState.sourceLogs, keyword]);
  const selectedFrame = grouped.all.find((entry) => entry.id === selectedId) ?? null;

  return (
    <aside className={frameDrawerClass(open, panel.interaction)} style={panelStyle(panel.bounds)} aria-label="全局报文记录">
      <FrameHeader
        logsLength={logs.length}
        summary={grouped.summary}
        frozen={frozenState.frozen}
        onToggleFrozen={frozenState.toggleFrozen}
        onClose={onClose}
        onPointerDown={panel.startDrag}
      />
      <FrameToolbar keyword={keyword} onKeywordChange={setKeyword} />
      <FrameStreams grouped={grouped} selectedId={selectedId} onSelect={setSelectedId} />
      <FrameDetail frame={selectedFrame} />
      <ResizeHandles onStartResize={panel.startResize} />
    </aside>
  );
}

function FrameHeader({ logsLength, summary, frozen, onToggleFrozen, onClose, onPointerDown }: {
  logsLength: number;
  summary: GlobalFrameLogSummary;
  frozen: boolean;
  onToggleFrozen: () => void;
  onClose: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  return (
    <div className="global-frame-head" onPointerDown={onPointerDown}>
      <div>
        <span>Global Frame Monitor</span>
        <strong>报文记录</strong>
        <small>累计 {logsLength} 条 · 显示 {summary.total} 条 · 读取 {summary.read} / 写入 {summary.write}</small>
      </div>
      <div className="global-frame-tools">
        <button type="button" className={frozen ? "active" : ""} onClick={onToggleFrozen} aria-pressed={frozen}>
          {frozen ? <Play size={16} /> : <Pause size={16} />}
          <span>{frozen ? "继续刷新" : "暂停刷新"}</span>
        </button>
        <button type="button" onClick={onClose} aria-label="关闭报文记录"><X size={17} /></button>
      </div>
    </div>
  );
}

function FrameToolbar({ keyword, onKeywordChange }: {
  keyword: string;
  onKeywordChange: (keyword: string) => void;
}) {
  return (
    <div className="global-frame-toolbar">
      <label className="global-frame-search">
        <Search size={16} />
        <input value={keyword} placeholder="搜索报文 / 地址 / FC10" onChange={(event) => onKeywordChange(event.target.value)} />
      </label>
    </div>
  );
}

function FrameStreams({ grouped, selectedId, onSelect }: {
  grouped: ReturnType<typeof groupGlobalFrameLogViews>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="global-frame-streams">
      <FrameStream title="读取报文" frames={grouped.read} selectedId={selectedId} onSelect={onSelect} />
      <FrameStream title="写入报文" frames={grouped.write} selectedId={selectedId} onSelect={onSelect} tone="write" />
      <FrameStream title="其他报文" frames={grouped.other} selectedId={selectedId} onSelect={onSelect} tone="other" />
    </div>
  );
}

function FrameStream({ title, frames, selectedId, onSelect, tone = "read" }: {
  title: string;
  frames: GlobalFrameLogView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  tone?: "read" | "write" | "other";
}) {
  return (
    <section className={`global-frame-stream is-${tone}`}>
      <header>
        <strong>{title}</strong>
        <span>{frames.length}</span>
      </header>
      <div className="global-frame-list">
        {frames.length ? frames.map((frame) => (
          <FrameRow frame={frame} selected={selectedId === frame.id} onSelect={onSelect} key={frame.id} />
        )) : <FrameEmpty />}
      </div>
    </section>
  );
}

function FrameRow({ frame, selected, onSelect }: {
  frame: GlobalFrameLogView;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button className={`global-frame-row ${frame.direction} ${selected ? "selected" : ""}`} type="button" onClick={() => onSelect(frame.id)}>
      <span>{frame.time}</span>
      <b>{frame.direction === "request" ? "REQ" : "RES"}</b>
      <code>{frame.frame}</code>
      <small>{frame.note}</small>
    </button>
  );
}

function FrameDetail({ frame }: { frame: GlobalFrameLogView | null }) {
  if (!frame) return <EmptyFrameDetail />;
  return (
    <div className="global-frame-detail">
      <div>
        <strong>{frame.operationLabel} · {frame.direction === "request" ? "REQ" : "RES"}</strong>
        <span>{frame.time}</span>
      </div>
      <code>{frame.frame}</code>
      <small>{frame.note}</small>
    </div>
  );
}

function EmptyFrameDetail() {
  return (
    <div className="global-frame-detail is-empty">
      <Cable size={18} />
      <span>未选中报文</span>
    </div>
  );
}

function FrameEmpty() {
  return (
    <div className="global-frame-empty compact">
      <Cable size={20} />
      <span>暂无报文</span>
    </div>
  );
}

function ResizeHandles({ onStartResize }: {
  onStartResize: (edge: ResizeEdge, event: ReactPointerEvent<HTMLElement>) => void;
}) {
  return RESIZE_EDGES.map((edge) => (
    <span className={`global-frame-resize-handle resize-${edge}`} onPointerDown={(event) => onStartResize(edge, event)} aria-hidden="true" key={edge} />
  ));
}

function useFrozenFrameLogs(logs: readonly FrameLog[]) {
  const [frozen, setFrozen] = useState(false);
  const [frozenLogs, setFrozenLogs] = useState<FrameLog[]>([]);
  const sourceLogs = resolveGlobalFrameLogSnapshot({ frozen, frozenLogs, liveLogs: logs });
  const toggleFrozen = () => {
    if (frozen) {
      setFrozen(false);
      setFrozenLogs([]);
      return;
    }
    setFrozenLogs([...logs]);
    setFrozen(true);
  };
  return { frozen, sourceLogs, toggleFrozen };
}
