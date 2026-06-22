import type { FrameLog } from "./simulatorEngine";

export type GlobalFrameOperation = "read" | "write" | "other";

export type GlobalFrameLogView = FrameLog & {
  id: string;
  operation: GlobalFrameOperation;
  operationLabel: string;
};

export type GlobalFrameLogGroups = {
  all: GlobalFrameLogView[];
  read: GlobalFrameLogView[];
  write: GlobalFrameLogView[];
  other: GlobalFrameLogView[];
  summary: GlobalFrameLogSummary;
};

export type GlobalFrameLogSummary = Record<"total" | GlobalFrameOperation, number>;

type SnapshotInput = {
  frozen: boolean;
  frozenLogs: readonly FrameLog[];
  liveLogs: readonly FrameLog[];
};

const READ_FUNCTION_CODES = new Set([0x03, 0x04]);
const WRITE_FUNCTION_CODES = new Set([0x05, 0x06, 0x0f, 0x10]);
const OPERATION_LABELS: Record<GlobalFrameOperation, string> = {
  read: "读取报文",
  write: "写入报文",
  other: "其他报文",
};

export function resolveGlobalFrameLogSnapshot(input: SnapshotInput): readonly FrameLog[] {
  return input.frozen ? input.frozenLogs : input.liveLogs;
}

export function groupGlobalFrameLogViews(logs: readonly FrameLog[], keyword = ""): GlobalFrameLogGroups {
  const views = filterGlobalFrameLogViews(logs, keyword);
  const read = views.filter((view) => view.operation === "read");
  const write = views.filter((view) => view.operation === "write");
  const other = views.filter((view) => view.operation === "other");
  return {
    all: views,
    read,
    write,
    other,
    summary: { total: views.length, read: read.length, write: write.length, other: other.length },
  };
}

export function filterGlobalFrameLogViews(logs: readonly FrameLog[], keyword = ""): GlobalFrameLogView[] {
  const query = keyword.trim().toLowerCase();
  return logs
    .map(toGlobalFrameLogView)
    .filter((view) => !query || globalFrameSearchText(view).includes(query));
}

export function getGlobalFrameLogOperation(log: FrameLog): GlobalFrameOperation {
  const functionCode = extractFunctionCode(log);
  if (functionCode !== null) return operationFromFunctionCode(functionCode);
  return operationFromNote(log.note);
}

function toGlobalFrameLogView(log: FrameLog, index: number): GlobalFrameLogView {
  const operation = getGlobalFrameLogOperation(log);
  return {
    ...log,
    id: `${log.backendSequence ?? index}-${log.time}-${log.direction}-${log.frame}`,
    operation,
    operationLabel: OPERATION_LABELS[operation],
  };
}

function globalFrameSearchText(view: GlobalFrameLogView) {
  return [
    view.direction,
    view.time,
    view.frame,
    view.note,
    view.operation,
    view.operationLabel,
  ].join(" ").toLowerCase();
}

function extractFunctionCode(log: FrameLog): number | null {
  const bytes = parseHexBytes(log.frame);
  if (isModbusTcpFrame(bytes)) return bytes[7] ?? null;
  if (bytes.length >= 2) return bytes[1] ?? null;
  return functionCodeFromNote(log.note);
}

function parseHexBytes(frame: string): number[] {
  const tokens = frame.trim().split(/\s+/);
  if (tokens.some((token) => !/^[0-9a-f]{2}$/i.test(token))) return [];
  return tokens.map((token) => Number.parseInt(token, 16));
}

function isModbusTcpFrame(bytes: readonly number[]) {
  return bytes.length >= 8 && bytes[2] === 0x00 && bytes[3] === 0x00;
}

function functionCodeFromNote(note: string): number | null {
  const upper = note.toUpperCase();
  if (/\bFC(?:0?3|0?4)\b/.test(upper)) return 0x03;
  if (/\bFC(?:0?5|0?6|0?F|15|10|16)\b/.test(upper)) return 0x10;
  return null;
}

function operationFromFunctionCode(functionCode: number): GlobalFrameOperation {
  const normalized = functionCode & 0x7f;
  if (READ_FUNCTION_CODES.has(normalized)) return "read";
  if (WRITE_FUNCTION_CODES.has(normalized)) return "write";
  return "other";
}

function operationFromNote(note: string): GlobalFrameOperation {
  if (/写|WRITE/i.test(note)) return "write";
  if (/读|READ/i.test(note)) return "read";
  return "other";
}
