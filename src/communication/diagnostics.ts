export type DiagnosticProtocol = "TCP" | "RTU";
export type DiagnosticDirection = "request" | "response";
export type DiagnosticResult = "pending" | "ok" | "exception" | "timeout" | "crcError" | "parseError";

export type DiagnosticFrameRecord = {
  id: string;
  requestId?: string;
  timestamp: number;
  time: string;
  direction: DiagnosticDirection;
  channel: string;
  protocol: DiagnosticProtocol;
  unitId?: number;
  functionCode?: number;
  startAddress?: number;
  quantity?: number;
  elapsedMs?: number;
  result: DiagnosticResult;
  exceptionCode?: string;
  rawFrame: string;
  description: string;
  transactionId?: number;
  protocolId?: number;
  mbapLength?: number;
  crcValid?: boolean;
};

export type ParsedDiagnosticFrame = Omit<Partial<DiagnosticFrameRecord>, "result"> & {
  protocol: DiagnosticProtocol;
  result: DiagnosticResult;
  description: string;
};

export type DiagnosticStats = {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  timeoutCount: number;
  crcErrorCount: number;
  exceptionResponseCount: number;
  averageResponseTimeMs: number;
  maxResponseTimeMs: number;
  slowestDevice?: { unitId?: number; averageResponseTimeMs: number; sampleCount: number };
  mostFailureAddressRange?: { range: string; failureCount: number };
  recentFiveMinuteSuccessRate: Array<{ minute: string; successRate: number }>;
};

export type DiagnosticSession = {
  id: string;
  project: string;
  protocolVersion: string;
  connectionConfig: string;
  startTime: number;
  endTime: number;
  frameCount: number;
  exceptionCount: number;
  frames: DiagnosticFrameRecord[];
};

const exceptionLabels: Record<string, string> = {
  "01": "非法功能",
  "02": "非法地址",
  "03": "非法数据值",
  "04": "从站设备故障",
};

export function parseModbusTcpFrame(bytes: Uint8Array, direction: DiagnosticDirection): ParsedDiagnosticFrame {
  if (bytes.length < 8) {
    return { protocol: "TCP", result: "parseError", description: "Modbus TCP 报文长度不足" };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const transactionId = view.getUint16(0, false);
  const protocolId = view.getUint16(2, false);
  const mbapLength = view.getUint16(4, false);
  const unitId = bytes[6];
  const rawFunctionCode = bytes[7];
  const isException = (rawFunctionCode & 0x80) !== 0;
  const functionCode = rawFunctionCode & 0x7f;
  const parsed: ParsedDiagnosticFrame = {
    protocol: "TCP",
    transactionId,
    protocolId,
    mbapLength,
    unitId,
    functionCode,
    result: isException ? "exception" : direction === "request" ? "pending" : "ok",
    description: `MBAP TID=${transactionId} Unit=${unitId} FC=${functionCode}`,
  };

  if (isException) {
    const exceptionCode = toHexByte(bytes[8] ?? 0);
    return {
      ...parsed,
      exceptionCode,
      description: `${parsed.description} 异常响应：${exceptionLabels[exceptionCode] ?? `异常码 ${exceptionCode}`}`,
    };
  }

  if (direction === "request" && bytes.length >= 12) {
    return {
      ...parsed,
      startAddress: view.getUint16(8, false),
      quantity: view.getUint16(10, false),
    };
  }

  return parsed;
}

export function parseModbusRtuFrame(bytes: Uint8Array, direction: DiagnosticDirection): ParsedDiagnosticFrame {
  if (bytes.length < 4) return { protocol: "RTU", result: "parseError", description: "Modbus RTU 报文长度不足" };
  const payload = bytes.slice(0, -2);
  const expected = calculateModbusRtuCrc(payload);
  const actual = bytes[bytes.length - 2] | ((bytes[bytes.length - 1] ?? 0) << 8);
  const crcValid = expected === actual;
  const rawFunctionCode = bytes[1] ?? 0;
  const isException = (rawFunctionCode & 0x80) !== 0;
  const functionCode = rawFunctionCode & 0x7f;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parsed: ParsedDiagnosticFrame = {
    protocol: "RTU",
    unitId: bytes[0],
    functionCode,
    crcValid,
    result: crcValid ? (isException ? "exception" : direction === "request" ? "pending" : "ok") : "crcError",
    description: crcValid ? `RTU Unit=${bytes[0]} FC=${functionCode}` : "RTU CRC 校验失败",
  };
  if (direction === "request" && bytes.length >= 8) {
    parsed.startAddress = view.getUint16(2, false);
    parsed.quantity = view.getUint16(4, false);
  }
  if (isException) parsed.exceptionCode = toHexByte(bytes[2] ?? 0);
  return parsed;
}

export function calculateModbusRtuCrc(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
  }
  return crc & 0xffff;
}

