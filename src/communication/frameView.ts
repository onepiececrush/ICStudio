import type { DiagnosticFrameRecord, DiagnosticResult } from "./diagnostics";

export type DiagnosticFrameOperation = "read" | "write" | "other";
export type DiagnosticFrameOperationFilter = DiagnosticFrameOperation | "all";

export type DiagnosticFrameViewFilter = {
  unitId?: number;
  functionCode?: number;
  addressFrom?: number;
  addressTo?: number;
  operation?: DiagnosticFrameOperationFilter;
  keyword?: string;
};

export type DiagnosticFrameView = DiagnosticFrameRecord & {
  operation: DiagnosticFrameOperation;
  operationLabel: string;
  directionLabel: string;
  resultLabel: string;
};

export type DiagnosticFrameOperationSummary = {
  total: number;
  read: number;
  write: number;
  other: number;
};

const READ_FUNCTION_CODES = new Set([1, 2, 3, 4]);
const WRITE_FUNCTION_CODES = new Set([5, 6, 15, 16]);

export const diagnosticFrameOperationLabels: Record<DiagnosticFrameOperation, string> = {
  read: "读取报文",
  write: "写入报文",
  other: "其他报文",
};

export const diagnosticFrameResultLabels: Record<DiagnosticResult, string> = {
  pending: "等待响应",
  ok: "成功",
  exception: "异常响应",
  timeout: "超时",
  crcError: "CRC 错误",
  parseError: "解析错误",
};

export function getDiagnosticFrameOperation(frame: Pick<DiagnosticFrameRecord, "functionCode">): DiagnosticFrameOperation {
  if (frame.functionCode === undefined) return "other";
  if (READ_FUNCTION_CODES.has(frame.functionCode)) return "read";
  if (WRITE_FUNCTION_CODES.has(frame.functionCode)) return "write";
  return "other";
}

export function toDiagnosticFrameView(frame: DiagnosticFrameRecord): DiagnosticFrameView {
  const operation = getDiagnosticFrameOperation(frame);
  return {
    ...frame,
    operation,
    operationLabel: diagnosticFrameOperationLabels[operation],
    directionLabel: frame.direction === "request" ? "请求" : "响应",
    resultLabel: diagnosticFrameResultLabels[frame.result],
  };
}

export function filterDiagnosticFrameViews(
  frames: DiagnosticFrameRecord[],
  filter: DiagnosticFrameViewFilter = {},
): DiagnosticFrameView[] {
  const keyword = normalizeKeyword(filter.keyword);
  return frames
    .map(toDiagnosticFrameView)
    .filter((frame) => matchesFieldFilters(frame, filter))
    .filter((frame) => matchesOperationFilter(frame, filter.operation ?? "all"))
    .filter((frame) => keyword === "" || makeSearchText(frame).includes(keyword));
}

export function summarizeDiagnosticFrameOperations(frames: DiagnosticFrameRecord[]): DiagnosticFrameOperationSummary {
  const summary: DiagnosticFrameOperationSummary = { total: frames.length, read: 0, write: 0, other: 0 };
  for (const frame of frames) summary[getDiagnosticFrameOperation(frame)] += 1;
  return summary;
}

/**
 * 命中判断：关键字命中报文卡片（用于实时报文面板的高亮与上一个/下一个匹配导航）。
 * 关键字为空时视作全部命中。
 */
export function frameMatchesKeyword(frame: DiagnosticFrameView, keyword?: string): boolean {
  const normalized = normalizeKeyword(keyword);
  return normalized === "" || makeSearchText(frame).includes(normalized);
}

export function describeDiagnosticFrame(frame: DiagnosticFrameRecord): string {
  const details = [frame.description];
  if (frame.protocol === "TCP" && frame.transactionId !== undefined) details.push(`MBAP TID=${frame.transactionId} Length=${frame.mbapLength}`);
  if (frame.protocol === "RTU" && frame.crcValid !== undefined) details.push(`CRC ${frame.crcValid ? "通过" : "失败"}`);
  return details.join("；");
}

export function diagnosisForDiagnosticFrame(frame: DiagnosticFrameRecord): string {
  if (frame.result === "timeout") return "无响应：检查设备地址、串口线、IP、端口";
  if (frame.result === "crcError") return "CRC 错误：检查波特率、校验位、线路干扰";
  if (frame.exceptionCode === "01") return "异常码 01：非法功能码";
  if (frame.exceptionCode === "02") return "异常码 02：非法地址";
  if (frame.exceptionCode === "03") return "异常码 03：非法数据值";
  if (frame.exceptionCode === "04") return "异常码 04：从站设备故障";
  return "响应长度异常：检查数据类型或寄存器数量";
}

function matchesFieldFilters(frame: DiagnosticFrameRecord, filter: DiagnosticFrameViewFilter): boolean {
  if (filter.unitId !== undefined && frame.unitId !== filter.unitId) return false;
  if (filter.functionCode !== undefined && frame.functionCode !== filter.functionCode) return false;
  if (filter.addressFrom !== undefined && !addressAtLeast(frame.startAddress, filter.addressFrom)) return false;
  if (filter.addressTo !== undefined && !addressAtMost(frame.startAddress, filter.addressTo)) return false;
  return true;
}

function matchesOperationFilter(frame: DiagnosticFrameView, operation: DiagnosticFrameOperationFilter): boolean {
  return operation === "all" || frame.operation === operation;
}

function makeSearchText(frame: DiagnosticFrameView): string {
  return [
    frame.id,
    frame.time,
    frame.directionLabel,
    frame.operationLabel,
    frame.channel,
    frame.protocol,
    frame.unitId,
    frame.functionCode,
    frame.startAddress,
    frame.quantity,
    frame.elapsedMs,
    frame.resultLabel,
    frame.exceptionCode,
    frame.rawFrame,
    frame.rawFrame.replace(/\s+/g, ""),
    frame.description,
  ].join(" ").toLowerCase();
}

function normalizeKeyword(keyword?: string): string {
  return (keyword ?? "").trim().toLowerCase();
}

function addressAtLeast(address: number | undefined, minimum: number): boolean {
  return address !== undefined && address >= minimum;
}

function addressAtMost(address: number | undefined, maximum: number): boolean {
  return address !== undefined && address <= maximum;
}
