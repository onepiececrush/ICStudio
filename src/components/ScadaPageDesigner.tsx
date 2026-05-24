import { useMemo, useState, type CSSProperties, type DragEvent } from "react";
import type { AppSnapshot } from "../types";
import {
  scadaRealtimeSeedValues,
  scadaSeedDeviceInstances,
  scadaSeedDeviceTemplate,
  scadaSeedPointModels,
  scadaSeedProtocolModel,
} from "../data/scadaSeed";
import {
  bindScadaWidgetToPoint,
  createScadaRealtimeView,
  createScadaRealtimeValuesFromSnapshot,
  createScadaSelfTestValues,
  deserializeScadaPage,
  generateScadaWorkspaceFromPoints,
  serializeScadaPage,
  updateScadaWidgetLayout,
  type ScadaPageConfig,
  type ScadaWidget,
  type ScadaWidgetType,
} from "../scada/pageGenerator";

const componentLibrary: Array<{ type: ScadaWidgetType; label: string; hint: string }> = [
  { type: "card", label: "数字卡片", hint: "关键数值 / 单位 / 趋势" },
  { type: "table", label: "表格", hint: "批量点位实时表" },
  { type: "gauge", label: "仪表盘", hint: "上下限和指针" },
  { type: "status-light", label: "状态灯", hint: "枚举和颜色规则" },
  { type: "trend", label: "趋势图", hint: "实时通信曲线" },
  { type: "bar-chart", label: "柱状图", hint: "分组统计对比" },
  { type: "alarm-list", label: "告警列表", hint: "bit / 阈值告警" },
  { type: "device-node", label: "设备节点", hint: "设备拓扑节点" },
  { type: "energy-flow", label: "能量流线", hint: "流向动画线" },
  { type: "topology", label: "拓扑图", hint: "节点和连线画布" },
  { type: "button", label: "按钮", hint: "写点位动作" },
  { type: "input", label: "输入框", hint: "设定值绑定" },
];

