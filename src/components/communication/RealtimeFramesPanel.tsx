import { type Ref, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Crosshair,
  PauseCircle,
  PlayCircle,
  RadioTower,
  Search,
} from "lucide-react";
import type {
  DiagnosticFrameOperationSummary,
  DiagnosticFrameView,
} from "../../communication/frameView";
import {
  describeDiagnosticFrame,
  frameMatchesKeyword,
} from "../../communication/frameView";
import { ResultBadge } from "./CommunicationDiagnosticsPanels";
import "../../styles/communication-frames.css";

type RealtimeFramesPanelProps = {
  frames: DiagnosticFrameView[];
  totalCount: number;
  summary: DiagnosticFrameOperationSummary;
};

export function RealtimeFramesPanel({ frames, totalCount, summary }: RealtimeFramesPanelProps) {
  const [followLatest, setFollowLatest] = useState(true);
  const [selectedFrameId, setSelectedFrameId] = useState("");
  const [keyword, setKeyword] = useState("");

  const streams = useMemo(() => splitFramesByOperation(frames), [frames]);
  const matchedFrameIds = useMemo(() => collectMatchedIds(frames, keyword), [frames, keyword]);
  const matchedIdSet = useMemo(() => new Set(matchedFrameIds), [matchedFrameIds]);

  const selectedFrame = useMemo(
    () => resolveSelectedFrame(frames, selectedFrameId, followLatest),
    [frames, selectedFrameId, followLatest],
  );

  const readScrollRef = useRef<HTMLDivElement | null>(null);
  const writeScrollRef = useRef<HTMLDivElement | null>(null);

  // 跟随最新：每次报文刷新时把读取/写入两栏滚到底部（用户未暂停且未在搜索定位时）。
  useEffect(() => {
    if (!followLatest) return;
    scrollStreamsToBottom([readScrollRef.current, writeScrollRef.current]);
  }, [frames, followLatest]);

  // 选中行始终滚动进入可见区域，避免被快速滚动的报文冲出视口。
  useEffect(() => {
    const node = document.querySelector(`[data-frame-id="${cssEscape(selectedFrame?.id ?? "")}"]`);
    node?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedFrame]);

  function selectFrame(frameId: string) {
    setFollowLatest(false);
    setSelectedFrameId(frameId);
  }

  function selectLatest() {
    const latest = frames[frames.length - 1];
    if (!latest) return;
    setSelectedFrameId(latest.id);
    setFollowLatest(true);
  }

  function stepFrame(delta: number) {
    const target = stepWithin(frames, selectedFrame?.id, delta);
    if (target) selectFrame(target.id);
  }

  function stepMatch(delta: number) {
    const target = stepWithin(matchedFrameIds.map((id) => ({ id } as DiagnosticFrameView)), selectedFrame?.id, delta);
    if (target) selectFrame(target.id);
  }

  const matchPosition = matchedPosition(matchedFrameIds, selectedFrame?.id);
  const matchSummary = keyword.trim()
    ? `命中 ${matchedFrameIds.length} 条`
    : `共 ${frames.length} 帧`;

  return (
    <section className="lab-card glass-panel">
      <div className="lab-section-title frame-monitor-head">
        <div>
          <span className="eyebrow"><RadioTower size={13} /> Live Frames</span>
          <h2>实时报文</h2>
          <p>当前显示 {frames.length} / {totalCount} 帧；读取 {summary.read}，写入 {summary.write}，其他 {summary.other}。读写分栏独立滚动与计数。</p>
        </div>
        <div className="frame-monitor-tools">
          <label className="frame-search-box">
            <Search size={14} />
            <input
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索报文：原始字节 / 地址 / 异常码"
              aria-label="报文搜索"
            />
          </label>
          <div className="frame-nav-group" role="group" aria-label="报文定位">
            <button className="mini-button" type="button" onClick={() => stepMatch(-1)} disabled={matchedFrameIds.length === 0} title="上一个匹配">
              <ChevronLeft size={14} />匹配
            </button>
            <span className="frame-match-count" aria-live="polite">{matchPosition}</span>
            <button className="mini-button" type="button" onClick={() => stepMatch(1)} disabled={matchedFrameIds.length === 0} title="下一个匹配">
              匹配<ChevronRight size={14} />
            </button>
            <span className="frame-nav-separator" aria-hidden="true">·</span>
            <button className="mini-button" type="button" onClick={() => stepFrame(-1)} title="上一帧">
              <ChevronLeft size={14} />上一帧
            </button>
            <button className="mini-button" type="button" onClick={() => stepFrame(1)} title="下一帧">
              下一帧<ChevronRight size={14} />
            </button>
          </div>
          <button className="mini-button" type="button" onClick={() => setFollowLatest((current) => !current)}>
            {followLatest ? <PauseCircle size={14} /> : <PlayCircle size={14} />}
            {followLatest ? "暂停滚动" : "跟随最新"}
          </button>
          <button className="mini-button" type="button" onClick={selectLatest}>
            <Crosshair size={14} />定位最新
          </button>
        </div>
      </div>
      <p className="frame-toolbar-summary">{matchSummary}{followLatest ? " · 跟随最新" : " · 已暂停滚动"}</p>
      <div className="frame-streams frame-monitor-layout">
        <FrameStream
          title="读取报文"
          count={streams.read.length}
          scrollRef={readScrollRef}
          frames={streams.read}
          selectedFrameId={selectedFrame?.id}
          matchedIds={matchedIdSet}
          onSelectFrame={selectFrame}
        />
        <FrameStream
          title="写入报文"
          count={streams.write.length}
          scrollRef={writeScrollRef}
          frames={streams.write}
          selectedFrameId={selectedFrame?.id}
          matchedIds={matchedIdSet}
          onSelectFrame={selectFrame}
          tone="write"
        />
      </div>
      {streams.other.length > 0 ? (
        <FrameStream
          title="其他报文"
          count={streams.other.length}
          frames={streams.other}
          selectedFrameId={selectedFrame?.id}
          matchedIds={matchedIdSet}
          onSelectFrame={selectFrame}
          tone="other"
          compact
        />
      ) : null}
      <FrameDetail frame={selectedFrame} followLatest={followLatest} />
    </section>
  );
}

