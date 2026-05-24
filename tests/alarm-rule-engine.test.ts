import assert from "node:assert/strict";
import test from "node:test";
import {
  acknowledgeAlarm,
  clearSuppression,
  createAlarmEngineState,
  defaultAlarmRules,
  evaluateAlarmSnapshot,
  exportAlarmHistoryCsv,
  filterAlarmEvents,
  getAlarmCenterSummary,
  getAlarmStats,
  maskAlarmRule,
  suppressAlarmRule,
  updateAlarmRuleEnabled,
  type AlarmInputPoint,
  type AlarmRule,
} from "../src/alarm/alarmRuleEngine";

const baseTime = Date.parse("2026-05-24T10:00:00.000Z");

function input(overrides: Partial<AlarmInputPoint> & Pick<AlarmInputPoint, "deviceType" | "deviceInstance" | "pointAddress" | "rawValue">): AlarmInputPoint {
  return {
    timestamp: baseTime,
    ...overrides,
  };
}

test("parses PCS/BMS/liquid-cooling/env/meter/transformer words into unified active alarm events", () => {
  let state = createAlarmEngineState(defaultAlarmRules, { now: () => baseTime });
  state = evaluateAlarmSnapshot(state, [
    input({ deviceType: "PCS", deviceInstance: "PCS3", pointAddress: 16021, rawValue: 0b1 }),
    input({ deviceType: "BMS", deviceInstance: "BMS-01", pointAddress: 33601, rawValue: 0b10 }),
    input({ deviceType: "液冷", deviceInstance: "LCS-01", pointAddress: 13134, rawValue: 0b1 }),
    input({ deviceType: "动环", deviceInstance: "ENV-01", pointAddress: 13201, rawValue: 0b100 }),
    input({ deviceType: "电表", deviceInstance: "METER-01", pointAddress: 13224, rawValue: 0b1 }),
    input({ deviceType: "箱变", deviceInstance: "TR-01", pointAddress: 13522, rawValue: 0b1 }),
  ]);

  assert.deepEqual(state.activeEvents.map((event) => [event.deviceType, event.deviceInstance, event.pointAddress, event.bitIndex, event.level, event.status, event.alarmName]), [
    ["PCS", "PCS3", 16021, 0, "严重故障", "active", "PCS 模块过温故障"],
    ["BMS", "BMS-01", 33601, 1, "一般告警", "active", "BMS 单体压差过大"],
    ["液冷", "LCS-01", 13134, 0, "一般告警", "active", "液冷机组通讯异常"],
    ["动环", "ENV-01", 13201, 2, "预警", "active", "动环烟感触发"],
    ["电表", "METER-01", 13224, 0, "提示", "active", "电表反向功率提示"],
    ["箱变", "TR-01", 13522, 0, "一般告警", "active", "箱变绕组温度高"],
  ]);

  const center = getAlarmCenterSummary(state);
  assert.deepEqual(center.currentCounts, { 严重故障: 1, 一般告警: 3, 预警: 1, 提示: 1 });
  assert.equal(center.recentAlarms.length, 5, "home center should expose recent 5 alarms");
  assert.equal(center.pcsModuleStates.PCS3, "故障", "PCS matrix should become red/fault by active PCS severe alarm");
});

test("acknowledges, recovers, masks, suppresses, disables rules, records history, stats, and csv export", () => {
  let state = createAlarmEngineState(defaultAlarmRules, { now: () => baseTime });
  state = evaluateAlarmSnapshot(state, [input({ deviceType: "PCS", deviceInstance: "PCS3", pointAddress: 16021, rawValue: 1 })]);
  const [event] = state.activeEvents;
  assert.ok(event);
  assert.equal(event.triggerTime, baseTime);
  assert.equal(event.rawValue, 1);
  assert.match(event.message, /PCS 模块过温故障/);

  state = acknowledgeAlarm(state, event.eventId, "admin", baseTime + 1000);
  assert.equal(state.activeEvents[0]?.status, "acknowledged");
  assert.equal(state.activeEvents[0]?.acknowledgeUser, "admin");
  assert.equal(state.activeEvents[0]?.acknowledgeTime, baseTime + 1000);
  assert.equal(state.historyEvents[0]?.status, "acknowledged", "acknowledge action should be written to history immediately");

  state = evaluateAlarmSnapshot(state, [input({ deviceType: "PCS", deviceInstance: "PCS3", pointAddress: 16021, rawValue: 0, timestamp: baseTime + 2000 })]);
  assert.equal(state.activeEvents.length, 0, "auto recovered alarm should leave current list");
  assert.equal(state.historyEvents[0]?.status, "recovered");
  assert.equal(state.historyEvents[0]?.acknowledgeUser, "admin");
  assert.equal(getAlarmCenterSummary(state).recentAlarms[0]?.status, "recovered", "home recent alarms should include recover history");

  state = maskAlarmRule(state, "pcs-module-overtemp", true, "maintenance");
  state = evaluateAlarmSnapshot(state, [input({ deviceType: "PCS", deviceInstance: "PCS3", pointAddress: 16021, rawValue: 1, timestamp: baseTime + 3000 })]);
  state = evaluateAlarmSnapshot(state, [input({ deviceType: "PCS", deviceInstance: "PCS3", pointAddress: 16021, rawValue: 1, timestamp: baseTime + 3500 })]);
  assert.equal(state.activeEvents.length, 0, "masked rule should not create active events");
  assert.equal(state.historyEvents.filter((item) => item.status === "masked" && item.ruleId === "pcs-module-overtemp" && item.deviceInstance === "PCS3").length, 1, "masked polling should not spam duplicate history events");

  state = maskAlarmRule(state, "pcs-module-overtemp", false, "maintenance");
  state = suppressAlarmRule(state, "pcs-module-overtemp", baseTime + 10_000, "startup suppression");
  state = evaluateAlarmSnapshot(state, [input({ deviceType: "PCS", deviceInstance: "PCS3", pointAddress: 16021, rawValue: 1, timestamp: baseTime + 4000 })]);
  state = evaluateAlarmSnapshot(state, [input({ deviceType: "PCS", deviceInstance: "PCS3", pointAddress: 16021, rawValue: 1, timestamp: baseTime + 4500 })]);
  assert.equal(state.activeEvents.length, 0, "suppressed rule should not create active events before expiry");
  assert.equal(state.historyEvents.filter((item) => item.status === "suppressed" && item.ruleId === "pcs-module-overtemp").length, 1, "suppressed polling should not spam duplicate history events");

  state = clearSuppression(state, "pcs-module-overtemp");
  state = updateAlarmRuleEnabled(state, "pcs-module-overtemp", false);
  state = evaluateAlarmSnapshot(state, [input({ deviceType: "PCS", deviceInstance: "PCS3", pointAddress: 16021, rawValue: 1, timestamp: baseTime + 11_000 })]);
  assert.equal(state.activeEvents.length, 0, "disabled rule should not create active events");

  state = updateAlarmRuleEnabled(state, "pcs-module-overtemp", true);
  state = evaluateAlarmSnapshot(state, [input({ deviceType: "PCS", deviceInstance: "PCS3", pointAddress: 16021, rawValue: 1, timestamp: baseTime + 12_000 })]);
  assert.equal(state.activeEvents.length, 1);

  const stats = getAlarmStats(state);
  assert.equal(stats.totalHistory, state.historyEvents.length);
  assert.ok(stats.byDeviceType.PCS >= 1);
  assert.ok(stats.byLevel["严重故障"] >= 1);
  assert.ok(stats.unacknowledgedActive >= 1);

  const csv = exportAlarmHistoryCsv(state.historyEvents);
  assert.match(csv, /event_id,rule_id,device_instance,level,status,alarm_name,trigger_time,recover_time,acknowledge_time,raw_value,message/);
  assert.match(csv, /pcs-module-overtemp/);
});

