import { useMemo, useState } from "react";
import {
  acknowledgeAlarm,
  clearSuppression,
  exportAlarmHistoryCsv,
  filterAlarmEvents,
  getAlarmStats,
  maskAlarmRule,
  suppressAlarmRule,
  updateAlarmRuleEnabled,
  type AlarmEngineState,
  type AlarmEvent,
  type AlarmEventFilter,
  type AlarmLevel,
  type AlarmRule,
  type AlarmStatus,
} from "../alarm/alarmRuleEngine";

type AlarmRuleEngineWorkbenchProps = {
  alarmState: AlarmEngineState;
  onAlarmStateChange: (state: AlarmEngineState) => void;
};

const tabs = ["当前告警", "历史告警", "告警规则", "告警统计"] as const;
type AlarmTab = (typeof tabs)[number];

export function AlarmRuleEngineWorkbench({ alarmState, onAlarmStateChange }: AlarmRuleEngineWorkbenchProps) {
  const [activeTab, setActiveTab] = useState<AlarmTab>("当前告警");
  const [filters, setFilters] = useState<AlarmEventFilter>({});
  const stats = useMemo(() => getAlarmStats(alarmState), [alarmState]);
  const csv = exportAlarmHistoryCsv(alarmState.historyEvents);

  function acknowledge(event: AlarmEvent) {
    onAlarmStateChange(acknowledgeAlarm(alarmState, event.eventId, "admin"));
  }

  function toggleMask(rule: AlarmRule) {
    onAlarmStateChange(maskAlarmRule(alarmState, rule.id, !rule.masked, "admin"));
  }

  function toggleSuppression(rule: AlarmRule) {
    if (rule.suppressedUntil && rule.suppressedUntil > Date.now()) {
      onAlarmStateChange(clearSuppression(alarmState, rule.id));
      return;
    }
    onAlarmStateChange(suppressAlarmRule(alarmState, rule.id, Date.now() + 10 * 60_000, "检修抑制"));
  }

  function toggleEnabled(rule: AlarmRule) {
    onAlarmStateChange(updateAlarmRuleEnabled(alarmState, rule.id, !rule.enabled));
  }

  return (
    <section className="alarm-workbench glass-panel" aria-label="故障/告警规则引擎">
      <header className="alarm-workbench-header">
        <div>
          <span className="eyebrow">Unified Alarm Engine</span>
          <h1>故障/告警规则引擎</h1>
          <p>把 PCS、BMS、液冷、动环、电表、箱变的故障字、状态字、DI 位统一解析成可确认、恢复、屏蔽、抑制、统计和导出的告警事件。</p>
        </div>
        <a className="lab-button" download="alarm-history.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}>导出</a>
      </header>

      <nav className="alarm-tabs" aria-label="告警页面 Tab">
        {tabs.map((tab) => <button className={tab === activeTab ? "active" : ""} key={tab} type="button" onClick={() => setActiveTab(tab)}>{tab}</button>)}
      </nav>

      {(activeTab === "当前告警" || activeTab === "历史告警") ? <AlarmFilters filters={filters} onFiltersChange={setFilters} /> : null}
      {activeTab === "当前告警" ? <AlarmTable events={alarmState.activeEvents} filters={filters} current onAcknowledge={acknowledge} /> : null}
      {activeTab === "历史告警" ? <AlarmTable events={alarmState.historyEvents} filters={filters} /> : null}
      {activeTab === "告警规则" ? <AlarmRulesTable rules={alarmState.rules} onToggleEnabled={toggleEnabled} onToggleMask={toggleMask} onToggleSuppression={toggleSuppression} /> : null}
      {activeTab === "告警统计" ? <AlarmStatsPanel stats={stats} /> : null}
    </section>
  );
}

