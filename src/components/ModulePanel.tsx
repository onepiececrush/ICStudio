import type { LucideIcon } from "lucide-react";
import {
  Cable,
  Cpu,
  Database,
  FileChartColumn,
  FlaskConical,
  Gauge,
  Layers3,
  RadioTower,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  UploadCloud,
  Waves,
  Zap,
} from "lucide-react";
import type { AppSnapshot, ModuleKey } from "../types";
import type { LocalHistoryRepository } from "../history/historyCenter";
import type { NativeHistoryStore } from "../history/nativeHistoryStorage";
import type { AlarmEngineState } from "../alarm/alarmRuleEngine";
import type { ControlCommandRequest, ControlExecutionResult, ControlOperationLog } from "../control/controlSafetyCenter";
import { monitorPointIds, parameterPointIds, pointBindingRegistry } from "../pointBinding/registry";
import type { DeviceProfile } from "../protocol/deviceProfile";
import type { SimulatorWorkspaceState } from "../simulator/workspace";
import { AlarmRuleEngineWorkbench } from "./AlarmRuleEngineWorkbench";
import { AutoTestWorkbench } from "./AutoTestWorkbench";
import { CommunicationDiagnosticsWorkbench } from "./CommunicationDiagnosticsWorkbench";
import { ControlSafetyCenterWorkbench } from "./ControlSafetyCenterWorkbench";
import { HistoryReportCenter } from "./HistoryReportCenter";
import { HostVerificationWorkbench } from "./HostVerificationWorkbench";
import { ProtocolLabWorkbench } from "./ProtocolLabWorkbench";
import { ScadaPageDesigner } from "./ScadaPageDesigner";
import { SimulatorWorkbench } from "./SimulatorWorkbench";

type ModuleMeta = {
  title: string;
  icon: LucideIcon;
  rows: string[];
};

const moduleMeta: Record<Exclude<ModuleKey, "dashboard">, ModuleMeta> = {
  communication: {
    title: "通信调试",
    icon: Cable,
    rows: ["连接配置", "报文助手", "报文监控", "通信统计"],
  },
  hostVerification: {
    title: "主机验证",
    icon: Gauge,
    rows: ["XLS 协议解析", "全寄存器读取", "可写点写入", "回读校验"],
  },
  protocol: {
    title: "协议管理",
    icon: Layers3,
    rows: ["协议资产", "导入映射", "协议校验", "Profile 导出"],
  },
  devices: {
    title: "设备管理",
    icon: Cpu,
    rows: ["设备树", "设备属性", "设备点位", "设备拓扑"],
  },
  monitor: {
    title: "实时监控",
    icon: Gauge,
    rows: ["PCS 实时数据", "BMS 实时数据", "PMU 汇总", "液冷动环"],
  },
  parameters: {
    title: "参数配置",
    icon: SlidersHorizontal,
    rows: ["PCS 参数", "BMS 参数", "保护参数", "参数标定"],
  },
  control: {
    title: "运行控制",
    icon: Zap,
    rows: ["并网启停", "功率设定", "急停复位", "控制闭锁"],
  },
  events: {
    title: "故障事件",
    icon: ShieldAlert,
    rows: ["当前故障", "历史事件", "告警确认", "事件导出"],
  },
  waveform: {
    title: "波形录波",
    icon: Waves,
    rows: ["实时波形", "故障 ID", "通道配置", "录波导出"],
  },
  history: {
    title: "历史数据",
    icon: Database,
    rows: ["趋势查询", "事件追溯", "数据导出", "归档策略"],
  },
  upgrade: {
    title: "固件升级",
    icon: UploadCloud,
    rows: ["升级任务", "传输进度", "版本校验", "升级日志"],
  },
  autotest: {
    title: "自动化测试",
    icon: FlaskConical,
    rows: ["用例树", "运行队列", "测试日志", "结果汇总"],
  },
  simulator: {
    title: "从机模拟",
    icon: RadioTower,
    rows: ["模拟总览", "监听配置", "寄存器内存", "故障注入"],
  },
  scada: {
    title: "组态大屏",
    icon: FileChartColumn,
    rows: ["画面组态", "变量绑定", "大屏预览", "发布配置"],
  },
  data: {
    title: "数据服务",
    icon: Database,
    rows: ["数据源", "历史库", "转发配置", "API 服务"],
  },
  settings: {
    title: "系统设置",
    icon: Settings,
    rows: ["默认路径", "操作确认", "用户权限", "日志级别"],
  },
};