export function ScadaPageDesigner({ snapshot }: { snapshot: AppSnapshot }) {
  const workspace = useMemo(
    () =>
      generateScadaWorkspaceFromPoints({
        protocolModel: scadaSeedProtocolModel,
        deviceTemplate: scadaSeedDeviceTemplate,
        pointModels: scadaSeedPointModels,
        deviceInstances: scadaSeedDeviceInstances,
        includeHomeSummary: true,
      }),
    [],
  );
  const [pages, setPages] = useState<ScadaPageConfig[]>(workspace.pages);
  const [activePageId, setActivePageId] = useState(workspace.pages[0]?.page_id ?? "");
  const [selectedWidgetId, setSelectedWidgetId] = useState(workspace.pages[0]?.widgets[0]?.id ?? "");
  const [selfTestMode, setSelfTestMode] = useState(true);
  const [savedJson, setSavedJson] = useState("");
  const [notice, setNotice] = useState("已从协议点位自动生成首页摘要页、PCS / BMS / 液冷 / 动环 / 电表 / 箱变页面。");

  const activePage = pages.find((page) => page.page_id === activePageId) ?? pages[0];
  const selectedWidget = activePage?.widgets.find((widget) => widget.id === selectedWidgetId);
  const selectedBinding = selectedWidget
    ? activePage?.bindings.find((binding) => binding.id === selectedWidget.bindingIds[0])
    : undefined;
  const realtimeValues = useMemo(
    () =>
      activePage && selfTestMode
        ? createScadaSelfTestValues(activePage, { tick: Date.now() / 1000, timestamp: new Date().toISOString() })
        : { ...scadaRealtimeSeedValues, ...(activePage ? createScadaRealtimeValuesFromSnapshot(activePage, snapshot) : {}) },
    [activePage, selfTestMode, snapshot],
  );
  const realtimeView = activePage ? createScadaRealtimeView(activePage, realtimeValues) : undefined;

  const replaceActivePage = (page: ScadaPageConfig) => {
    setPages((currentPages) => currentPages.map((item) => (item.page_id === page.page_id ? page : item)));
  };

  const handleWidgetDragStart = (event: DragEvent<HTMLElement>, widget: ScadaWidget) => {
    event.dataTransfer.setData("text/scada-widget-id", widget.id);
    event.dataTransfer.effectAllowed = "move";
    setSelectedWidgetId(widget.id);
  };

  const handleLibraryDragStart = (event: DragEvent<HTMLElement>, type: ScadaWidgetType) => {
    event.dataTransfer.setData("text/scada-component-type", type);
    event.dataTransfer.effectAllowed = "copy";
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (!activePage) return;
    const widgetId = event.dataTransfer.getData("text/scada-widget-id");
    const componentType = event.dataTransfer.getData("text/scada-component-type") as ScadaWidgetType;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(11, Math.floor(((event.clientX - rect.left) / rect.width) * activePage.layout.columns)));
    const y = Math.max(0, Math.floor((event.clientY - rect.top) / activePage.layout.rowHeight));

    if (widgetId) {
      const widget = activePage.widgets.find((item) => item.id === widgetId);
      if (!widget) return;
      replaceActivePage(updateScadaWidgetLayout(activePage, widgetId, { ...widget.layout, x, y }));
      setNotice(`已拖拽调整布局：${widget.title} → (${x}, ${y})`);
      return;
    }

    if (componentType) {
      const targetPoint = scadaSeedPointModels.find((pointModel) => pointModel.device_type === activePage.device_type) ?? scadaSeedPointModels[0];
      if (!targetPoint) return;
      const widget: ScadaWidget = {
        id: `widget-manual-${componentType}-${Date.now()}`,
        type: componentType,
        title: componentLibrary.find((item) => item.type === componentType)?.label ?? componentType,
        description: "从组件库拖拽新增，等待绑定点位。",
        layout: { x, y, w: 3, h: 2 },
        bindingIds: [],
        props: { manuallyAdded: true },
      };
      const nextPage = bindScadaWidgetToPoint(
        { ...activePage, widgets: [...activePage.widgets, widget] },
        widget.id,
        { point: targetPoint },
      );
      replaceActivePage(nextPage);
      setSelectedWidgetId(widget.id);
      setNotice(`已从组件库拖入 ${widget.title}，默认绑定 ${targetPoint.name}。`);
    }
  };

  const handleBindSelectedWidget = (pointId: string) => {
    if (!activePage || !selectedWidget) return;
    const pointModel = scadaSeedPointModels.find((point) => point.point_id === pointId);
    if (!pointModel) return;
    replaceActivePage(bindScadaWidgetToPoint(activePage, selectedWidget.id, { point: pointModel }));
    setNotice(`已绑定点位：${selectedWidget.title} → ${pointModel.name} (${pointModel.address})`);
  };

  const handleSavePage = () => {
    if (!activePage) return;
    setSavedJson(serializeScadaPage(activePage));
    setNotice(`保存配置完成：${activePage.page_name} 已序列化为 JSON。`);
  };

  const handleReopenSavedPage = () => {
    if (!savedJson) return;
    const reopened = deserializeScadaPage(savedJson);
    replaceActivePage(reopened);
    setActivePageId(reopened.page_id);
    setSelectedWidgetId(reopened.widgets[0]?.id ?? "");
    setNotice(`重新打开 ${reopened.page_name} 成功，组件和绑定已恢复。`);
  };

  if (!activePage || !realtimeView) {
    return <section className="scada-designer">没有可用的组态页面。</section>;
  }

  return (
    <section className="scada-designer">
      <header className="scada-hero">
        <div>
          <span className="eyebrow">SCADA PAGE GENERATOR</span>
          <h1>组态页面生成器</h1>
          <p>
            根据协议点位和设备模型自动生成实时监控页面：{snapshot.project.protocolVersion} · {workspace.protocol_name}
          </p>
        </div>
        <div className="scada-actions">
          <button className="lab-button primary" type="button" onClick={handleSavePage}>
            保存配置
          </button>
          <button className="lab-button" type="button" onClick={handleReopenSavedPage} disabled={!savedJson}>
            重新打开
          </button>
          <button className="lab-button" type="button" onClick={() => setSelfTestMode((enabled) => !enabled)}>
            {selfTestMode ? "自测模拟数据：开" : "自测模拟数据：关"}
          </button>
        </div>
      </header>

      <div className="scada-page-tabs" aria-label="自动生成页面">
        {pages.map((page) => (
          <button
            className={page.page_id === activePage.page_id ? "active" : ""}
            type="button"
            key={page.page_id}
            onClick={() => {
              setActivePageId(page.page_id);
              setSelectedWidgetId(page.widgets[0]?.id ?? "");
            }}
          >
            {page.page_name}
          </button>
        ))}
      </div>

      <div className="scada-workbench">
        <aside className="scada-component-library">
          <h2>组件库</h2>
          <p>拖拽卡片、表格、仪表盘、状态灯、趋势图、拓扑图等组件到画布。</p>
          <div className="scada-library-list">
            {componentLibrary.map((component) => (
              <article
                key={component.type}
                draggable
                onDragStart={(event) => handleLibraryDragStart(event, component.type)}
              >
                <strong>{component.label}</strong>
                <span>{component.type}</span>
                <small>{component.hint}</small>
              </article>
            ))}
          </div>
        </aside>

        <main className="scada-canvas-wrap">
          <div className="scada-canvas-toolbar">
            <div>
              <strong>{activePage.page_name}</strong>
              <span>{activePage.widgets.length} 个组件 · {activePage.bindings.length} 个绑定 · {realtimeView.selfTest ? "自测模式" : "实时通信"}</span>
            </div>
            <span className="scada-notice">{notice}</span>
          </div>
          <section
            className="scada-canvas"
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
            style={{ "--scada-row-height": `${activePage.layout.rowHeight}px` } as CSSProperties}
            aria-label="画布"
          >
            {realtimeView.widgets.map((widget) => (
              <article
                className={`scada-widget ${widget.type} ${widget.id === selectedWidgetId ? "selected" : ""}`}
                draggable
                onDragStart={(event) => handleWidgetDragStart(event, widget)}
                onClick={() => setSelectedWidgetId(widget.id)}
                key={widget.id}
                style={{
                  gridColumn: `${widget.layout.x + 1} / span ${widget.layout.w}`,
                  gridRow: `${widget.layout.y + 1} / span ${widget.layout.h}`,
                }}
              >
                <span>{widget.type}</span>
                <strong>{widget.title}</strong>
                <em>{widget.displayValue || "等待绑定点位"}</em>
                <small>{widget.quality} · {widget.tone}</small>
              </article>
            ))}
          </section>
        </main>

        <aside className="scada-property-panel">
          <h2>属性面板</h2>
          {selectedWidget ? (
            <div className="scada-property-grid">
              <label>
                组件 ID
                <input readOnly value={selectedWidget.id} />
              </label>
              <label>
                组件类型
                <input readOnly value={selectedWidget.type} />
              </label>
              <label>
                标题
                <input readOnly value={selectedWidget.title} />
              </label>
              <label>
                布局
                <input readOnly value={`x:${selectedWidget.layout.x} y:${selectedWidget.layout.y} w:${selectedWidget.layout.w} h:${selectedWidget.layout.h}`} />
              </label>
              <label>
                绑定点位
                <select value={selectedBinding?.pointId ?? ""} onChange={(event) => handleBindSelectedWidget(event.target.value)}>
                  {scadaSeedPointModels.map((pointModel) => (
                    <option value={pointModel.point_id} key={pointModel.point_id}>
                      {pointModel.device_type} · {pointModel.name} · {pointModel.address}
                    </option>
                  ))}
                </select>
              </label>
              <div className="scada-binding-card">
                <span>设备实例</span>
                <strong>{selectedBinding?.deviceInstanceId ?? "未绑定"}</strong>
                <span>显示格式</span>
                <strong>{selectedBinding?.displayFormat ?? "-"}</strong>
                <span>状态颜色规则</span>
                <strong>{selectedBinding?.colorRules.length ?? 0} 条</strong>
                <span>告警规则</span>
                <strong>{selectedBinding?.alarmRules.length ?? 0} 条</strong>
              </div>
            </div>
          ) : (
            <p>请选择画布组件。</p>
          )}
        </aside>
      </div>

      <footer className="scada-binding-dock">
        <section>
          <h2>点位绑定和事件脚本</h2>
          <p>每个组件保存设备实例、点位地址、显示格式、单位、枚举、状态颜色规则、告警规则和写入动作。</p>
        </section>
        <div className="scada-binding-table">
          {activePage.bindings.slice(0, 8).map((binding) => (
            <article key={binding.id}>
              <strong>{binding.pointName}</strong>
              <span>{binding.deviceInstanceId}</span>
              <span>{binding.pointAddress}</span>
              <span>{binding.unit || "—"}</span>
            </article>
          ))}
        </div>
        <textarea readOnly value={savedJson || serializeScadaPage(activePage)} aria-label="保存格式 JSON" />
      </footer>
    </section>
  );
}
