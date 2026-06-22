import assert from "node:assert/strict";
import test from "node:test";
import { mergeSimulatorStatusFrameLogs } from "../src/simulator/backendFrameLogs";
import { groupGlobalFrameLogViews, resolveGlobalFrameLogSnapshot } from "../src/simulator/globalFrameLogView";
import type { FrameLog } from "../src/simulator/simulatorEngine";
import type { SimulatorServerFrameLog } from "../src/simulator/workspace";

test("merges native simulator request/response frames into global frame logs without duplicates", () => {
  const listenLog: FrameLog = {
    direction: "request",
    time: "10:00:00",
    frame: "LISTEN TCP 0.0.0.0:502 UNIT 1",
    note: "当前模拟设备：EVE_PCSmodbus通信协议V3.13 (BMS_V1.06)",
  };
  const backendFrames: SimulatorServerFrameLog[] = [
    {
      sequence: 1,
      timestamp: Date.parse("2026-05-24T10:00:01.000Z"),
      direction: "request",
      frame: "00 01 00 00 00 06 01 03 36 B1 00 01",
      note: "peer=127.0.0.1 FC03 读寄存器 address=14001 quantity=1",
    },
    {
      sequence: 2,
      timestamp: Date.parse("2026-05-24T10:00:01.012Z"),
      direction: "response",
      frame: "00 01 00 00 00 05 01 03 02 00 0C",
      note: "peer=127.0.0.1 FC03 响应 1 个寄存器",
    },
  ];

  const merged = mergeSimulatorStatusFrameLogs([listenLog], backendFrames);
  assert.equal(merged[0].frame, backendFrames[1].frame);
  assert.equal(merged[1].frame, backendFrames[0].frame);
  assert.ok(merged.some((entry) => entry.frame.startsWith("LISTEN TCP")));
  assert.equal(merged.filter((entry) => entry.frame === backendFrames[0].frame).length, 1);

  const refreshed = mergeSimulatorStatusFrameLogs(merged, backendFrames);
  assert.equal(refreshed.filter((entry) => entry.frame === backendFrames[0].frame).length, 1);
  assert.equal(refreshed.filter((entry) => entry.frame === backendFrames[1].frame).length, 1);
});

test("groups titlebar global frame logs into read and write streams with search", () => {
  const logs: FrameLog[] = [
    frameLog("request", "00 03 00 00 00 0B 01 10 36 D5 00 02 04 00 01 00 02", "Unit=1 FC10/FC16 写多个寄存器 address=14037 quantity=2"),
    frameLog("request", "00 02 00 00 00 06 01 06 36 B6 3A 98", "Unit=1 FC06 写单寄存器 address=14006 raw=15000"),
    frameLog("response", "00 01 00 00 00 07 01 03 04 00 00 00 00", "Unit=1 FC03 响应 2 个寄存器"),
    frameLog("request", "LISTEN TCP 0.0.0.0:502 UNIT 1", "当前模拟设备"),
  ];

  const grouped = groupGlobalFrameLogViews(logs);
  assert.equal(grouped.summary.read, 1);
  assert.equal(grouped.summary.write, 2);
  assert.equal(grouped.summary.other, 1);
  assert.deepEqual(grouped.write.map((entry) => entry.operationLabel), ["写入报文", "写入报文"]);

  const searched = groupGlobalFrameLogViews(logs, "FC10/FC16");
  assert.equal(searched.summary.total, 1);
  assert.equal(searched.write[0]?.frame, logs[0].frame);
});

test("keeps a frozen global frame snapshot while live logs continue changing", () => {
  const frozenLogs = [frameLog("request", "00 01 00 00 00 06 01 03 36 B1 00 02", "Unit=1 FC03 读取寄存器")];
  const liveLogs = [
    frameLog("request", "00 02 00 00 00 06 01 06 36 B6 00 01", "Unit=1 FC06 写单寄存器"),
    ...frozenLogs,
  ];

  assert.deepEqual(resolveGlobalFrameLogSnapshot({ frozen: true, frozenLogs, liveLogs }), frozenLogs);
  assert.deepEqual(resolveGlobalFrameLogSnapshot({ frozen: false, frozenLogs, liveLogs }), liveLogs);
});

function frameLog(direction: FrameLog["direction"], frame: string, note: string): FrameLog {
  return { direction, frame, note, time: "10:00:00" };
}
