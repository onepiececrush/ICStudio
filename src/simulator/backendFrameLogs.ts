import type { FrameLog } from "./simulatorEngine";
import type { SimulatorServerFrameLog } from "./workspace";

const DEFAULT_FRAME_LOG_LIMIT = 1000;

export function mergeSimulatorStatusFrameLogs(
  existing: FrameLog[],
  backendFrames: SimulatorServerFrameLog[] = [],
  localFrames: FrameLog[] = [],
  limit = DEFAULT_FRAME_LOG_LIMIT,
): FrameLog[] {
  const backendLogs = backendFrames
    .map(toFrameLog)
    .sort((left, right) => (right.backendSequence ?? 0) - (left.backendSequence ?? 0));
  const backendKeys = new Set(backendLogs.map(frameLogKey));
  const localLogs = uniqueLocalLogs([...localFrames, ...existing], backendKeys);
  return [...backendLogs, ...localLogs].slice(0, limit);
}

function toFrameLog(frame: SimulatorServerFrameLog): FrameLog {
  return {
    direction: frame.direction,
    time: formatBackendTime(frame.timestamp),
    frame: frame.frame,
    note: frame.note,
    backendSequence: frame.sequence,
    timestamp: frame.timestamp,
  };
}

function uniqueLocalLogs(logs: FrameLog[], backendKeys: Set<string>): FrameLog[] {
  const seen = new Set<string>();
  return logs.filter((log) => {
    if (log.backendSequence !== undefined) return false;
    const key = frameLogKey(log);
    if (backendKeys.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function frameLogKey(log: Pick<FrameLog, "direction" | "frame" | "note">) {
  return `${log.direction}|${log.frame}|${log.note}`;
}

function formatBackendTime(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}