function AlarmFilters({ filters, onFiltersChange }: { filters: AlarmEventFilter; onFiltersChange: (filters: AlarmEventFilter) => void }) {
  function patch(next: AlarmEventFilter) {
    onFiltersChange({ ...filters, ...next });
  }

  return (
    <div className="alarm-filter-bar" aria-label="告警筛选">
      <strong>筛选</strong>
      <label>等级
        <select value={filters.level ?? ""} onChange={(event) => patch({ level: (event.target.value || undefined) as AlarmLevel | undefined })}>
          <option value="">全部</option>
          <option value="严重故障">严重故障</option>
          <option value="一般告警">一般告警</option>
          <option value="预警">预警</option>
          <option value="提示">提示</option>
        </select>
      </label>
      <label>状态
        <select value={filters.status ?? ""} onChange={(event) => patch({ status: (event.target.value || undefined) as AlarmStatus | undefined })}>
          <option value="">全部</option>
          <option value="active">active</option>
          <option value="acknowledged">acknowledged</option>
          <option value="recovered">recovered</option>
          <option value="masked">masked</option>
          <option value="suppressed">suppressed</option>
        </select>
      </label>
      <label>设备类型
        <input value={filters.deviceType ?? ""} placeholder="PCS / BMS / 液冷" onChange={(event) => patch({ deviceType: event.target.value || undefined })} />
      </label>
      <label>关键字
        <input value={filters.keyword ?? ""} placeholder="告警名/设备" onChange={(event) => patch({ keyword: event.target.value || undefined })} />
      </label>
      <button type="button" onClick={() => onFiltersChange({})}>重置</button>
    </div>
  );
}

function AlarmTable({ events, filters, current = false, onAcknowledge }: { events: AlarmEvent[]; filters: AlarmEventFilter; current?: boolean; onAcknowledge?: (event: AlarmEvent) => void }) {
  const rows = filterAlarmEvents(events, filters);
  return (
    <div className="alarm-table-wrap">
      <table className="alarm-table">
        <thead><tr><th>时间</th><th>等级</th><th>设备</th><th>点位</th><th>bit</th><th>告警名称</th><th>状态</th><th>确认人</th><th>操作</th></tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={9}>暂无告警</td></tr> : rows.map((event) => (
            <tr key={event.eventId}>
              <td>{formatTime(event.startTime)}</td>
              <td>{event.level}</td>
              <td>{event.deviceInstance}</td>
              <td>{event.pointAddress}</td>
              <td>{event.bitIndex}</td>
              <td>{event.alarmName}</td>
              <td>{event.status}{event.recoverTime ? ` / 恢复 ${formatTime(event.recoverTime)}` : ""}</td>
              <td>{event.acknowledgeUser ?? "未确认"}</td>
              <td>{current ? <button type="button" onClick={() => onAcknowledge?.(event)}>确认</button> : <span>恢复</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AlarmRulesTable({ rules, onToggleEnabled, onToggleMask, onToggleSuppression }: { rules: AlarmRule[]; onToggleEnabled: (rule: AlarmRule) => void; onToggleMask: (rule: AlarmRule) => void; onToggleSuppression: (rule: AlarmRule) => void }) {
  return (
    <div className="alarm-table-wrap">
      <table className="alarm-table">
        <thead><tr><th>规则 ID</th><th>设备类型</th><th>点位</th><th>bit</th><th>告警名称</th><th>等级</th><th>启用</th><th>屏蔽</th><th>抑制</th></tr></thead>
        <tbody>{rules.map((rule) => (
          <tr key={rule.id}>
            <td>{rule.id}</td><td>{rule.deviceType}</td><td>{rule.pointAddress}</td><td>{rule.bitIndex}</td><td>{rule.alarmName}</td><td>{rule.alarmLevel ?? rule.level}</td>
            <td><button type="button" onClick={() => onToggleEnabled(rule)}>{rule.enabled ? "禁用" : "启用"}</button></td>
            <td><button type="button" onClick={() => onToggleMask(rule)}>{rule.masked ? "取消屏蔽" : "屏蔽"}</button></td>
            <td><button type="button" onClick={() => onToggleSuppression(rule)}>{rule.suppressedUntil && rule.suppressedUntil > Date.now() ? "取消抑制" : "抑制"}</button></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function AlarmStatsPanel({ stats }: { stats: ReturnType<typeof getAlarmStats> }) {
  return (
    <div className="alarm-stat-grid">
      <article><span>当前告警</span><strong>{stats.unacknowledgedActive}</strong></article>
      <article><span>历史记录</span><strong>{stats.totalHistory}</strong></article>
      {Object.entries(stats.byLevel).map(([level, count]) => <article key={level}><span>{level}</span><strong>{count}</strong></article>)}
      {Object.entries(stats.byDeviceType).map(([deviceType, count]) => <article key={deviceType}><span>{deviceType}</span><strong>{count}</strong></article>)}
    </div>
  );
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString("zh-CN", { hour12: false });
}
