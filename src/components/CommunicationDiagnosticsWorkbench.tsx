import { useMemo, useState } from "react";
import {
  Activity,
  Download,
  FileJson,
  Save,
} from "lucide-react";
import type { AppSnapshot } from "../types";
import {
  createDiagnosticSummary,
  type DiagnosticFrameRecord,
  type DiagnosticSession,
  type DiagnosticStats,
} from "../communication/diagnostics";
import {
  DiagnosisPanel,
  formatStatsSuccessRate,
  ProfileFact,
  ReplayPanel,
  SessionsPanel,
  StatsPanel,
} from "./communication/CommunicationDiagnosticsPanels";
import { FrameFilterPanel } from "./communication/FrameFilterPanel";
import { RealtimeFramesPanel } from "./communication/RealtimeFramesPanel";
import { createSeedDiagnostics } from "./communication/seedDiagnostics";
import {
  downloadCsv,
  downloadJson,
  useFrameFilters,
  useReplayState,
  type FrameFilterState,
  type ReplayState,
} from "./communication/communicationDiagnosticsState";

type CommunicationTab = "实时报文" | "通信统计" | "异常诊断" | "报文回放" | "会话记录";

const tabs: CommunicationTab[] = ["实时报文", "通信统计", "异常诊断", "报文回放", "会话记录"];

export function CommunicationDiagnosticsWorkbench({ snapshot }: { snapshot: AppSnapshot }) {
  const [activeTab, setActiveTab] = useState<CommunicationTab>("实时报文");
  const seed = useMemo(() => createSeedDiagnostics(snapshot), [snapshot]);
  const allFrames = seed.session.frames;
  const frameState = useFrameFilters(allFrames);
  const replayableFrames = frameState.filteredFrameRecords.filter((frame) => frame.direction === "request");
  const replayState = useReplayState(allFrames, replayableFrames);
  const [sessions, setSessions] = useState<DiagnosticSession[]>([seed.session]);
  const diagnosticSummary = createDiagnosticSummary(seed.session, seed.stats);

  function saveCurrentSession() {
    setSessions((current) => [{ ...seed.session, id: `diagnostic-session-${Date.now()}`, endTime: Date.now() }, ...current]);
  }

  return (
    <section className="communication-diagnostics protocol-lab" aria-label="通信诊断与报文回放中心">
      <CommunicationHeader
        onDownloadCsv={() => downloadCsv(frameState.filteredFrameRecords)}
        onDownloadJson={() => downloadJson(frameState.filteredFrameRecords)}
        onSaveSession={saveCurrentSession}
        onShowFrames={() => setActiveTab("实时报文")}
      />
      <SummaryStrip diagnosticSummary={diagnosticSummary} stats={seed.stats} />
      <TabStrip activeTab={activeTab} onTabChange={setActiveTab} />
      <FrameFilterPanel
        filters={frameState.filters}
        visibleCount={frameState.filteredFrames.length}
        totalCount={allFrames.length}
        summary={frameState.operationSummary}
        onFilterChange={frameState.updateFilter}
        onClearFilters={frameState.clearFilters}
      />
      <ActiveCommunicationPanel
        activeTab={activeTab}
        allFrames={allFrames}
        diagnosticSummary={diagnosticSummary}
        frameState={frameState}
        replayState={replayState}
        replayableFrames={replayableFrames}
        sessions={sessions}
        stats={seed.stats}
      />
    </section>
  );
}

function CommunicationHeader(props: CommunicationHeaderProps) {
  const { onDownloadCsv, onDownloadJson, onSaveSession, onShowFrames } = props;
  return (
    <header className="communication-hero protocol-hero glass-panel">
      <div>
        <span className="eyebrow">Communication Diagnostics</span>
        <h1>通信诊断与报文回放中心</h1>
        <p>记录 Modbus RTU/TCP 主站请求/响应，解析 MBAP、校验 RTU CRC，并把统计、异常定位、历史回放和会话归档放在一个工作台。</p>
      </div>
      <div className="hero-actions">
        <button className="lab-button primary" type="button" onClick={onShowFrames}><Activity size={17} />查看实时报文</button>
        <button className="lab-button" type="button" onClick={onSaveSession}><Save size={17} />保存通信会话</button>
        <button className="lab-button" type="button" aria-label="导出 JSON" onClick={onDownloadJson}><FileJson size={17} />导出为 JSON</button>
        <button className="lab-button" type="button" aria-label="导出 CSV" onClick={onDownloadCsv}><Download size={17} />导出为 CSV</button>
      </div>
    </header>
  );
}

function SummaryStrip({ diagnosticSummary, stats }: SummaryStripProps) {
  return (
    <section className="communication-summary-strip current-profile-strip glass-panel">
      <ProfileFact label="成功率" value={`${formatStatsSuccessRate(stats)}%`} tone={stats.failureCount > 0 ? "warning" : "valid"} />
      <ProfileFact label="总请求数" value={String(stats.totalRequests)} />
      <ProfileFact label="超时 / CRC / 异常" value={`${stats.timeoutCount} / ${stats.crcErrorCount} / ${stats.exceptionResponseCount}`} tone="warning" />
      <ProfileFact label="平均响应时间" value={`${stats.averageResponseTimeMs} ms`} />
      <ProfileFact label="诊断摘要" value={diagnosticSummary} />
    </section>
  );
}

function TabStrip({ activeTab, onTabChange }: TabStripProps) {
  return (
    <section className="communication-tabs glass-panel" aria-label="通信诊断标签页">
      {tabs.map((tab) => <button className={activeTab === tab ? "comm-tab active" : "comm-tab"} type="button" onClick={() => onTabChange(tab)} key={tab}>{tab}</button>)}
    </section>
  );
}

function ActiveCommunicationPanel(props: ActiveCommunicationPanelProps) {
  const { activeTab, allFrames, diagnosticSummary, frameState, replayState, replayableFrames, sessions, stats } = props;
  if (activeTab === "实时报文") return <RealtimeFramesPanel frames={frameState.filteredFrames} totalCount={allFrames.length} summary={frameState.operationSummary} />;
  if (activeTab === "通信统计") return <StatsPanel stats={stats} />;
  if (activeTab === "异常诊断") return <DiagnosisPanel frames={frameState.filteredFrameRecords} />;
  if (activeTab === "会话记录") return <SessionsPanel sessions={sessions} stats={stats} summary={diagnosticSummary} />;
  return (
    <ReplayPanel
      frames={replayableFrames.length ? replayableFrames : allFrames}
      replay={replayState.replay}
      selectedFrame={replayState.selectedFrame}
      receipt={replayState.receipt}
      onReplayChange={replayState.setReplay}
      onRunReplay={replayState.runReplay}
    />
  );
}

type CommunicationHeaderProps = {
  onDownloadCsv: () => void;
  onDownloadJson: () => void;
  onSaveSession: () => void;
  onShowFrames: () => void;
};

type SummaryStripProps = {
  diagnosticSummary: string;
  stats: DiagnosticStats;
};

type TabStripProps = {
  activeTab: CommunicationTab;
  onTabChange: (tab: CommunicationTab) => void;
};

type ActiveCommunicationPanelProps = {
  activeTab: CommunicationTab;
  allFrames: DiagnosticFrameRecord[];
  diagnosticSummary: string;
  frameState: FrameFilterState;
  replayState: ReplayState;
  replayableFrames: DiagnosticFrameRecord[];
  sessions: DiagnosticSession[];
  stats: DiagnosticStats;
};