export class CommunicationDiagnosticsCenter {
  private readonly frames: DiagnosticFrameRecord[] = [];
  private sequence = 0;
  private readonly now: () => number;

  constructor(options: { now?: () => number } = {}) {
    this.now = options.now ?? Date.now;
  }

  recordFrame(input: {
    direction: DiagnosticDirection;
    protocol: DiagnosticProtocol;
    channel: string;
    rawFrame: string;
    requestId?: string;
    timestamp?: number;
    elapsedMs?: number;
  }): string {
    const timestamp = input.timestamp ?? this.now();
    const id = `frame-${++this.sequence}`;
    const bytes = hexToBytes(input.rawFrame);
    const parsed = input.protocol === "TCP" ? parseModbusTcpFrame(bytes, input.direction) : parseModbusRtuFrame(bytes, input.direction);
    const request = input.requestId ? this.frames.find((frame) => frame.id === input.requestId) : undefined;
    const elapsedMs = input.elapsedMs ?? (request ? timestamp - request.timestamp : undefined);
    const result: DiagnosticResult = parsed.result === "pending" && input.direction === "response" ? "ok" : parsed.result;
    this.frames.push({
      id,
      requestId: input.requestId ?? (input.direction === "request" ? id : undefined),
      timestamp,
      time: formatTime(timestamp),
      direction: input.direction,
      channel: input.channel,
      protocol: input.protocol,
      unitId: parsed.unitId,
      functionCode: request && input.direction === "response" ? request.functionCode : parsed.functionCode,
      startAddress: request && input.direction === "response" ? request.startAddress : parsed.startAddress,
      quantity: request && input.direction === "response" ? request.quantity : parsed.quantity,
      elapsedMs,
      result,
      exceptionCode: parsed.exceptionCode,
      rawFrame: normalizeHex(input.rawFrame),
      description: parsed.description,
      transactionId: parsed.transactionId,
      protocolId: parsed.protocolId,
      mbapLength: parsed.mbapLength,
      crcValid: parsed.crcValid,
    });
    return id;
  }

  recordTimeout(input: {
    channel: string;
    protocol: DiagnosticProtocol;
    unitId: number;
    functionCode: number;
    startAddress: number;
    quantity: number;
    rawFrame: string;
    elapsedMs: number;
    timestamp?: number;
  }): string {
    const timestamp = input.timestamp ?? this.now();
    const id = `frame-${++this.sequence}`;
    this.frames.push({
      id,
      requestId: id,
      timestamp,
      time: formatTime(timestamp),
      direction: "request",
      channel: input.channel,
      protocol: input.protocol,
      unitId: input.unitId,
      functionCode: input.functionCode,
      startAddress: input.startAddress,
      quantity: input.quantity,
      elapsedMs: input.elapsedMs,
      result: "timeout",
      rawFrame: normalizeHex(input.rawFrame),
      description: `请求超时 ${input.elapsedMs}ms`,
    });
    return id;
  }

