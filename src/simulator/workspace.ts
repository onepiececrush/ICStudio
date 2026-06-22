import { protocolCatalogSeed } from "../data/protocolLab";
import type { DeviceProfile } from "../protocol/deviceProfile";
import { defaultTransportListenConfig, type TransportListenConfig } from "../transport/transportLayer";
import type { FrameLog } from "./simulatorEngine";

export type SimulatorNotice = {
  tone: "info" | "success" | "error";
  text: string;
};

export type SimulatorExceptionStats = {
  ok: number;
  none: number;
  exceptionCode: number;
  timeout: number;
  noResponse: number;
  outOfRange: number;
};

export type SimulatorRegisterMeta = {
  lastModifiedAt?: string;
  lastModifiedSource?: string;
};

export type SimulatorRegisterCommitSource =
  | "main-table"
  | "quick-drawer"
  | "scenario";

export type SimulatorServerFrameLog = {
  sequence: number;
  timestamp: number;
  direction: "request" | "response";
  frame: string;
  note: string;
};

export type SimulatorServerStatus = {
  running: boolean;
  endpoint: string;
  unitId: number;
  logs: string[];
  frameLogs: SimulatorServerFrameLog[];
};

export type SimulatorWorkspaceState = {
  profiles: DeviceProfile[];
  selectedProfileId: string;
  transportConfig: TransportListenConfig;
  running: boolean;
  busy: boolean;
  serverStatus: SimulatorServerStatus;
  frameLogs: FrameLog[];
  backendLogs: string[];
  exceptionStats: SimulatorExceptionStats;
  pinnedRegisterIds: string[];
  recentRegisterIds: string[];
  registerMeta: Record<string, SimulatorRegisterMeta>;
  notice: SimulatorNotice | null;
};

export const defaultSimulatorExceptionStats: SimulatorExceptionStats = {
  ok: 0,
  none: 0,
  exceptionCode: 0,
  timeout: 0,
  noResponse: 0,
  outOfRange: 0,
};

export function createDefaultSimulatorWorkspaceState(): SimulatorWorkspaceState {
  return {
    profiles: protocolCatalogSeed,
    selectedProfileId: protocolCatalogSeed[0]?.id ?? "",
    transportConfig: {
      tcp: { ...defaultTransportListenConfig.tcp },
      rtu: { ...defaultTransportListenConfig.rtu },
      future: [...defaultTransportListenConfig.future],
    },
    running: false,
    busy: false,
    serverStatus: {
      running: false,
      endpoint: `${defaultTransportListenConfig.tcp.ip}:${defaultTransportListenConfig.tcp.port}`,
      unitId: defaultTransportListenConfig.rtu.slaveId,
      logs: [],
      frameLogs: [],
    },
    frameLogs: [],
    backendLogs: [],
    exceptionStats: { ...defaultSimulatorExceptionStats },
    pinnedRegisterIds: [],
    recentRegisterIds: [],
    registerMeta: {},
    notice: null,
  };
}

export function findSelectedSimulatorProfile(state: Pick<SimulatorWorkspaceState, "profiles" | "selectedProfileId">) {
  return state.profiles.find((profile) => profile.id === state.selectedProfileId) ?? state.profiles[0] ?? null;
}
