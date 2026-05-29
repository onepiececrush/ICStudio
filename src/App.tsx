import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Dashboard } from "./components/Dashboard";
import { AppShell } from "./components/AppShell";
import { ModulePanel } from "./components/ModulePanel";
import { createAlarmEngineState, evaluateAlarmSnapshot, type AlarmEngineState, type AlarmInputPoint } from "./alarm/alarmRuleEngine";
import { createControlSafetyCenter, type ControlCommandRequest, type ControlExecutionResult, type ControlOperationLog } from "./control/controlSafetyCenter";
import { mockSnapshot } from "./data/mockSnapshot";
import { LocalHistoryRepository, persistSnapshotToHistory } from "./history/historyCenter";
import { initializeNativeHistoryDatabase, persistSnapshotToNativeHistory, type NativeHistoryStore } from "./history/nativeHistoryStorage";
import { loadSnapshot } from "./lib/snapshot";
import { inspectPointBinding, type PointBindingTrace } from "./pointBinding/registry";
import type { DeviceProfile, DeviceRegister } from "./protocol/deviceProfile";
import { buildModbusTcpWriteSingleRegisterFrame, createSimulatorEngine, type FrameLog } from "./simulator/simulatorEngine";
import { parseSimulatorRegisterInput, toSimulatorNumericValue } from "./simulator/registerValue";
import {
  createDefaultSimulatorWorkspaceState,
  defaultSimulatorExceptionStats,
  findSelectedSimulatorProfile,
  type SimulatorRegisterCommitSource,
  type SimulatorServerStatus,
  type SimulatorWorkspaceState,
} from "./simulator/workspace";
import type { AppSnapshot, HomeLoopbackDashboard, ModuleKey } from "./types";
import "./App.css";

const HOME_DEVICE_POLL_INTERVAL_MS = 500;
const DEFAULT_HOME_DEVICE_CONNECTION = {
  host: "",
  port: 502,
  unitId: 1,
};

export type HomeDeviceConnection = typeof DEFAULT_HOME_DEVICE_CONNECTION;

type SimulatorRegisterPayload = {
  address: number;
  name: string;
  dataType: string;
  length: number;
  scale: number;
  unit: string;
  currentValue: number;
};

