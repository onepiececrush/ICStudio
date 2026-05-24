export type AlarmLevel = "严重故障" | "一般告警" | "预警" | "提示";
export type AlarmStatus = "active" | "acknowledged" | "recovered" | "masked" | "suppressed";
export type AlarmInputPoint = { timestamp: number; deviceType: string; deviceInstance: string; pointAddress: number; rawValue: number };
export type AlarmRule = { id: string; ruleId?: string; deviceType: string; pointAddress: number; bitIndex: number; level: AlarmLevel; alarmLevel?: AlarmLevel; alarmName: string; triggerCondition?: "bit_is_1" | "bit_is_0"; recoverCondition?: "bit_is_0" | "bit_is_1"; delayMs?: number; autoRecover?: boolean; enabled: boolean; description?: string; masked?: boolean; suppressedUntil?: number; suppressionReason?: string };
export type AlarmEvent = { eventId: string; ruleId: string; deviceType: string; deviceInstance: string; pointAddress: number; bitIndex: number; level: AlarmLevel; alarmName: string; message: string; rawValue: number; status: AlarmStatus; startTime: number; triggerTime: number; updateTime: number; recoverTime?: number; acknowledgeUser?: string; acknowledgeTime?: number; maskUser?: string; detail?: string };
export type AlarmEventFilter = { level?: AlarmLevel; status?: AlarmStatus; deviceType?: string; keyword?: string };
export type AlarmEngineState = { rules: AlarmRule[]; activeEvents: AlarmEvent[]; historyEvents: AlarmEvent[]; now: () => number; pendingTriggers: Record<string, number> };

export const defaultAlarmRules: AlarmRule[] = [
  { id: "pcs-module-overtemp", ruleId: "pcs-module-overtemp", deviceType: "PCS", pointAddress: 16021, bitIndex: 0, level: "严重故障", alarmLevel: "严重故障", alarmName: "PCS 模块过温故障", triggerCondition: "bit_is_1", recoverCondition: "bit_is_0", delayMs: 0, autoRecover: true, enabled: true, description: "PCS 故障字 bit0" },
  { id: "bms-cell-delta-high", ruleId: "bms-cell-delta-high", deviceType: "BMS", pointAddress: 33601, bitIndex: 1, level: "一般告警", alarmLevel: "一般告警", alarmName: "BMS 单体压差过大", triggerCondition: "bit_is_1", recoverCondition: "bit_is_0", delayMs: 0, autoRecover: true, enabled: true, description: "BMS 故障字 bit1" },
  { id: "liquid-comm-abnormal", ruleId: "liquid-comm-abnormal", deviceType: "液冷", pointAddress: 13134, bitIndex: 0, level: "一般告警", alarmLevel: "一般告警", alarmName: "液冷机组通讯异常", triggerCondition: "bit_is_1", recoverCondition: "bit_is_0", delayMs: 0, autoRecover: true, enabled: true, description: "液冷故障字 bit0" },
  { id: "env-smoke", ruleId: "env-smoke", deviceType: "动环", pointAddress: 13201, bitIndex: 2, level: "预警", alarmLevel: "预警", alarmName: "动环烟感触发", triggerCondition: "bit_is_1", recoverCondition: "bit_is_0", delayMs: 0, autoRecover: true, enabled: true, description: "动环 DI bit2" },
  { id: "meter-reverse-power", ruleId: "meter-reverse-power", deviceType: "电表", pointAddress: 13224, bitIndex: 0, level: "提示", alarmLevel: "提示", alarmName: "电表反向功率提示", triggerCondition: "bit_is_1", recoverCondition: "bit_is_0", delayMs: 0, autoRecover: true, enabled: true, description: "电表状态 bit0" },
  { id: "transformer-winding-hot", ruleId: "transformer-winding-hot", deviceType: "箱变", pointAddress: 13522, bitIndex: 0, level: "一般告警", alarmLevel: "一般告警", alarmName: "箱变绕组温度高", triggerCondition: "bit_is_1", recoverCondition: "bit_is_0", delayMs: 0, autoRecover: true, enabled: true, description: "箱变状态 bit0" },
];

export function createAlarmEngineState(rules = defaultAlarmRules, options: { now?: () => number } = {}): AlarmEngineState {
  return { rules: rules.map((r) => ({ ...r })), activeEvents: [], historyEvents: [], pendingTriggers: {}, now: options.now ?? Date.now };
}

