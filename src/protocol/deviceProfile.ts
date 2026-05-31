export const deviceProfileSchemaVersion = "device-profile/v1" as const;

export type CommunicationType =
  | "Modbus TCP"
  | "Modbus RTU"
  | "CAN"
  | "Custom TCP"
  | string;

export type ProtocolSourceKind = "excel" | "csv" | "json" | "manual";

export type RegisterAccess = "read" | "write" | "readWrite";

export type RegisterDataType =
  | "bool"
  | "bitfield"
  | "uint16"
  | "int16"
  | "uint32"
  | "int32"
  | "float32"
  | "string"
  | string;

export type RegisterRange = {
  min: number;
  max: number;
};

export type RegisterEnumOption = {
  value: number | string;
  label: string;
};

export type RegisterBitDefinition = {
  bit: number;
  label: string;
  description?: string;
};

export type DeviceRegister = {
  id: string;
  address: number;
  name: string;
  functionCode: number;
  access: RegisterAccess | string;
  dataType: RegisterDataType;
  length: number;
  scale: number;
  offset?: number;
  unit: string;
  range?: RegisterRange;
  enum: RegisterEnumOption[];
  bits: RegisterBitDefinition[];
  description: string;
  group: string;
  currentValue: number | string | boolean;
};

export type ProfileSource = {
  kind: ProtocolSourceKind;
  fileName: string;
};

export type ScenarioStrategy = "fixed" | "random" | "increment" | "decrement" | "sine";

export type ScenarioStep = {
  registerId: string;
  strategy: ScenarioStrategy;
  value?: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  amplitude?: number;
  offset?: number;
};

export type FaultInjectionMode =
  | "none"
  | "exceptionCode"
  | "timeout"
  | "noResponse"
  | "outOfRange";

export type FaultInjection = {
  mode: FaultInjectionMode;
  exceptionCode?: string;
  rate?: number;
};

export type SimulationScenario = {
  id: string;
  name: string;
  description: string;
  steps: ScenarioStep[];
  faultInjection: FaultInjection;
};

export type DeviceProfile = {
  schemaVersion: typeof deviceProfileSchemaVersion;
  id: string;
  name: string;
  version: string;
  deviceType: string;
  vendor: string;
  communicationType: CommunicationType;
  createdAt: string;
  source: ProfileSource;
  registers: DeviceRegister[];
  scenarios: SimulationScenario[];
};

export type ProtocolSummary = {
  registerCount: number;
  readableCount: number;
  writableCount: number;
  addressRange: string;
  enumCount: number;
  bitCount: number;
};

export function summarizeDeviceProfile(profile: DeviceProfile): ProtocolSummary {
  const addresses = profile.registers
    .map((register) => register.address)
    .filter((address) => Number.isFinite(address));
  const readableCount = profile.registers.filter((register) => register.access === "read" || register.access === "readWrite").length;
  const writableCount = profile.registers.filter((register) => register.access === "write" || register.access === "readWrite").length;
  const enumCount = profile.registers.reduce((total, register) => total + register.enum.length, 0);
  const bitCount = profile.registers.reduce((total, register) => total + register.bits.length, 0);

  return {
    registerCount: profile.registers.length,
    readableCount,
    writableCount,
    addressRange: addresses.length === 0 ? "未定义" : `${Math.min(...addresses)} ~ ${Math.max(...addresses)}`,
    enumCount,
    bitCount,
  };
}

export function exportStandardDeviceProfileJson(profile: DeviceProfile): string {
  return `${JSON.stringify(profile, null, 2)}\n`;
}

export function getRegisterSpan(register: Pick<DeviceRegister, "address" | "length">) {
  const length = Number.isFinite(register.length) && register.length > 0 ? Math.floor(register.length) : 1;
  return {
    start: register.address,
    end: register.address + length - 1,
  };
}