function App() {
  const [activeModule, setActiveModule] = useState<ModuleKey>("dashboard");
  const [snapshot, setSnapshot] = useState<AppSnapshot>(mockSnapshot);
  const [selectedPointTrace, setSelectedPointTrace] = useState<PointBindingTrace | null>(null);
  const [loopbackDashboard, setLoopbackDashboard] = useState<HomeLoopbackDashboard | null>(null);
  const [homeConnection, setHomeConnection] = useState<HomeDeviceConnection>(DEFAULT_HOME_DEVICE_CONNECTION);
  const [homeConnectionBusy, setHomeConnectionBusy] = useState(false);
  const [homeConnectionNotice, setHomeConnectionNotice] = useState<{ tone: "info" | "success" | "error"; text: string } | null>(null);
  const [alarmState, setAlarmState] = useState<AlarmEngineState>(() => evaluateAlarmSnapshot(createAlarmEngineState(), createDefaultAlarmInputs()));
  const historyRepositoryRef = useRef<LocalHistoryRepository>(new LocalHistoryRepository());
  const nativeHistoryStoreRef = useRef<NativeHistoryStore | null>(null);
  const [historyDbPath, setHistoryDbPath] = useState("");
  const controlSafetyRegistersRef = useRef<Map<number, unknown>>(new Map());
  const [controlSafetyLogs, setControlSafetyLogs] = useState<ControlOperationLog[]>([]);
  const [simulatorWorkspace, setSimulatorWorkspace] = useState<SimulatorWorkspaceState>(() => createDefaultSimulatorWorkspaceState());
  const simulatorTransactionIdRef = useRef(1);
  const visibleSnapshot = createRuntimeSnapshot(snapshot, loopbackDashboard);
  const selectedSimulatorProfile = findSelectedSimulatorProfile(simulatorWorkspace);

  useEffect(() => {
    let cancelled = false;
    historyRepositoryRef.current.initialize();

    const persistSnapshotEverywhere = (nextSnapshot: AppSnapshot) => {
      const input = { timestamp: Date.now(), operator: nextSnapshot.project.operator };
      persistSnapshotToHistory(historyRepositoryRef.current, nextSnapshot, input);
      void persistSnapshotToNativeHistory(nativeHistoryStoreRef.current, nextSnapshot, input);
    };

    persistSnapshotEverywhere(mockSnapshot);

    initializeNativeHistoryDatabase().then((store) => {
      if (cancelled) return;
      nativeHistoryStoreRef.current = store;
      setHistoryDbPath(store?.dbPath ?? "浏览器内存模式");
      if (store) {
        void persistSnapshotToNativeHistory(store, mockSnapshot, {
          timestamp: Date.now(),
          operator: mockSnapshot.project.operator,
        });
      }
    });

    loadSnapshot().then((loaded) => {
      if (cancelled) return;
      setSnapshot(loaded);
      setLoopbackDashboard(loaded.loopbackDashboard ?? null);
      persistSnapshotEverywhere(loaded);
    });

    invoke<SimulatorServerStatus>("get_modbus_simulator_status")
      .then((status) => {
        if (cancelled) return;
        setSimulatorWorkspace((current) => ({
          ...current,
          running: status.running,
          serverStatus: status,
          backendLogs: status.logs,
          frameLogs: status.logs.map((log) => createBackendFrameLog(log)),
        }));
      })
      .catch(() => {
        // plain browser mode or command unavailable in tests
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loopbackDashboard) return;
    const timer = window.setInterval(() => {
      invoke<HomeLoopbackDashboard>("poll_home_loopback_dashboard")
        .then(setLoopbackDashboard)
        .catch((error) => {
          setHomeConnectionNotice({ tone: "error", text: `首页设备轮询失败：${String(error || "未知错误")}` });
        });
    }, HOME_DEVICE_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [Boolean(loopbackDashboard)]);

  useEffect(() => {
    if (!simulatorWorkspace.running) return;
    const timer = window.setInterval(() => {
      void refreshSimulatorStatus({ silent: true });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [simulatorWorkspace.running]);

  useEffect(() => {
    setAlarmState((current) => evaluateAlarmSnapshot(current, createAlarmInputs(loopbackDashboard)));
  }, [loopbackDashboard]);

  function handleInspectPoint(pointId: string) {
    const trace = inspectPointBinding(pointId);
    setSelectedPointTrace(trace);
  }

  function notifyCommandFailure(result: ControlExecutionResult, fallbackMessage: string) {
    if (result.ok) return false;
    setHomeConnectionNotice({ tone: "error", text: result.reason ?? fallbackMessage });
    return true;
  }

  async function executeSafetyWrappedCommand(
    request: ControlCommandRequest,
    effect?: () => Promise<unknown>,
    readbackValue: unknown = request.expectedReadback ?? request.value,
  ): Promise<ControlExecutionResult> {
    let effectExecuted = false;
    const isHomeConnectCommand = request.deviceId === "home-modbus" && request.operation === "home-device-connect";
    const center = createControlSafetyCenter({
      now: () => new Date().toISOString(),
      user: { id: "operator", name: visibleSnapshot.project.operator, permissions: ["control:execute", "control:power", "control:parameters", "control:upgrade", "simulator:fault"] },
      device: {
        id: request.deviceId,
        name: request.deviceId.toUpperCase(),
        connected: isHomeConnectCommand || visibleSnapshot.connection.status === "已连接",
        mode: loopbackDashboard?.selfTestMode ? "self-test" : "real-device",
        state: loopbackDashboard?.values.find((value) => value.address === "14002")?.displayValue === "故障" ? "fault" : "running",
        writableScopes: ["pcs", "parameters", "firmware", "simulator"],
      },
      confirm: async (challenge) => {
        if (request.deviceScope === "simulator") return true;
        return window.confirm(`${challenge.message}`);
      },
      transport: {
        read: async ({ address }) => controlSafetyRegistersRef.current.get(address) ?? readKnownControlValue(address, loopbackDashboard, homeConnection),
        write: async ({ address, value }) => {
          if (effect && !effectExecuted) {
            effectExecuted = true;
            await effect();
          }
          controlSafetyRegistersRef.current.set(address, readbackValue);
          for (const item of request.batch ?? []) {
            controlSafetyRegistersRef.current.set(item.address, item.expectedReadback ?? item.value);
          }
          return { ok: true, response: `WRITE ${address}=${String(value)}` };
        },
      },
    });
    const result = await center.execute(request);
    setControlSafetyLogs((current) => [...center.getLogs(), ...current].slice(0, 50));
    return result;
  }

  function handleEmergencyStop() {
    void executeSafetyWrappedCommand({
      operation: "emergency-stop",
      label: "急停",
      deviceId: "pcs-1",
      deviceScope: "pcs",
      requiredPermission: "control:execute",
      address: 40103,
      value: 1,
      expectedReadback: 1,
      allowedStates: ["running", "standby", "fault", "stopped"],
      requiresConfirmation: true,
    }).then((result) => {
      notifyCommandFailure(result, "急停执行失败");
    });
  }

  async function handleConnectHomeDevice() {
    setHomeConnectionBusy(true);
    const endpoint = formatHomeDeviceConnection(homeConnection);
    setHomeConnectionNotice({ tone: "info", text: `正在连接首页设备：${endpoint} ...` });
    try {
      const result = await executeSafetyWrappedCommand({
        operation: "home-device-connect",
        label: "连接首页设备",
        deviceId: "home-modbus",
        deviceScope: "pcs",
        requiredPermission: "control:execute",
        address: homeConnection.port,
        value: endpoint,
        expectedReadback: endpoint,
        allowedStates: ["running", "standby", "stopped", "fault"],
        requiresConfirmation: false,
      }, async () => {
        const dashboard = await invoke<HomeLoopbackDashboard>("connect_home_modbus_dashboard", homeConnection);
        setLoopbackDashboard(dashboard);
        setHomeConnectionNotice({ tone: "success", text: `首页设备已连接：${dashboard.endpoint} · unit=${homeConnection.unitId} · ${dashboard.connectionStatus}` });
        return dashboard;
      }, endpoint);
      if (notifyCommandFailure(result, "连接首页设备失败")) return;
    } finally {
      setHomeConnectionBusy(false);
    }
  }

  async function handleDisconnectHomeDevice() {
    setHomeConnectionBusy(true);
    setHomeConnectionNotice({ tone: "info", text: "正在断开首页设备连接..." });
    try {
      const result = await executeSafetyWrappedCommand({
        operation: "home-device-disconnect",
        label: "断开首页设备",
        deviceId: "home-modbus",
        deviceScope: "pcs",
        requiredPermission: "control:execute",
        address: homeConnection.port,
        value: "disconnected",
        expectedReadback: "disconnected",
        allowedStates: ["running", "standby", "stopped", "fault"],
        requiresConfirmation: false,
      }, async () => {
        await invoke("disconnect_home_modbus_dashboard");
        setLoopbackDashboard(null);
        setHomeConnectionNotice({ tone: "success", text: "首页设备已断开，首页数据已停止刷新" });
        return "disconnected";
      }, "disconnected");
      if (notifyCommandFailure(result, "断开首页设备失败")) return;
    } finally {
      setHomeConnectionBusy(false);
    }
  }

  function handleSimulatorProfileImport(profile: DeviceProfile) {
    setSimulatorWorkspace((current) => ({
      ...current,
      profiles: [profile, ...current.profiles.filter((item) => item.id !== profile.id)],
      selectedProfileId: profile.id,
      notice: { tone: "success", text: `已导入模拟协议：${profile.name}` },
    }));
  }

  function handleSimulatorProfileSelect(profileId: string) {
    setSimulatorWorkspace((current) => {
      if (current.running) return current;
      return {
        ...current,
        selectedProfileId: profileId,
        notice: null,
      };
    });
  }

  function handleSimulatorTransportConfigChange(transportConfig: SimulatorWorkspaceState["transportConfig"]) {
    setSimulatorWorkspace((current) => ({
      ...current,
      transportConfig,
      serverStatus: current.running ? current.serverStatus : {
        ...current.serverStatus,
        endpoint: `${transportConfig.tcp.ip}:${transportConfig.tcp.port}`,
        unitId: transportConfig.rtu.slaveId,
      },
    }));
  }

  function handleSimulatorTogglePin(registerId: string) {
    setSimulatorWorkspace((current) => {
      const pinned = current.pinnedRegisterIds.includes(registerId)
        ? current.pinnedRegisterIds.filter((id) => id !== registerId)
        : [registerId, ...current.pinnedRegisterIds].slice(0, 12);
      return { ...current, pinnedRegisterIds: pinned };
    });
  }

  async function refreshSimulatorStatus(options: { silent?: boolean } = {}) {
    try {
      const status = await invoke<SimulatorServerStatus>("get_modbus_simulator_status");
      setSimulatorWorkspace((current) => ({
        ...current,
        running: status.running,
        serverStatus: status,
        backendLogs: status.logs,
      }));
    } catch (error) {
      if (options.silent) return;
      setSimulatorWorkspace((current) => ({
        ...current,
        notice: { tone: "error", text: `刷新从机模拟日志失败：${String(error || "未知错误")}` },
      }));
    }
  }

  async function handleSimulatorRegisterCommit(
    registerId: string,
    value: string,
    source: SimulatorRegisterCommitSource = "main-table",
  ) {
    const profile = selectedSimulatorProfile;
    if (!profile) return false;
    const register = profile.registers.find((item) => item.id === registerId);
    if (!register) return false;
    const parsed = parseSimulatorRegisterInput(register, value);
    if (!parsed.ok) {
      setSimulatorWorkspace((current) => ({
        ...current,
        notice: { tone: "error", text: `${register.name} 写值失败：${parsed.reason}` },
      }));
      return false;
    }

    try {
      if (simulatorWorkspace.running) {
        if (parsed.numericValue === null) {
          setSimulatorWorkspace((current) => ({
            ...current,
            notice: { tone: "error", text: `${register.name} 当前类型暂不支持运行态写值。` },
          }));
          return false;
        }
        const status = await invoke<SimulatorServerStatus>("set_modbus_simulator_register_value", {
          address: register.address,
          value: parsed.numericValue,
        });
        setSimulatorWorkspace((current) => ({
          ...current,
          serverStatus: status,
          backendLogs: status.logs,
        }));
      }

      const timestamp = formatSimulatorTime(new Date());
      const writeFrame = buildModbusTcpWriteSingleRegisterFrame({
        transactionId: simulatorTransactionIdRef.current,
        unitId: simulatorWorkspace.serverStatus.unitId || simulatorWorkspace.transportConfig.rtu.slaveId,
        address: register.address,
        rawValue: parsed.rawValue ?? parsed.numericValue ?? 0,
      });
      simulatorTransactionIdRef.current = simulatorTransactionIdRef.current >= 0xffff ? 1 : simulatorTransactionIdRef.current + 1;
      const nextFrameLogs: FrameLog[] = [
        {
          direction: "request",
          time: timestamp,
          frame: writeFrame.request,
          note: source === "quick-drawer" ? "全局快调台 FC06 写单寄存器请求" : "寄存器表 FC06 写单寄存器请求",
        },
        {
          direction: "response",
          time: timestamp,
          frame: writeFrame.response,
          note: "FC06 写单寄存器响应回显",
        },
      ];
      setSimulatorWorkspace((current) => ({
        ...current,
        profiles: current.profiles.map((profileItem) => (
          profileItem.id === profile.id
            ? {
              ...profileItem,
              registers: profileItem.registers.map((registerItem) => (
                registerItem.id === registerId
                  ? { ...registerItem, currentValue: parsed.currentValue }
                  : registerItem
              )),
            }
            : profileItem
        )),
        recentRegisterIds: [registerId, ...current.recentRegisterIds.filter((id) => id !== registerId)].slice(0, 12),
        registerMeta: {
          ...current.registerMeta,
          [registerId]: { lastModifiedAt: timestamp, lastModifiedSource: source },
        },
        frameLogs: [...nextFrameLogs, ...current.frameLogs].slice(0, 120),
        notice: null,
      }));
      return true;
    } catch (error) {
      setSimulatorWorkspace((current) => ({
        ...current,
        notice: { tone: "error", text: `${register.name} 写值失败：${String(error || "未知错误")}` },
      }));
      return false;
    }
  }

  async function handleSimulatorStart() {
    const profile = selectedSimulatorProfile;
    if (!profile) return;
    const payload = profile.registers
      .map(buildSimulatorRegisterPayload)
      .filter((item): item is SimulatorRegisterPayload => item !== null);
    if (!payload.length) {
      setSimulatorWorkspace((current) => ({
        ...current,
        notice: { tone: "error", text: "当前协议没有可用于 Modbus 模拟的数值型寄存器。" },
      }));
      return;
    }

    setSimulatorWorkspace((current) => ({
      ...current,
      busy: true,
      notice: { tone: "info", text: `正在启动模拟设备：${profile.name}` },
    }));
    try {
      const status = await invoke<SimulatorServerStatus>("start_modbus_simulator_server", {
        host: simulatorWorkspace.transportConfig.tcp.ip,
        port: simulatorWorkspace.transportConfig.tcp.port,
        unitId: simulatorWorkspace.transportConfig.rtu.slaveId,
        registers: payload,
      });
      const nextFrameLog: FrameLog = {
        direction: "request",
        time: formatSimulatorTime(new Date()),
        frame: `LISTEN TCP ${status.endpoint} UNIT ${status.unitId}`,
        note: `当前模拟设备：${profile.name}`,
      };
      setSimulatorWorkspace((current) => ({
        ...current,
        running: status.running,
        busy: false,
        serverStatus: status,
        backendLogs: status.logs,
        frameLogs: [nextFrameLog, ...status.logs.map((log) => createBackendFrameLog(log))].slice(0, 120),
        notice: { tone: "success", text: `模拟已启动：${profile.name} @ tcp://${status.endpoint} unit=${status.unitId}` },
      }));
    } catch (error) {
      setSimulatorWorkspace((current) => ({
        ...current,
        running: false,
        busy: false,
        notice: { tone: "error", text: `启动从机模拟失败：${String(error || "未知错误")}` },
      }));
    }
  }

  async function handleSimulatorStop() {
    setSimulatorWorkspace((current) => ({
      ...current,
      busy: true,
      notice: { tone: "info", text: "正在停止从机模拟..." },
    }));
    try {
      const status = await invoke<SimulatorServerStatus>("stop_modbus_simulator_server");
      const nextFrameLog: FrameLog = {
        direction: "response",
        time: formatSimulatorTime(new Date()),
        frame: `STOP TCP ${status.endpoint}`,
        note: "停止从机模拟 TCP Server",
      };
      setSimulatorWorkspace((current) => ({
        ...current,
        running: false,
        busy: false,
        serverStatus: status,
        backendLogs: status.logs,
        frameLogs: [nextFrameLog, ...current.frameLogs].slice(0, 120),
        notice: { tone: "success", text: "从机模拟已停止" },
      }));
    } catch (error) {
      setSimulatorWorkspace((current) => ({
        ...current,
        busy: false,
        notice: { tone: "error", text: `停止从机模拟失败：${String(error || "未知错误")}` },
      }));
    }
  }

  async function handleSimulatorApplyScenario(scenarioId: string) {
    const profile = selectedSimulatorProfile;
    if (!profile) return;
    const simulatorEngine = createSimulatorEngine(profile);
    const result = simulatorEngine.applyScene(scenarioId);
    if (!result.ok) {
      setSimulatorWorkspace((current) => ({
        ...current,
        notice: { tone: "error", text: result.reason ?? "场景应用失败" },
      }));
      return;
    }

    const nextRegisters = profile.registers.map((register) => simulatorEngine.readRegister(register.id) ?? register);
    const changedRegisters = nextRegisters.filter((register, index) => register.currentValue !== profile.registers[index]?.currentValue);

    try {
      if (simulatorWorkspace.running) {
        for (const register of changedRegisters) {
          const numericValue = toSimulatorNumericValue(register.currentValue);
          if (numericValue === null) continue;
          await invoke("set_modbus_simulator_register_value", {
            address: register.address,
            value: numericValue,
          });
        }
        await refreshSimulatorStatus({ silent: true });
      }

      const timestamp = formatSimulatorTime(new Date());
      const nextFrameLog: FrameLog = {
        direction: "response",
        time: timestamp,
        frame: `SCENE ${scenarioId}`,
        note: `应用模拟场景，共更新 ${changedRegisters.length} 个寄存器`,
      };
      setSimulatorWorkspace((current) => ({
        ...current,
        profiles: current.profiles.map((profileItem) => (
          profileItem.id === profile.id ? { ...profileItem, registers: nextRegisters } : profileItem
        )),
        recentRegisterIds: [
          ...changedRegisters.map((register) => register.id),
          ...current.recentRegisterIds,
        ].filter((registerId, index, list) => list.indexOf(registerId) === index).slice(0, 12),
        registerMeta: changedRegisters.reduce<Record<string, { lastModifiedAt?: string; lastModifiedSource?: string }>>(
          (meta, register) => {
            meta[register.id] = { lastModifiedAt: timestamp, lastModifiedSource: "scenario" };
            return meta;
          },
          { ...current.registerMeta },
        ),
        frameLogs: [nextFrameLog, ...current.frameLogs].slice(0, 120),
        exceptionStats: simulatorEngine.getExceptionStats(),
        notice: { tone: "success", text: `场景已应用，共更新 ${changedRegisters.length} 个寄存器` },
      }));
    } catch (error) {
      setSimulatorWorkspace((current) => ({
        ...current,
        notice: { tone: "error", text: `场景写入运行中模拟器失败：${String(error || "未知错误")}` },
      }));
    }
  }

  function handleSimulatorNoticeClear() {
    setSimulatorWorkspace((current) => ({ ...current, notice: null }));
  }

  return (
    <AppShell
      activeModule={activeModule}
      snapshot={visibleSnapshot}
      onNavigate={setActiveModule}
      selectedPointTrace={selectedPointTrace}
      onClosePointInspector={() => setSelectedPointTrace(null)}
      onEmergencyStop={handleEmergencyStop}
      simulatorWorkspace={simulatorWorkspace}
      selectedSimulatorProfile={selectedSimulatorProfile}
      onSimulatorRegisterCommit={handleSimulatorRegisterCommit}
      onSimulatorTogglePin={handleSimulatorTogglePin}
    >
      {activeModule === "dashboard" ? (
        <Dashboard
          snapshot={visibleSnapshot}
          homeConnectionBusy={homeConnectionBusy}
          homeConnectionNotice={homeConnectionNotice}
          homeConnection={homeConnection}
          onHomeConnectionChange={setHomeConnection}
          onConnectHomeDevice={handleConnectHomeDevice}
          onDisconnectHomeDevice={handleDisconnectHomeDevice}
          onInspectPoint={handleInspectPoint}
          alarmState={alarmState}
          controlSafetyLogs={controlSafetyLogs}
        />
      ) : (
        <ModulePanel
          moduleKey={activeModule}
          snapshot={visibleSnapshot}
          historyRepository={historyRepositoryRef.current}
          nativeHistoryStore={nativeHistoryStoreRef.current}
          nativeDbPath={historyDbPath}
          onInspectPoint={handleInspectPoint}
          alarmState={alarmState}
          onAlarmStateChange={setAlarmState}
          controlSafetyLogs={controlSafetyLogs}
          onControlSafetyCommand={executeSafetyWrappedCommand}
          simulatorWorkspace={simulatorWorkspace}
          selectedSimulatorProfile={selectedSimulatorProfile}
          onSimulatorProfileImport={handleSimulatorProfileImport}
          onSimulatorProfileSelect={handleSimulatorProfileSelect}
          onSimulatorTransportConfigChange={handleSimulatorTransportConfigChange}
          onSimulatorRegisterCommit={handleSimulatorRegisterCommit}
          onSimulatorTogglePin={handleSimulatorTogglePin}
          onSimulatorStart={handleSimulatorStart}
          onSimulatorStop={handleSimulatorStop}
          onSimulatorApplyScenario={handleSimulatorApplyScenario}
          onSimulatorNoticeClear={handleSimulatorNoticeClear}
          onSimulatorRefreshLogs={() => refreshSimulatorStatus()}
        />
      )}
    </AppShell>
  );
}

function createRuntimeSnapshot(snapshot: AppSnapshot, loopbackDashboard: HomeLoopbackDashboard | null): AppSnapshot {
  const connected = loopbackDashboard?.connectionStatus === "已连接";
  return {
    ...snapshot,
    connection: {
      ...snapshot.connection,
      endpoint: loopbackDashboard?.endpoint ?? "未连接",
      status: loopbackDashboard?.connectionStatus ?? "未连接",
      latencyMs: connected ? snapshot.connection.latencyMs || 12 : 0,
      successRate: connected ? snapshot.connection.successRate || 100 : 0,
    },
    loopbackDashboard,
  };
}

function formatHomeDeviceConnection(config: HomeDeviceConnection) {
  return `${config.host.trim() || "未填写IP"}:${config.port} unit=${config.unitId}`;
}

function readKnownControlValue(address: number, loopbackDashboard: HomeLoopbackDashboard | null, config: HomeDeviceConnection): unknown {
  if (!loopbackDashboard) return 0;
  const loopbackValue = loopbackDashboard.values.find((value) => Number(value.address) === address);
  if (loopbackValue) {
    const numeric = Number(loopbackValue.engineeringValue);
    return Number.isFinite(numeric) ? numeric : loopbackValue.displayValue;
  }
  const pcsFault = loopbackDashboard.pcsModules.find((module) => module.id === 3)?.hasFault;
  if (address === 16021) return pcsFault ? 1 : 0;
  if (address === config.port) return formatHomeDeviceConnection(config);
  return 0;
}

function createAlarmInputs(loopback: HomeLoopbackDashboard | null): AlarmInputPoint[] {
  const timestamp = Date.now();
  if (!loopback) return createDefaultAlarmInputs(timestamp);
  const pcs3 = loopback.pcsModules.find((module) => module.id === 3);
  return [
    { timestamp, deviceType: "PCS", deviceInstance: "PCS3", pointAddress: 16021, rawValue: pcs3?.hasFault ? 1 : 0 },
    { timestamp, deviceType: "BMS", deviceInstance: "BMS-01", pointAddress: 33601, rawValue: 0 },
    { timestamp, deviceType: "液冷", deviceInstance: "LCS-01", pointAddress: 13134, rawValue: 0 },
    { timestamp, deviceType: "动环", deviceInstance: "ENV-01", pointAddress: 13201, rawValue: 0 },
    { timestamp, deviceType: "电表", deviceInstance: "METER-01", pointAddress: 13224, rawValue: 0 },
    { timestamp, deviceType: "箱变", deviceInstance: "TR-01", pointAddress: 13522, rawValue: 0 },
  ];
}

function createDefaultAlarmInputs(timestamp = Date.parse("2026-05-24T10:00:00.000Z")): AlarmInputPoint[] {
  return [
    { timestamp, deviceType: "PCS", deviceInstance: "PCS3", pointAddress: 16021, rawValue: 0 },
    { timestamp, deviceType: "BMS", deviceInstance: "BMS-01", pointAddress: 33601, rawValue: 0 },
    { timestamp, deviceType: "液冷", deviceInstance: "LCS-01", pointAddress: 13134, rawValue: 0 },
    { timestamp, deviceType: "动环", deviceInstance: "ENV-01", pointAddress: 13201, rawValue: 0 },
    { timestamp, deviceType: "电表", deviceInstance: "METER-01", pointAddress: 13224, rawValue: 0 },
    { timestamp, deviceType: "箱变", deviceInstance: "TR-01", pointAddress: 13522, rawValue: 0 },
  ];
}

function buildSimulatorRegisterPayload(register: DeviceRegister): SimulatorRegisterPayload | null {
  const currentValue = toSimulatorNumericValue(register.currentValue);
  if (currentValue === null) return null;
  return {
    address: register.address,
    name: register.name,
    dataType: register.dataType,
    length: register.length,
    scale: register.scale,
    unit: register.unit,
    currentValue,
  };
}

function createBackendFrameLog(log: string): FrameLog {
  return {
    direction: "response",
    time: formatSimulatorTime(new Date()),
    frame: log,
    note: "从机模拟后端",
  };
}

function formatSimulatorTime(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export { defaultSimulatorExceptionStats };
export default App;
