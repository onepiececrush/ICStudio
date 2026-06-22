import type { DeviceProfile, DeviceRegister, FaultInjectionMode, ScenarioStep } from "../protocol/deviceProfile";
import { validateDeviceProfile, type ValidationResult } from "../protocol/validator";

export type SimulatorStatus = {
  running: boolean;
  blocked: boolean;
  reason?: string;
  validation: ValidationResult;
};

export type RegisterWriteResult = {
  ok: boolean;
  reason?: string;
};

export type SimulatorEngine = {
  getSourceKind: () => "device-profile";
  getStatus: () => SimulatorStatus;
  start: () => SimulatorStatus;
  stop: () => SimulatorStatus;
  readRegister: (registerId: string) => DeviceRegister | undefined;
  writeRegister: (registerId: string, value: DeviceRegister["currentValue"]) => RegisterWriteResult;
  applyScene: (scenarioId: string) => RegisterWriteResult;
  getExceptionStats: () => Record<FaultInjectionMode | "ok", number>;
  getFrameLogs: () => FrameLog[];
};

export type FrameLog = {
  direction: "request" | "response";
  time: string;
  frame: string;
  note: string;
  backendSequence?: number;
  timestamp?: number;
};


export type ModbusTcpWriteSingleRegisterFrameInput = {
  transactionId: number;
  unitId: number;
  address: number;
  rawValue: number;
};

export function buildModbusTcpWriteSingleRegisterFrame(input: ModbusTcpWriteSingleRegisterFrameInput) {
  const frame = bytesToHex([
    ...u16Bytes(input.transactionId),
    0x00,
    0x00,
    0x00,
    0x06,
    u8Byte(input.unitId),
    0x06,
    ...u16Bytes(input.address),
    ...u16Bytes(input.rawValue),
  ]);
  return { request: frame, response: frame };
}

function bytesToHex(bytes: number[]) {
  return bytes.map((byte) => u8Byte(byte).toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

function u16Bytes(value: number) {
  const word = u16Word(value);
  return [(word >> 8) & 0xff, word & 0xff];
}

function u8Byte(value: number) {
  const byte = Math.trunc(Number.isFinite(value) ? value : 0);
  return ((byte % 0x100) + 0x100) % 0x100;
}

function u16Word(value: number) {
  const word = Math.trunc(Number.isFinite(value) ? value : 0);
  return ((word % 0x10000) + 0x10000) % 0x10000;
}

export function createSimulatorEngine(profile: DeviceProfile): SimulatorEngine {
  let running = false;
  const validation = validateDeviceProfile(profile);
  const memory = new Map(profile.registers.map((register) => [register.id, { ...register }]));
  const exceptionStats: Record<FaultInjectionMode | "ok", number> = {
    none: 0,
    exceptionCode: 0,
    timeout: 0,
    noResponse: 0,
    outOfRange: 0,
    ok: 0,
  };
  const frameLogs: FrameLog[] = [
    { direction: "request", time: "10:24:01", frame: "01 03 00 00 00 02 C4 0B", note: "读取保持寄存器" },
    { direction: "response", time: "10:24:01", frame: "01 03 04 00 01 00 02 2A 32", note: "根据 Device Profile 编码响应" },
  ];

  function status(reason?: string): SimulatorStatus {
    return { running, blocked: !validation.canStartSimulation, reason, validation };
  }

  return {
    getSourceKind: () => "device-profile",
    getStatus: () => status(validation.canStartSimulation ? undefined : "存在校验错误，禁止启动模拟。"),
    start: () => {
      if (!validation.canStartSimulation) {
        running = false;
        return status("存在协议校验错误，禁止启动模拟。");
      }
      running = true;
      exceptionStats.ok += 1;
      return status();
    },
    stop: () => {
      running = false;
      return status();
    },
    readRegister: (registerId) => memory.get(registerId),
    writeRegister: (registerId, value) => {
      const register = memory.get(registerId);
      if (!register) return { ok: false, reason: "寄存器不存在。" };
      if (register.access === "read") return { ok: false, reason: "只读寄存器不能写入。" };
      register.currentValue = value;
      memory.set(registerId, register);
      frameLogs.unshift({ direction: "request", time: "现在", frame: `WRITE ${register.address}=${String(value)}`, note: "手动修改寄存器当前值" });
      exceptionStats.ok += 1;
      return { ok: true };
    },
    applyScene: (scenarioId) => {
      const scenario = profile.scenarios.find((candidate) => candidate.id === scenarioId);
      if (!scenario) return { ok: false, reason: "场景不存在。" };
      for (const step of scenario.steps) {
        const register = memory.get(step.registerId);
        if (!register) continue;
        register.currentValue = computeScenarioValue(register, step);
        memory.set(register.id, register);
      }
      exceptionStats[scenario.faultInjection.mode] += 1;
      frameLogs.unshift({ direction: "response", time: "现在", frame: scenario.faultInjection.mode, note: `应用仿真场景：${scenario.name}` });
      return { ok: true };
    },
    getExceptionStats: () => ({ ...exceptionStats }),
    getFrameLogs: () => [...frameLogs],
  };
}

function computeScenarioValue(register: DeviceRegister, step: ScenarioStep): DeviceRegister["currentValue"] {
  const current = Number(register.currentValue) || 0;
  switch (step.strategy) {
    case "random": {
      const min = step.min ?? register.range?.min ?? 0;
      const max = step.max ?? register.range?.max ?? 100;
      return Number(((min + max) / 2).toFixed(2));
    }
    case "increment":
      return current + (step.step ?? 1);
    case "decrement":
      return current - (step.step ?? 1);
    case "sine":
      return Number(((step.offset ?? 0) + (step.amplitude ?? 1) * Math.sin(Math.PI / 4)).toFixed(2));
    case "fixed":
    default:
      return step.value ?? current;
  }
}
