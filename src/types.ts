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


export type HomeDashboardValue = {
  address: string;
  name: string;
  expectedValue: string;
  engineeringValue: number;
  displayValue: string;
  unit: string;
};

export type HomeVerificationRow = {
  component: string;
  boundAddress: string;
  pointName: string;
  expectedValue: string;
  parsedValue: string;
  displayValue: string;
  unit: string;
  error: string;
  result: string;
};

export type HomePcsModule = {
  id: number;
  state: string;
  power: string;
  maxTemp: string;
  base: number;
  hasFault: boolean;
};

export type HomeLoopbackDashboard = {
  selfTestMode: boolean;
  endpoint: string;
  connectionStatus: string;
  values: HomeDashboardValue[];
  pcsModules: HomePcsModule[];
  verificationRows: HomeVerificationRow[];
  severeAlarmCount: number;
  generalAlarmCount: number;
  communicationAlarmCount: number;
  logs: string[];
};

export type AppSnapshot = {
  project: ProjectInfo;
  connection: ConnectionInfo;
  metrics: MetricCard[];
  devices: DeviceStatus[];
  activities: ActivityItem[];
  trends: TrendPoint[];
  loopbackDashboard?: HomeLoopbackDashboard | null;
};

export type ModuleKey =
  | "dashboard"
  | "communication"
  | "protocol"
  | "devices"
  | "monitor"
  | "parameters"
  | "control"
  | "events"
  | "waveform"
  | "history"
  | "autotest"
  | "simulator"
  | "scada"
  | "data"
  | "upgrade"
  | "settings";