type FrameStreamProps = {
  title: string;
  count: number;
  scrollRef?: Ref<HTMLDivElement>;
  frames: DiagnosticFrameView[];
  selectedFrameId?: string;
  matchedIds: Set<string>;
  onSelectFrame: (frameId: string) => void;
  tone?: "write" | "other";
  compact?: boolean;
};

function FrameStream({ title, count, scrollRef, frames, selectedFrameId, matchedIds, onSelectFrame, tone, compact }: FrameStreamProps) {
  return (
    <section className={`frame-stream frame-stream-${tone ?? "read"}${compact ? " compact" : ""}`}>
      <header className="frame-stream-head">
        <strong>{title}</strong>
        <span className="frame-stream-count">{count} 帧</span>
      </header>
      <div className="frame-stream-body" ref={scrollRef}>
        {frames.length === 0 ? (
          <p className="frame-monitor-empty">暂无{title}</p>
        ) : (
          frames.map((frame) => (
            <FrameCard
              key={frame.id}
              frame={frame}
              selected={frame.id === selectedFrameId}
              matched={matchedIds.has(frame.id)}
              onSelectFrame={onSelectFrame}
            />
          ))
        )}
      </div>
    </section>
  );
}

function FrameCard({ frame, selected, matched, onSelectFrame }: FrameCardProps) {
  return (
    <button
      type="button"
      data-frame-id={frame.id}
      onClick={() => onSelectFrame(frame.id)}
      onKeyDown={(event) => handleFrameCardKey(event.key, frame.id, onSelectFrame)}
      className={[
        "frame-card",
        `frame-card-${frame.operation}`,
        selected ? "selected" : "",
        matched ? "matched" : "",
      ].join(" ")}
      aria-pressed={selected}
    >
      <div className="frame-card-head">
        <span className="frame-card-time">{frame.time}</span>
        <span className="frame-card-direction">{frame.directionLabel}</span>
        <span className={`frame-operation ${frame.operation}`}>{frame.operationLabel}</span>
        <ResultBadge result={frame.result} />
      </div>
      <div className="frame-card-meta">
        <span>Unit {frame.unitId ?? "-"}</span>
        <span>FC{frame.functionCode ?? "-"}</span>
        <span>地址 {frame.startAddress ?? "-"}</span>
        <span>数量 {frame.quantity ?? "-"}</span>
        <span>{frame.elapsedMs === undefined ? "-" : `${frame.elapsedMs} ms`}</span>
      </div>
      <code className="frame-card-raw">{frame.rawFrame}</code>
    </button>
  );
}