  getStats(): DiagnosticStats {
    const outcomes = this.getOutcomeFrames();
    const totalRequests = outcomes.length;
    const successCount = outcomes.filter((frame) => frame.result === "ok").length;
    const timeoutCount = outcomes.filter((frame) => frame.result === "timeout").length;
    const crcErrorCount = outcomes.filter((frame) => frame.result === "crcError").length;
    const exceptionResponseCount = outcomes.filter((frame) => frame.result === "exception").length;
    const failureCount = timeoutCount + crcErrorCount + exceptionResponseCount;
    const elapsedFrames = outcomes.filter((frame) => typeof frame.elapsedMs === "number" && (frame.result === "ok" || frame.result === "exception"));
    const elapsedValues = elapsedFrames.map((frame) => frame.elapsedMs ?? 0);
    const maxResponseTimeMs = elapsedValues.length ? Math.max(...elapsedValues) : 0;
    const averageResponseTimeMs = elapsedValues.length ? round1(elapsedValues.reduce((sum, value) => sum + value, 0) / elapsedValues.length) : 0;
    return {
      totalRequests,
      successCount,
      failureCount,
      timeoutCount,
      crcErrorCount,
      exceptionResponseCount,
      averageResponseTimeMs,
      maxResponseTimeMs,
      slowestDevice: findSlowestDevice(elapsedFrames),
      mostFailureAddressRange: this.findMostFailureAddressRange(outcomes),
      recentFiveMinuteSuccessRate: this.createRecentSuccessRate(outcomes),
    };
  }

  filterFrames(filter: { unitId?: number; functionCode?: number; addressFrom?: number; addressTo?: number }): DiagnosticFrameRecord[] {
    return this.frames.filter((frame) => {
      if (filter.unitId !== undefined && frame.unitId !== filter.unitId) return false;
      if (filter.functionCode !== undefined && frame.functionCode !== filter.functionCode) return false;
      if (filter.addressFrom !== undefined && (frame.startAddress === undefined || frame.startAddress < filter.addressFrom)) return false;
      if (filter.addressTo !== undefined && (frame.startAddress === undefined || frame.startAddress > filter.addressTo)) return false;
      return true;
    });
  }

  saveSession(input: { connectionConfig: string; project: string; protocolVersion: string; endTime: number }): DiagnosticSession {
    return {
      id: `diagnostic-session-${this.frames[0]?.timestamp ?? this.now()}`,
      project: input.project,
      protocolVersion: input.protocolVersion,
      connectionConfig: input.connectionConfig,
      startTime: this.frames[0]?.timestamp ?? this.now(),
      endTime: input.endTime,
      frameCount: this.frames.length,
      exceptionCount: this.frames.filter((frame) => ["timeout", "crcError", "exception", "parseError"].includes(frame.result)).length,
      frames: [...this.frames],
    };
  }

  private getOutcomeFrames() {
    const responsesByRequestId = new Map(this.frames.filter((frame) => frame.direction === "response" && frame.requestId).map((frame) => [frame.requestId, frame]));
    return this.frames.flatMap((frame) => {
      if (frame.direction === "request") {
        const response = responsesByRequestId.get(frame.id);
        return response ? [response] : [frame];
      }
      return frame.requestId ? [] : [frame];
    });
  }

  private findMostFailureAddressRange(frames: DiagnosticFrameRecord[]) {
    const counts = new Map<string, number>();
    for (const frame of frames) {
      if (!["timeout", "crcError", "exception", "parseError"].includes(frame.result) || frame.startAddress === undefined) continue;
      const start = Math.floor(frame.startAddress / 100) * 100;
      const range = `${start}-${start + 99}`;
      counts.set(range, (counts.get(range) ?? 0) + 1);
    }
    const [range, count] = [...counts.entries()].sort((left, right) => right[1] - left[1])[0] ?? [];
    return range ? { range, failureCount: count } : undefined;
  }

