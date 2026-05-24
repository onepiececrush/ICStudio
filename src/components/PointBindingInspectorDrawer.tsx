import { AlertTriangle, CheckCircle2, Clock3, Database, FileText, GitBranch, RadioTower, X } from "lucide-react";
import { diagnosticLabels } from "../pointBinding/registry";
import type { BoundPointTrace, PointBindingTrace, PointDiagnostic } from "../pointBinding/registry";

export function PointBindingInspectorDrawer({
  trace,
  onClose,
}: {
  trace: PointBindingTrace | null;
  onClose: () => void;
}) {
  return (
    <aside
      className={trace ? "point-inspector-drawer open" : "point-inspector-drawer"}
      aria-label="点位详情"
      aria-hidden={!trace}
    >
      <header className="point-inspector-header">
        <div>
          <span className="eyebrow">Point Binding Inspector</span>
          <h2>点位详情</h2>
        </div>
        <button className="point-inspector-close" type="button" aria-label="关闭点位详情" onClick={onClose}>
          <X size={18} />
        </button>
      </header>

      {!trace ? <EmptyInspector /> : trace.kind === "unbound" ? <UnboundInspector trace={trace} /> : <BoundInspector trace={trace} />}
    </aside>
  );
}

function EmptyInspector() {
  return (
    <div className="point-inspector-empty">
      <GitBranch size={28} />
      <strong>点击页面任意带下划线的数据值</strong>
      <p>追踪器会展开该值绑定的设备、寄存器、原始值、工程值、报文和诊断信息。</p>
    </div>
  );
}

function UnboundInspector({ trace }: { trace: Extract<PointBindingTrace, { kind: "unbound" }> }) {
  return (
    <div className="point-inspector-content">
      <section className="point-section diagnostic-section">
        <SectionTitle icon={AlertTriangle} title="错误诊断" />
        <p className="unbound-target">{trace.displayName}</p>
        <DiagnosticsList diagnostics={trace.diagnostics} />
      </section>
    </div>
  );
}

function BoundInspector({ trace }: { trace: BoundPointTrace }) {
  return (
    <div className="point-inspector-content">
      <section className="point-summary-card">
        <div>
          <span>{trace.pageName}</span>
          <h3>{trace.displayName}</h3>
          <p>{trace.componentId}</p>
        </div>
        <strong className={`comm-badge ${trace.communicationStatus.includes("正常") ? "ok" : "warn"}`}>{trace.communicationStatus}</strong>
      </section>

      <section className="point-section">
        <SectionTitle icon={GitBranch} title="基本信息" />
        <KeyValueGrid rows={[
          ["页面组件 ID", trace.componentId],
          ["页面名称", trace.pageName],
          ["设备实例", trace.deviceInstance],
          ["协议版本", trace.protocolVersion],
        ]} />
      </section>

      <section className="point-section">
        <SectionTitle icon={Database} title="协议信息" />
        <KeyValueGrid rows={[
          ["寄存器地址", String(trace.registerAddress)],
          ["功能码", String(trace.functionCode)],
          ["数据类型", trace.dataType],
          ["字节序", trace.byteOrder],
          ["倍率", String(trace.scale)],
          ["偏移", String(trace.offset)],
          ["单位", trace.unit || "无"],
        ]} />
      </section>

      <section className="point-section current-value-section">
        <SectionTitle icon={RadioTower} title="当前值" />
        <KeyValueGrid rows={[
          ["原始寄存器值", trace.rawRegisterValue],
          ["解码后的工程值", trace.engineeringValue],
          ["页面格式化显示值", trace.formattedValue],
          ["最后更新时间", trace.lastUpdateTime],
          ["通信状态", trace.communicationStatus],
        ]} />
        {trace.simulatorExpectation ? (
          <div className={`simulator-compare ${trace.simulatorExpectation.status}`}>
            <span>自测模式模拟器期望值</span>
            <strong>{trace.simulatorExpectation.expectedEngineeringValue}</strong>
            <small>实际 {trace.simulatorExpectation.actualEngineeringValue} · 偏差 {trace.simulatorExpectation.delta}</small>
          </div>
        ) : null}
      </section>

      <section className="point-section frame-section">
        <SectionTitle icon={FileText} title="报文来源" />
        <FrameBlock label="最后一次请求报文" frame={trace.lastRequestFrame} />
        <FrameBlock label="最后一次响应报文" frame={trace.lastResponseFrame} />
        <KeyValueGrid rows={[["通信耗时", `${trace.latencyMs} ms`]]} />
      </section>

      <section className="point-section">
        <SectionTitle icon={Clock3} title="最近变化" />
        <div className="change-list">
          {trace.recentChanges.map((change) => (
            <article key={`${change.time}-${change.rawRegisterValue}-${change.note}`}>
              <time>{change.time}</time>
              <strong>{change.formattedValue}</strong>
              <span>Raw {change.rawRegisterValue} → Eng {change.engineeringValue}</span>
              <small>{change.note}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="point-section diagnostic-section">
        <SectionTitle icon={AlertTriangle} title="错误诊断" />
        <DiagnosticsList diagnostics={trace.diagnostics} />
      </section>
    </div>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: typeof GitBranch; title: string }) {
  return (
    <div className="point-section-title">
      <Icon size={16} />
      <h3>{title}</h3>
    </div>
  );
}

function KeyValueGrid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="point-kv-grid">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function FrameBlock({ label, frame }: { label: string; frame: string }) {
  return (
    <div className="frame-block">
      <span>{label}</span>
      <code>{frame}</code>
    </div>
  );
}

function DiagnosticsList({ diagnostics }: { diagnostics: PointDiagnostic[] }) {
  return (
    <div className="diagnostics-list">
      {diagnostics.map((item) => {
        const Icon = item.severity === "info" ? CheckCircle2 : AlertTriangle;
        return (
          <article className={`diagnostic-item severity-${item.severity}`} key={`${item.code}-${item.message}`}>
            <Icon size={15} />
            <div>
              <strong>{diagnosticLabels[item.code]} · {item.code}</strong>
              <p>{item.message}</p>
            </div>
          </article>
        );
      })}
    </div>
  );
}