type FrameCardProps = {
  frame: DiagnosticFrameView;
  selected: boolean;
  matched: boolean;
  onSelectFrame: (frameId: string) => void;
};

function FrameDetail({ frame, followLatest }: { frame?: DiagnosticFrameView; followLatest: boolean }) {
  if (!frame) {
    return (
      <aside className="frame-detail-panel frame-detail-wide">
        <div className="frame-detail-title">
          <strong>报文详情</strong>
          <span>暂无报文</span>
        </div>
      </aside>
    );
  }
  return (
    <aside className="frame-detail-panel frame-detail-wide">
      <div className="frame-detail-title">
        <strong>报文详情</strong>
        <span>{followLatest ? "跟随最新" : "已锁定"}</span>
      </div>
      <dl>
        <div><dt>时间</dt><dd>{frame.time}</dd></div>
        <div><dt>方向</dt><dd>{frame.directionLabel}</dd></div>
        <div><dt>读/写</dt><dd>{frame.operationLabel}</dd></div>
        <div><dt>通道</dt><dd>{frame.channel}</dd></div>
        <div><dt>协议</dt><dd>{frame.protocol}</dd></div>
        <div><dt>设备地址 / Unit ID</dt><dd>{frame.unitId ?? "-"}</dd></div>
        <div><dt>功能码</dt><dd>{frame.functionCode ?? "-"}</dd></div>
        <div><dt>起始地址</dt><dd>{frame.startAddress ?? "-"}</dd></div>
        <div><dt>数量</dt><dd>{frame.quantity ?? "-"}</dd></div>
        <div><dt>耗时</dt><dd>{frame.elapsedMs === undefined ? "-" : `${frame.elapsedMs} ms`}</dd></div>
        <div><dt>结果</dt><dd><ResultBadge result={frame.result} /></dd></div>
        <div><dt>异常码</dt><dd>{frame.exceptionCode ?? "-"}</dd></div>
      </dl>
      <div className="frame-detail-raw">
        <span className="frame-detail-label">原始报文</span>
        <code>{frame.rawFrame}</code>
      </div>
      <div className="frame-detail-parse">
        <span className="frame-detail-label">解析说明</span>
        <small>{describeDiagnosticFrame(frame)}</small>
      </div>
    </aside>
  );
}

function splitFramesByOperation(frames: DiagnosticFrameView[]) {
  const read: DiagnosticFrameView[] = [];
  const write: DiagnosticFrameView[] = [];
  const other: DiagnosticFrameView[] = [];
  for (const frame of frames) {
    if (frame.operation === "read") read.push(frame);
    else if (frame.operation === "write") write.push(frame);
    else other.push(frame);
  }
  return { read, write, other };
}

function collectMatchedIds(frames: DiagnosticFrameView[], keyword: string): string[] {
  const trimmed = keyword.trim().toLowerCase();
  if (!trimmed) return [];
  return frames.filter((frame) => frameMatchesKeyword(frame, trimmed)).map((frame) => frame.id);
}

function resolveSelectedFrame(frames: DiagnosticFrameView[], selectedFrameId: string, followLatest: boolean) {
  if (frames.length === 0) return undefined;
  if (followLatest) return frames[frames.length - 1];
  return frames.find((frame) => frame.id === selectedFrameId) ?? frames[frames.length - 1];
}

function stepWithin<T extends { id: string }>(items: T[], currentId: string | undefined, delta: number): T | undefined {
  if (items.length === 0) return undefined;
  const currentIndex = currentId ? items.findIndex((item) => item.id === currentId) : -1;
  const baseIndex = currentIndex === -1 ? items.length - 1 : currentIndex;
  const nextIndex = clamp(baseIndex + delta, 0, items.length - 1);
  return items[nextIndex];
}

function matchedPosition(matchedIds: string[], currentId?: string): string {
  if (matchedIds.length === 0) return "0 / 0";
  const index = currentId ? matchedIds.indexOf(currentId) : -1;
  if (index === -1) return `0 / ${matchedIds.length}`;
  return `${index + 1} / ${matchedIds.length}`;
}

function scrollStreamsToBottom(nodes: Array<HTMLDivElement | null>) {
  for (const node of nodes) {
    if (!node) continue;
    node.scrollTop = node.scrollHeight;
  }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function handleFrameCardKey(key: string, frameId: string, onSelectFrame: (frameId: string) => void) {
  if (key === "Enter" || key === " ") onSelectFrame(frameId);
}

function cssEscape(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "");
}
