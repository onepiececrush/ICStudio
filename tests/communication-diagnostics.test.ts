import assert from "node:assert/strict";
import test from "node:test";
import {
  CommunicationDiagnosticsCenter,
  calculateModbusRtuCrc,
  createDiagnosticSummary,
  exportFramesAsCsv,
  exportFramesAsJson,
  parseModbusTcpFrame,
  parseModbusRtuFrame,
  replayFrameToSimulator,
  type DiagnosticFrameRecord,
} from "../src/communication/diagnostics";

const baseTime = Date.parse("2026-05-24T00:00:00.000Z");

test("parses Modbus TCP MBAP requests and exception responses", () => {
  const request = parseModbusTcpFrame(hex("00 2A 00 00 00 06 11 03 36 B1 00 02"), "request");
  assert.equal(request.protocol, "TCP");
  assert.equal(request.transactionId, 42);
  assert.equal(request.protocolId, 0);
  assert.equal(request.mbapLength, 6);
  assert.equal(request.unitId, 0x11);
  assert.equal(request.functionCode, 3);
  assert.equal(request.startAddress, 0x36b1);
  assert.equal(request.quantity, 2);
  assert.equal(request.result, "pending");
  assert.match(request.description, /MBAP/);

  const exception = parseModbusTcpFrame(hex("00 2A 00 00 00 03 11 83 02"), "response");
  assert.equal(exception.functionCode, 3);
  assert.equal(exception.exceptionCode, "02");
  assert.equal(exception.result, "exception");
  assert.match(exception.description, /非法地址/);
});

test("parses Modbus RTU frames, verifies CRC, and flags CRC errors", () => {
  const request = parseModbusRtuFrame(hex("01 03 00 6B 00 03 74 17"), "request");
  assert.equal(request.protocol, "RTU");
  assert.equal(request.unitId, 1);
  assert.equal(request.functionCode, 3);
  assert.equal(request.startAddress, 107);
  assert.equal(request.quantity, 3);
  assert.equal(request.crcValid, true);
  assert.equal(calculateModbusRtuCrc(hex("01 03 00 6B 00 03")), 0x1774);

  const corrupted = parseModbusRtuFrame(hex("01 03 00 6B 00 03 74 18"), "request");
  assert.equal(corrupted.crcValid, false);
  assert.equal(corrupted.result, "crcError");
});

test("records request/response pairs, computes stats, filters, and saves sessions", () => {
  const center = new CommunicationDiagnosticsCenter({ now: () => baseTime });
  const okRequestId = center.recordFrame({
    direction: "request",
    protocol: "TCP",
    channel: "tcp://127.0.0.1:1502",
    rawFrame: "00 01 00 00 00 06 01 03 36 B1 00 02",
  });
  center.recordFrame({
    direction: "response",
    protocol: "TCP",
    channel: "tcp://127.0.0.1:1502",
    rawFrame: "00 01 00 00 00 07 01 03 04 00 0C 00 22",
    requestId: okRequestId,
    timestamp: baseTime + 12,
  });

  center.recordTimeout({
    channel: "rtu://COM3",
    protocol: "RTU",
    unitId: 2,
    functionCode: 3,
    startAddress: 40001,
    quantity: 1,
    rawFrame: "02 03 9C 41 00 01",
    elapsedMs: 800,
  });
  center.recordFrame({
    direction: "request",
    protocol: "RTU",
    channel: "rtu://COM3",
    rawFrame: "02 03 9C 41 00 01 00 00",
  });
  center.recordFrame({
    direction: "response",
    protocol: "TCP",
    channel: "tcp://127.0.0.1:1502",
    rawFrame: "00 02 00 00 00 03 01 83 02",
    elapsedMs: 9,
  });

  const stats = center.getStats();
  assert.equal(stats.totalRequests, 4);
  assert.equal(stats.successCount, 1);
  assert.equal(stats.failureCount, 3);
  assert.equal(stats.timeoutCount, 1);
  assert.equal(stats.crcErrorCount, 1);
  assert.equal(stats.exceptionResponseCount, 1);
  assert.equal(stats.averageResponseTimeMs, 10.5);
  assert.equal(stats.maxResponseTimeMs, 12);
  assert.equal(stats.slowestDevice?.unitId, 1);
  assert.equal(stats.mostFailureAddressRange?.range, "40000-40099");
  assert.ok(stats.recentFiveMinuteSuccessRate.length > 0);

  const filtered = center.filterFrames({ unitId: 1, functionCode: 3, addressFrom: 14000, addressTo: 14010 });
  assert.equal(filtered.length, 2);

  const session = center.saveSession({
    connectionConfig: "TCP 127.0.0.1:1502 / RTU COM3 9600 8N1",
    project: "EVE储能项目",
    protocolVersion: "PCS Modbus V3.13 / BMS V1.06",
    endTime: baseTime + 60_000,
  });
  assert.equal(session.frameCount, 5);
  assert.equal(session.exceptionCount, 3);
  assert.match(createDiagnosticSummary(session, stats), /成功率 25.0%/);
});

test("exports frames and replays selected history frames to a simulator with mutations", async () => {
  const frame: DiagnosticFrameRecord = {
    id: "frame-1",
    requestId: "frame-1",
    timestamp: baseTime,
    time: "2026-05-24 00:00:00.000",
    direction: "request",
    channel: "tcp://127.0.0.1:1502",
    protocol: "TCP",
    unitId: 1,
    functionCode: 6,
    startAddress: 40002,
    quantity: 1,
    elapsedMs: undefined,
    result: "pending",
    rawFrame: "00 03 00 00 00 06 01 06 9C 42 00 7B",
    description: "写单寄存器",
  };

  const replay = await replayFrameToSimulator(frame, {
    unitId: 7,
    address: 40003,
    dataHex: "00 2A",
    sender: async (rawFrame) => ({ ok: true, rawFrame, elapsedMs: 4 }),
  });

  assert.equal(replay.target, "simulator");
  assert.equal(replay.ok, true);
  assert.match(replay.rawFrame, /00 06 07 06 9C 43 00 2A/);

  const json = exportFramesAsJson([frame]);
  const csv = exportFramesAsCsv([frame]);
  assert.match(json, /"rawFrame": "00 03/);
  assert.match(csv, /时间,方向,通道,协议,设备地址\/Unit ID,功能码,起始地址,数量,耗时,结果,异常码,原始报文,解析说明/);
});

function hex(value: string): Uint8Array {
  return new Uint8Array(value.trim().split(/\s+/).map((part) => Number.parseInt(part, 16)));
}