export function evaluateAlarmSnapshot(state: AlarmEngineState, inputs: AlarmInputPoint[]): AlarmEngineState {
  const next: AlarmEngineState = cloneState(state);
  for (const input of inputs) {
    for (const rule of next.rules.filter((r) => r.deviceType === input.deviceType && r.pointAddress === input.pointAddress)) {
      const key = eventKey(rule, input.deviceInstance);
      const existing = next.activeEvents.find((event) => eventKey(event, event.deviceInstance) === key);
      const triggerActive = conditionMatches(rule.triggerCondition ?? "bit_is_1", input.rawValue, rule.bitIndex);
      const recoverActive = conditionMatches(rule.recoverCondition ?? oppositeCondition(rule.triggerCondition ?? "bit_is_1"), input.rawValue, rule.bitIndex);

      if (!triggerActive) {
        delete next.pendingTriggers[key];
        if (existing && (rule.autoRecover ?? true) && recoverActive) {
          const recovered = { ...existing, status: "recovered" as const, recoverTime: input.timestamp, updateTime: input.timestamp, rawValue: input.rawValue, message: `已恢复：${existing.message}` };
          next.activeEvents = next.activeEvents.filter((event) => event.eventId !== existing.eventId);
          next.historyEvents = [recovered, ...next.historyEvents];
        }
        continue;
      }

      if (!rule.enabled) { delete next.pendingTriggers[key]; continue; }
      if (rule.masked) { delete next.pendingTriggers[key]; recordNonActiveEventOnce(next, rule, input, "masked"); continue; }
      if (rule.suppressedUntil && input.timestamp < rule.suppressedUntil) { delete next.pendingTriggers[key]; recordNonActiveEventOnce(next, rule, input, "suppressed", rule.suppressionReason); continue; }

      if (existing) {
        existing.updateTime = input.timestamp;
        existing.rawValue = input.rawValue;
        continue;
      }

      const firstTriggerTime = next.pendingTriggers[key] ?? input.timestamp;
      next.pendingTriggers[key] = firstTriggerTime;
      const delayMs = rule.delayMs ?? 0;
      if (delayMs > 0 && input.timestamp - firstTriggerTime < delayMs) continue;

      delete next.pendingTriggers[key];
      next.activeEvents = [...next.activeEvents, makeEvent(rule, input, "active")];
    }
  }
  return next;
}

export function acknowledgeAlarm(state: AlarmEngineState, eventId: string, user: string, timestamp = state.now()): AlarmEngineState {
  const next = cloneState(state);
  let acknowledged: AlarmEvent | undefined;
  next.activeEvents = next.activeEvents.map((event) => {
    if (event.eventId !== eventId) return event;
    acknowledged = { ...event, status: "acknowledged", acknowledgeUser: user, acknowledgeTime: timestamp, updateTime: timestamp, message: `已确认：${event.message}` };
    return acknowledged;
  });
  if (acknowledged && !next.historyEvents.some((event) => event.eventId === eventId && event.status === "acknowledged")) {
    next.historyEvents = [acknowledged, ...next.historyEvents];
  }
  return next;
}

export function maskAlarmRule(state: AlarmEngineState, ruleId: string, masked: boolean, user: string): AlarmEngineState {
  const next = cloneState(state);
  next.rules = next.rules.map((rule) => rule.id === ruleId || rule.ruleId === ruleId ? { ...rule, masked } : rule);
  if (masked) {
    const timestamp = next.now();
    next.historyEvents = [{ eventId: `mask-${ruleId}-${timestamp}`, ruleId, deviceType: "系统", deviceInstance: "alarm-engine", pointAddress: 0, bitIndex: 0, level: "提示", alarmName: "规则屏蔽", message: `${ruleId} 已屏蔽`, rawValue: 0, status: "masked", startTime: timestamp, triggerTime: timestamp, updateTime: timestamp, maskUser: user }, ...next.historyEvents];
  }
  return next;
}

export function suppressAlarmRule(state: AlarmEngineState, ruleId: string, until: number, reason: string): AlarmEngineState {
  const next = cloneState(state);
  next.rules = next.rules.map((rule) => rule.id === ruleId || rule.ruleId === ruleId ? { ...rule, suppressedUntil: until, suppressionReason: reason } : rule);
  return next;
}

export function clearSuppression(state: AlarmEngineState, ruleId: string): AlarmEngineState {
  const next = cloneState(state);
  next.rules = next.rules.map((rule) => rule.id === ruleId || rule.ruleId === ruleId ? { ...rule, suppressedUntil: undefined, suppressionReason: undefined } : rule);
  return next;
}

export function updateAlarmRuleEnabled(state: AlarmEngineState, ruleId: string, enabled: boolean): AlarmEngineState {
  const next = cloneState(state);
  next.rules = next.rules.map((rule) => rule.id === ruleId || rule.ruleId === ruleId ? { ...rule, enabled } : rule);
  return next;
}

