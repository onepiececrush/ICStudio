import { expectedLengthForType } from "./fieldMapper";
import { getRegisterSpan, type DeviceProfile, type DeviceRegister } from "./deviceProfile";

export type ValidationSeverity = "error" | "warning" | "info";

export type ValidationItem = {
  severity: ValidationSeverity;
  code: string;
  message: string;
  registerId?: string;
  address?: number;
};

export type ValidationResult = {
  status: "valid" | "error" | "warning";
  canStartSimulation: boolean;
  items: ValidationItem[];
};

const validAccess = new Set(["read", "write", "readWrite"]);

export function validateDeviceProfile(profile: DeviceProfile): ValidationResult {
  const items: ValidationItem[] = [];

  if (profile.registers.length === 0) {
    items.push({ severity: "error", code: "REGISTER_EMPTY", message: "协议没有任何寄存器，无法启动模拟。" });
  }

  for (const register of profile.registers) {
    validateRegister(register, items);
  }

  validateDuplicateAddresses(profile.registers, items);
  validateRegisterOverlaps(profile.registers, items);

  if (!items.some((item) => item.severity === "info")) {
    items.push({ severity: "info", code: "PROFILE_READY", message: "协议已转换为统一 Device Profile，运行时不依赖原始导入文件。" });
  }

  const hasErrors = items.some((item) => item.severity === "error");
  const hasWarnings = items.some((item) => item.severity === "warning");
  return {
    status: hasErrors ? "error" : hasWarnings ? "warning" : "valid",
    canStartSimulation: !hasErrors,
    items,
  };
}

export function countValidationBySeverity(result: Pick<ValidationResult, "items">): Record<ValidationSeverity, number> {
  return result.items.reduce<Record<ValidationSeverity, number>>(
    (counts, item) => {
      counts[item.severity] += 1;
      return counts;
    },
    { error: 0, warning: 0, info: 0 },
  );
}

function validateRegister(register: DeviceRegister, items: ValidationItem[]) {
  const context = { registerId: register.id, address: register.address };

  if (!Number.isFinite(register.address)) {
    items.push({ ...context, severity: "error", code: "ADDRESS_REQUIRED", message: `${register.name} 地址为空或不是数字。` });
  }

  if (!validAccess.has(register.access)) {
    items.push({ ...context, severity: "error", code: "ACCESS_INVALID", message: `${register.name} 读写权限异常：${register.access || "空"}。` });
  }

  const expectedLength = expectedLengthForType(register.dataType);
  if (register.dataType !== "string" && register.length !== expectedLength) {
    items.push({
      ...context,
      severity: "error",
      code: "TYPE_LENGTH_MISMATCH",
      message: `${register.name} 数据类型 ${register.dataType} 与长度 ${register.length} 不匹配，应为 ${expectedLength}。`,
    });
  }

  if (register.range && register.range.min > register.range.max) {
    items.push({ ...context, severity: "error", code: "RANGE_INVALID", message: `${register.name} 范围异常：最小值大于最大值。` });
  }

  const enumValues = new Map<string, string>();
  for (const option of register.enum) {
    const key = String(option.value);
    if (enumValues.has(key) && enumValues.get(key) !== option.label) {
      items.push({ ...context, severity: "warning", code: "ENUM_CONFLICT", message: `${register.name} 枚举值 ${key} 对应多个含义。` });
    }
    enumValues.set(key, option.label);
  }

  const bitLimit = Math.max(register.length, 1) * 16;
  for (const bit of register.bits) {
    if (bit.bit < 0 || bit.bit >= bitLimit) {
      items.push({ ...context, severity: "error", code: "BIT_OUT_OF_RANGE", message: `${register.name} bit ${bit.bit} 超出 0-${bitLimit - 1}。` });
    }
  }
}

function validateDuplicateAddresses(registers: DeviceRegister[], items: ValidationItem[]) {
  const seen = new Map<number, DeviceRegister>();
  for (const register of registers) {
    if (!Number.isFinite(register.address)) continue;
    const previous = seen.get(register.address);
    if (previous) {
      items.push({
        severity: "error",
        code: "ADDRESS_DUPLICATE",
        message: `${register.name} 与 ${previous.name} 地址重复：${register.address}。`,
        registerId: register.id,
        address: register.address,
      });
    } else {
      seen.set(register.address, register);
    }
  }
}

function validateRegisterOverlaps(registers: DeviceRegister[], items: ValidationItem[]) {
  const spans = registers
    .filter((register) => Number.isFinite(register.address))
    .map((register) => ({ register, ...getRegisterSpan(register) }))
    .sort((left, right) => left.start - right.start || left.register.id.localeCompare(right.register.id));

  for (let index = 1; index < spans.length; index += 1) {
    const previous = spans[index - 1];
    const current = spans[index];
    if (!previous || !current) continue;
    if (current.start <= previous.end && current.register.address !== previous.register.address) {
      items.push({
        severity: "error",
        code: "REGISTER_OVERLAP",
        message: `${current.register.name} 与 ${previous.register.name} 寄存器区间重叠。`,
        registerId: current.register.id,
        address: current.register.address,
      });
    }
  }
}