test("filters alarm events by level, status, device type and keyword", () => {
  let state = createAlarmEngineState(defaultAlarmRules, { now: () => baseTime });
  state = evaluateAlarmSnapshot(state, [
    input({ deviceType: "PCS", deviceInstance: "PCS3", pointAddress: 16021, rawValue: 1 }),
    input({ deviceType: "BMS", deviceInstance: "BMS-01", pointAddress: 33601, rawValue: 0b10 }),
    input({ deviceType: "液冷", deviceInstance: "LCS-01", pointAddress: 13134, rawValue: 1 }),
  ]);

  const filtered = filterAlarmEvents(state.activeEvents, {
    level: "一般告警",
    status: "active",
    deviceType: "BMS",
    keyword: "压差",
  });

  assert.deepEqual(filtered.map((event) => event.ruleId), ["bms-cell-delta-high"]);
});

test("honors delay and explicit recover condition before creating and recovering alarms", () => {
  const delayedRule: AlarmRule = {
    id: "env-door-open-delay",
    ruleId: "env-door-open-delay",
    deviceType: "动环",
    pointAddress: 13201,
    bitIndex: 3,
    level: "预警",
    alarmLevel: "预警",
    alarmName: "动环柜门长时间打开",
    triggerCondition: "bit_is_1",
    recoverCondition: "bit_is_0",
    delayMs: 5_000,
    autoRecover: true,
    enabled: true,
    description: "柜门 DI bit3 持续 5s 触发",
  };
  let state = createAlarmEngineState([delayedRule], { now: () => baseTime });

  state = evaluateAlarmSnapshot(state, [input({ deviceType: "动环", deviceInstance: "ENV-01", pointAddress: 13201, rawValue: 0b1000, timestamp: baseTime })]);
  assert.equal(state.activeEvents.length, 0, "delay should suppress immediate event creation");

  state = evaluateAlarmSnapshot(state, [input({ deviceType: "动环", deviceInstance: "ENV-01", pointAddress: 13201, rawValue: 0b1000, timestamp: baseTime + 4_999 })]);
  assert.equal(state.activeEvents.length, 0, "event should not be active before delay elapses");

  state = evaluateAlarmSnapshot(state, [input({ deviceType: "动环", deviceInstance: "ENV-01", pointAddress: 13201, rawValue: 0b1000, timestamp: baseTime + 5_000 })]);
  assert.equal(state.activeEvents.length, 1, "event should become active after the configured delay");
  assert.equal(state.activeEvents[0]?.triggerTime, baseTime + 5_000);

  state = evaluateAlarmSnapshot(state, [input({ deviceType: "动环", deviceInstance: "ENV-01", pointAddress: 13201, rawValue: 0b1000, timestamp: baseTime + 6_000 })]);
  assert.equal(state.activeEvents.length, 1, "matching trigger condition should not recover the event");

  state = evaluateAlarmSnapshot(state, [input({ deviceType: "动环", deviceInstance: "ENV-01", pointAddress: 13201, rawValue: 0, timestamp: baseTime + 7_000 })]);
  assert.equal(state.activeEvents.length, 0, "explicit recover condition should recover the event");
  assert.equal(state.historyEvents[0]?.recoverTime, baseTime + 7_000);
});