  private createRecentSuccessRate(frames: DiagnosticFrameRecord[]) {
    if (frames.length === 0) return [];
    const latest = Math.max(...frames.map((frame) => frame.timestamp));
    const start = latest - 5 * 60_000;
    const visible = frames.filter((frame) => frame.timestamp >= start);
    const total = visible.length;
    const success = visible.filter((frame) => frame.result === "ok").length;
    return [{ minute: formatMinute(latest), successRate: total ? round1((success / total) * 100) : 0 }];
  }
}

function findSlowestDevice(frames: DiagnosticFrameRecord[]) {
  const grouped = new Map<number, { elapsed: number; count: number }>();
  for (const frame of frames) {
    if (frame.unitId === undefined || frame.elapsedMs === undefined) continue;
    const current = grouped.get(frame.unitId) ?? { elapsed: 0, count: 0 };
    current.elapsed += frame.elapsedMs;
    current.count += 1;
    grouped.set(frame.unitId, current);
  }
  return [...grouped.entries()]
    .map(([unitId, item]) => ({ unitId, averageResponseTimeMs: round1(item.elapsed / item.count), sampleCount: item.count }))
    .sort((left, right) => right.averageResponseTimeMs - left.averageResponseTimeMs)[0];
}

export function createDiagnosticSummary(session: DiagnosticSession, stats: DiagnosticStats): string {
  const successRate = stats.totalRequests === 0 ? 0 : (stats.successCount / stats.totalRequests) * 100;
  return `${session.project} ${session.protocolVersion}：${session.frameCount} 帧，异常 ${session.exceptionCount}，成功率 ${successRate.toFixed(1)}%。`;
}

export function generateDiagnosticSummary(session: DiagnosticSession, stats: DiagnosticStats): string {
  return createDiagnosticSummary(session, stats);
}

export function exportFramesAsJson(frames: DiagnosticFrameRecord[]): string {
  return `${JSON.stringify(frames, null, 2)}\n`;
}

export function exportFramesAsCsv(frames: DiagnosticFrameRecord[]): string {
  const header = "时间,方向,通道,协议,设备地址/Unit ID,功能码,起始地址,数量,耗时,结果,异常码,原始报文,解析说明";
  const rows = frames.map((frame) => [
    frame.time,
    frame.direction,
    frame.channel,
    frame.protocol,
    frame.unitId ?? "",
    frame.functionCode ?? "",
    frame.startAddress ?? "",
    frame.quantity ?? "",
    frame.elapsedMs ?? "",
    frame.result,
    frame.exceptionCode ?? "",
    frame.rawFrame,
    frame.description,
  ].map(csvCell).join(","));
  return `${[header, ...rows].join("\n")}\n`;
}

export async function replayFrameToSimulator(
  frame: DiagnosticFrameRecord,
  options: {
    unitId?: number;
    address?: number;
    dataHex?: string;
    sender: (rawFrame: string) => Promise<{ ok: boolean; rawFrame: string; elapsedMs: number; error?: string }>;
  },
): Promise<{ target: "simulator"; ok: boolean; rawFrame: string; elapsedMs: number; error?: string }> {
  const bytes = hexToBytes(frame.rawFrame);
  if (frame.protocol === "TCP") {
    if (options.unitId !== undefined && bytes.length > 6) bytes[6] = options.unitId;
    if (options.address !== undefined && bytes.length > 9) new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint16(8, options.address, false);
    if (options.dataHex && bytes.length > 10) bytes.set(hexToBytes(options.dataHex), 10);
  }
  const rawFrame = bytesToHex(bytes);
  const result = await options.sender(rawFrame);
  return { target: "simulator", ...result };
}

function hexToBytes(value: string): Uint8Array {
  return new Uint8Array(value.trim().split(/\s+/).filter(Boolean).map((part) => Number.parseInt(part, 16)));
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map(toHexByte).join(" ");
}

function normalizeHex(value: string): string {
  return bytesToHex(hexToBytes(value));
}

function toHexByte(value: number): string {
  return value.toString(16).toUpperCase().padStart(2, "0");
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const base = date.toISOString().replace("T", " ").replace("Z", "");
  return base;
}

function formatMinute(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 16);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function csvCell(value: unknown): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
