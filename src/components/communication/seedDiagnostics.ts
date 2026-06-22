import type { AppSnapshot } from "../../types";
import {
  CommunicationDiagnosticsCenter,
  type DiagnosticSession,
  type DiagnosticStats,
} from "../../communication/diagnostics";

export type DiagnosticSeed = {
  center: CommunicationDiagnosticsCenter;
  session: DiagnosticSession;
  stats: DiagnosticStats;
};

export function createSeedDiagnostics(snapshot: AppSnapshot): DiagnosticSeed {
  const baseTime = Date.parse("2026-05-24T00:00:00.000Z");
  const center = new CommunicationDiagnosticsCenter({ now: () => baseTime });

  recordReadSuccess(center, baseTime);
  recordWriteSuccess(center, baseTime + 22_000);
  recordRtuCrcError(center, baseTime + 15_000);
  recordTimeout(center, baseTime + 30_000);
  recordSlowInputRead(center, baseTime + 44_000);
  recordExceptionResponse(center, baseTime + 50_000);

  const stats = center.getStats();
  const session = center.saveSession({
    connectionConfig: `${snapshot.connection.mode} ${snapshot.connection.endpoint} / RTU COM3 9600 8N1`,
    project: snapshot.project.name,
    protocolVersion: snapshot.project.protocolVersion,
    endTime: baseTime + 60_000,
  });

  return { center, session, stats };
}

function recordReadSuccess(center: CommunicationDiagnosticsCenter, timestamp: number) {
  const requestId = center.recordFrame({
    direction: "request",
    protocol: "TCP",
    channel: "tcp://127.0.0.1:1502",
    rawFrame: "00 01 00 00 00 06 01 03 36 B1 00 02",
    timestamp,
  });
  center.recordFrame({
    direction: "response",
    protocol: "TCP",
    channel: "tcp://127.0.0.1:1502",
    rawFrame: "00 01 00 00 00 07 01 03 04 00 0C 00 22",
    requestId,
    timestamp: timestamp + 12,
  });
}

function recordWriteSuccess(center: CommunicationDiagnosticsCenter, timestamp: number) {
  const writeRequest = center.recordFrame({
    direction: "request",
    protocol: "TCP",
    channel: "tcp://127.0.0.1:1502",
    rawFrame: "00 04 00 00 00 06 01 06 9C 42 00 7B",
    timestamp,
  });
  center.recordFrame({
    direction: "response",
    protocol: "TCP",
    channel: "tcp://127.0.0.1:1502",
    rawFrame: "00 04 00 00 00 06 01 06 9C 42 00 7B",
    requestId: writeRequest,
    timestamp: timestamp + 18,
  });
}

function recordRtuCrcError(center: CommunicationDiagnosticsCenter, timestamp: number) {
  center.recordFrame({
    direction: "request",
    protocol: "RTU",
    channel: "rtu://COM3 9600 8N1",
    rawFrame: "01 03 00 6B 00 03 74 18",
    timestamp,
  });
}

function recordTimeout(center: CommunicationDiagnosticsCenter, timestamp: number) {
  center.recordTimeout({
    channel: "rtu://COM3 9600 8N1",
    protocol: "RTU",
    unitId: 2,
    functionCode: 3,
    startAddress: 40001,
    quantity: 1,
    rawFrame: "02 03 9C 41 00 01",
    elapsedMs: 800,
    timestamp,
  });
}

function recordSlowInputRead(center: CommunicationDiagnosticsCenter, timestamp: number) {
  const requestId = center.recordFrame({
    direction: "request",
    protocol: "TCP",
    channel: "tcp://127.0.0.1:1502",
    rawFrame: "00 02 00 00 00 06 03 04 00 64 00 04",
    timestamp,
  });
  center.recordFrame({
    direction: "response",
    protocol: "TCP",
    channel: "tcp://127.0.0.1:1502",
    rawFrame: "00 02 00 00 00 0B 03 04 08 00 01 00 02 00 03 00 04",
    requestId,
    timestamp: timestamp + 132,
  });
}

function recordExceptionResponse(center: CommunicationDiagnosticsCenter, timestamp: number) {
  center.recordFrame({
    direction: "response",
    protocol: "TCP",
    channel: "tcp://127.0.0.1:1502",
    rawFrame: "00 03 00 00 00 03 01 83 02",
    elapsedMs: 9,
    timestamp,
  });
}