export function getAlarmCenterSummary(state: AlarmEngineState) {
  const currentCounts = { 严重故障: 0, 一般告警: 0, 预警: 0, 提示: 0 } as Record<AlarmLevel, number>;
  for (const event of state.activeEvents) currentCounts[event.level] += 1;
  const pcsModuleStates: Record<string, string> = {};
  for (const event of state.activeEvents.filter((e) => e.deviceType === "PCS" && e.level === "严重故障")) pcsModuleStates[event.deviceInstance] = "故障";
  const recentAlarms = [...state.activeEvents, ...state.historyEvents].sort((left, right) => right.updateTime - left.updateTime).slice(0, 5);
  return { currentCounts, recentAlarms, pcsModuleStates };
}

export function filterAlarmEvents(events: AlarmEvent[], filter: AlarmEventFilter = {}): AlarmEvent[] {
  return [...events]
    .filter((event) => !filter.level || event.level === filter.level)
    .filter((event) => !filter.status || event.status === filter.status)
    .filter((event) => !filter.deviceType || event.deviceType === filter.deviceType)
    .filter((event) => !filter.keyword || [event.alarmName, event.message, event.deviceInstance, event.detail ?? ""].some((text) => text.includes(filter.keyword!)))
    .sort((left, right) => right.updateTime - left.updateTime);
}

export function getAlarmStats(state: AlarmEngineState) {
  const all = [...state.historyEvents, ...state.activeEvents];
  return {
    totalHistory: state.historyEvents.length,
    byDeviceType: countBy(all, (e) => e.deviceType),
    byLevel: countBy(all, (e) => e.level),
    unacknowledgedActive: state.activeEvents.filter((e) => e.status === "active").length,
  };
}

export function exportAlarmHistoryCsv(events: AlarmEvent[]) {
  const header = "event_id,rule_id,device_instance,level,status,alarm_name,trigger_time,recover_time,acknowledge_time,raw_value,message,update_time";
  return [header, ...events.map((e) => [e.eventId, e.ruleId, e.deviceInstance, e.level, e.status, e.alarmName, e.triggerTime, e.recoverTime ?? "", e.acknowledgeTime ?? "", e.rawValue, e.message, e.updateTime].map(csvCell).join(","))].join("\n");
}

function makeEvent(rule: AlarmRule, input: AlarmInputPoint, status: AlarmStatus, detail?: string): AlarmEvent {
  const ruleId = rule.ruleId ?? rule.id;
  const level = rule.alarmLevel ?? rule.level;
  const message = `${input.deviceInstance} ${rule.alarmName}`;
  return { eventId: `${ruleId}-${input.deviceInstance}-${input.timestamp}`, ruleId, deviceType: input.deviceType, deviceInstance: input.deviceInstance, pointAddress: input.pointAddress, bitIndex: rule.bitIndex, level, alarmName: rule.alarmName, message, rawValue: input.rawValue, status, startTime: input.timestamp, triggerTime: input.timestamp, updateTime: input.timestamp, detail };
}
function conditionMatches(condition: "bit_is_1" | "bit_is_0", rawValue: number, bitIndex: number) { const bitSet = ((rawValue >> bitIndex) & 1) === 1; return condition === "bit_is_1" ? bitSet : !bitSet; }
function oppositeCondition(condition: "bit_is_1" | "bit_is_0") { return condition === "bit_is_1" ? "bit_is_0" : "bit_is_1"; }
function eventKey(rule: { id?: string; ruleId?: string }, deviceInstance: string) { return `${rule.ruleId ?? rule.id}:${deviceInstance}`; }
function recordNonActiveEventOnce(state: AlarmEngineState, rule: AlarmRule, input: AlarmInputPoint, status: "masked" | "suppressed", detail?: string) {
  const ruleId = rule.ruleId ?? rule.id;
  const alreadyRecorded = state.historyEvents.some((event) => event.ruleId === ruleId && event.deviceInstance === input.deviceInstance && event.status === status && event.recoverTime === undefined);
  if (!alreadyRecorded) state.historyEvents = [makeEvent(rule, input, status, detail), ...state.historyEvents];
}
function cloneState(state: AlarmEngineState): AlarmEngineState { return { ...state, rules: state.rules.map((r) => ({ ...r })), activeEvents: state.activeEvents.map((e) => ({ ...e })), historyEvents: state.historyEvents.map((e) => ({ ...e })), pendingTriggers: { ...(state.pendingTriggers ?? {}) } }; }
function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function countBy<T>(items: T[], key: (item: T) => string) { const out: Record<string, number> = {}; for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1; return out; }