export function ModulePanel(props: {
  moduleKey: ModuleKey;
  snapshot: AppSnapshot;
  historyRepository?: LocalHistoryRepository;
  nativeHistoryStore?: NativeHistoryStore | null;
  nativeDbPath?: string;
  onInspectPoint?: (pointId: string) => void;
  alarmState?: AlarmEngineState;
  onAlarmStateChange?: (state: AlarmEngineState) => void;
  controlSafetyLogs?: ControlOperationLog[];
  onControlSafetyCommand?: (request: ControlCommandRequest) => Promise<ControlExecutionResult>;
  simulatorWorkspace: SimulatorWorkspaceState;
  selectedSimulatorProfile: DeviceProfile | null;
  onSimulatorProfileImport: (profile: DeviceProfile) => void;
  onSimulatorProfileSelect: (profileId: string) => void;
  onSimulatorTransportConfigChange: (config: SimulatorWorkspaceState["transportConfig"]) => void;
  onSimulatorRegisterCommit: (registerId: string, value: string) => Promise<boolean>;
  onSimulatorTogglePin: (registerId: string) => void;
  onSimulatorStart: () => Promise<void>;
  onSimulatorStop: () => Promise<void>;
  onSimulatorApplyScenario: (scenarioId: string) => Promise<void>;
  onSimulatorNoticeClear: () => void;
  onSimulatorRefreshLogs: () => Promise<void>;
}) {
  if (props.moduleKey === "dashboard") {
    return null;
  }

  if (props.moduleKey === "communication") {
    return <CommunicationDiagnosticsWorkbench snapshot={props.snapshot} />;
  }

  if (props.moduleKey === "hostVerification") {
    return (
      <HostVerificationWorkbench
        profiles={props.simulatorWorkspace.profiles}
        selectedProfileId={props.simulatorWorkspace.selectedProfileId}
        onSelectProfile={props.onSimulatorProfileSelect}
        onImportProfile={props.onSimulatorProfileImport}
      />
    );
  }

  if (props.moduleKey === "history") {
    return <HistoryReportCenter snapshot={props.snapshot} repository={props.historyRepository} nativeHistoryStore={props.nativeHistoryStore} nativeDbPath={props.nativeDbPath} />;
  }
  if (props.moduleKey === "autotest") {
    return <AutoTestWorkbench snapshot={props.snapshot} />;
  }

  if (props.moduleKey === "events" && props.alarmState && props.onAlarmStateChange) {
    return <AlarmRuleEngineWorkbench alarmState={props.alarmState} onAlarmStateChange={props.onAlarmStateChange} />;
  }

  if (props.moduleKey === "monitor" || props.moduleKey === "parameters") {
    const meta = moduleMeta[props.moduleKey];
    const Icon = meta.icon;
    const pointIds = props.moduleKey === "monitor" ? monitorPointIds : parameterPointIds;
    const safetyPanel = props.moduleKey === "parameters" && props.onControlSafetyCommand ? (
      <div className="module-safety-embed">
        <ControlSafetyCenterWorkbench
          snapshot={props.snapshot}
          controlSafetyLogs={props.controlSafetyLogs ?? []}
          onControlSafetyCommand={props.onControlSafetyCommand}
        />
      </div>
    ) : null;

    return (
      <section className="module-panel">
        <div className="module-header">
          <Icon size={34} />
          <div>
            <h1>{meta.title}</h1>
            <p>{props.snapshot.project.protocolVersion}</p>
          </div>
        </div>
        <div className="module-value-grid">
          {pointIds.map((pointId, index) => {
            const point = pointBindingRegistry[pointId];
            const formattedValue = point?.formattedValue ?? "未读取";
            return (
              <article
                className="module-value-card trace-clickable-card"
                data-point-id={pointId}
                role="button"
                tabIndex={0}
                onClick={() => props.onInspectPoint?.(pointId)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  props.onInspectPoint?.(pointId);
                }}
                key={pointId}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{formattedValue}</strong>
                <small>{point?.displayName ?? pointId}</small>
                <small>{point ? `${point.deviceInstance} · ${String(point.registerAddress)}` : "未绑定点位"}</small>
              </article>
            );
          })}
        </div>
        {safetyPanel}
      </section>
    );
  }

  if (["control", "upgrade"].includes(props.moduleKey) && props.onControlSafetyCommand) {
    return <ControlSafetyCenterWorkbench snapshot={props.snapshot} controlSafetyLogs={props.controlSafetyLogs ?? []} onControlSafetyCommand={props.onControlSafetyCommand} />;
  }


  if (props.moduleKey === "protocol") {
    return (
      <ProtocolLabWorkbench
        profiles={props.simulatorWorkspace.profiles}
        selectedProfileId={props.simulatorWorkspace.selectedProfileId}
        onSelectProfile={props.onSimulatorProfileSelect}
        onImportProfile={props.onSimulatorProfileImport}
      />
    );
  }

  if (props.moduleKey === "simulator") {
    return (
      <SimulatorWorkbench
        workspace={props.simulatorWorkspace}
        selectedProfile={props.selectedSimulatorProfile}
        onSelectProfile={props.onSimulatorProfileSelect}
        onImportProfile={props.onSimulatorProfileImport}
        onTransportConfigChange={props.onSimulatorTransportConfigChange}
        onRegisterCommit={props.onSimulatorRegisterCommit}
        onTogglePin={props.onSimulatorTogglePin}
        onStart={props.onSimulatorStart}
        onStop={props.onSimulatorStop}
        onApplyScenario={props.onSimulatorApplyScenario}
        onNoticeClear={props.onSimulatorNoticeClear}
        onRefreshLogs={props.onSimulatorRefreshLogs}
      />
    );
  }

  if (props.moduleKey === "scada") {
    return <ScadaPageDesigner snapshot={props.snapshot} />;
  }

  const meta = moduleMeta[props.moduleKey];
  const Icon = meta.icon;

  return (
    <section className="module-panel">
      <div className="module-header">
        <Icon size={34} />
        <div>
          <h1>{meta.title}</h1>
          <p>{props.snapshot.project.protocolVersion}</p>
        </div>
      </div>
      <div className="module-grid">
        {meta.rows.map((row, index) => {
          return (
            <article key={row}>
              <span>0{index + 1}</span>
              <strong>{row}</strong>
              <small>{props.snapshot.connection.mode}</small>
            </article>
          );
        })}
      </div>
    </section>
  );
}
