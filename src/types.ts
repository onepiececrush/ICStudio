export type ProjectInfo = {
  name: string;
  protocolVersion: string;
  operator: string;
};

export type ConnectionInfo = {
  mode: string;
  endpoint: string;
  status: string;
  latencyMs: number;
  successRate: number;
};

export type MetricCard = {
  key: string;
  label: string;
  value: string;
  unit: string;
  tone: string;
  helper: string;
};

export type DeviceStatus = {
  name: string;
  deviceType: string;
  connection: string;
  runtime: string;
  quality: string;
  lastSeen: string;
};

export type ActivityItem = {
  tone: string;
  title: string;
  detail: string;
  time: string;
};

export type TrendPoint = {
  time: string;
  power: number;
  soc: number;
  quality: number;
};

export type AppSnapshot = {
  project: ProjectInfo;
  connection: ConnectionInfo;
  metrics: MetricCard[];
  devices: DeviceStatus[];
  activities: ActivityItem[];
  trends: TrendPoint[];
};

export type ModuleKey =
  | "dashboard"
  | "communication"
  | "protocol"
  | "devices"
  | "monitor"
  | "parameters"
  | "waveform"
  | "alarms"
  | "autotest"
  | "simulator"
  | "data"
  | "reports"
  | "upgrade"
  | "settings";
