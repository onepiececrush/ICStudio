import { Filter, Search } from "lucide-react";
import {
  diagnosticFrameOperationLabels,
  type DiagnosticFrameOperationFilter,
  type DiagnosticFrameOperationSummary,
} from "../../communication/frameView";
import type { FilterDraft } from "./communicationDiagnosticsState";

const operationTabs: Array<{ value: DiagnosticFrameOperationFilter; label: string }> = [
  { value: "all", label: "全部报文" },
  { value: "read", label: diagnosticFrameOperationLabels.read },
  { value: "write", label: diagnosticFrameOperationLabels.write },
  { value: "other", label: diagnosticFrameOperationLabels.other },
];

type FrameFilterPanelProps = {
  filters: FilterDraft;
  visibleCount: number;
  totalCount: number;
  summary: DiagnosticFrameOperationSummary;
  onFilterChange: <Key extends keyof FilterDraft>(key: Key, value: FilterDraft[Key]) => void;
  onClearFilters: () => void;
};

export function FrameFilterPanel(props: FrameFilterPanelProps) {
  const { filters, visibleCount, totalCount, summary, onFilterChange, onClearFilters } = props;
  return (
    <section className="lab-card glass-panel">
      <div className="lab-section-title">
        <div>
          <span className="eyebrow"><Filter size={13} /> Frame Filters</span>
          <h2>报文搜索与读写筛选</h2>
          <p>当前显示 {visibleCount} / {totalCount} 帧；读取 {summary.read}，写入 {summary.write}，其他 {summary.other}。</p>
        </div>
        <button className="mini-button" type="button" onClick={onClearFilters}>清空筛选</button>
      </div>
      <div className="communication-filter-grid extended">
        <label>设备地址 / Unit ID<input inputMode="numeric" value={filters.unitId} onChange={(event) => onFilterChange("unitId", event.target.value)} placeholder="例如 1" /></label>
        <label>功能码<input inputMode="numeric" value={filters.functionCode} onChange={(event) => onFilterChange("functionCode", event.target.value)} placeholder="例如 3 或 6" /></label>
        <label>起始地址从<input inputMode="numeric" value={filters.addressFrom} onChange={(event) => onFilterChange("addressFrom", event.target.value)} placeholder="例如 14000" /></label>
        <label>起始地址到<input inputMode="numeric" value={filters.addressTo} onChange={(event) => onFilterChange("addressTo", event.target.value)} placeholder="例如 40099" /></label>
        <label className="wide"><span><Search size={13} /> 报文搜索</span><input value={filters.keyword} onChange={(event) => onFilterChange("keyword", event.target.value)} placeholder="原始报文 / active-power / 异常码" /></label>
      </div>
      <div className="communication-operation-tabs" aria-label="读写报文筛选">
        {operationTabs.map((tab) => (
          <button className={filters.operation === tab.value ? "mini-button active" : "mini-button"} type="button" onClick={() => onFilterChange("operation", tab.value)} key={tab.value}>
            {tab.label} · {operationCount(summary, tab.value)}
          </button>
        ))}
      </div>
    </section>
  );
}

function operationCount(summary: DiagnosticFrameOperationSummary, operation: DiagnosticFrameOperationFilter) {
  return operation === "all" ? summary.total : summary[operation];
}
