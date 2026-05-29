import type { DeviceRegister } from "../protocol/deviceProfile";

export type ParsedSimulatorRegisterInput =
  | {
      ok: true;
      currentValue: DeviceRegister["currentValue"];
      numericValue: number | null;
      rawValue: number | null;
    }
  | {
      ok: false;
      reason: string;
    };

export function formatSimulatorRegisterEditorValue(register: DeviceRegister) {
  const currentValue = toSimulatorNumericValue(register.currentValue);
  if (currentValue === null) return String(register.currentValue);
  return formatCompactNumber(currentValue);
}

export function parseSimulatorRegisterInput(register: DeviceRegister, value: string): ParsedSimulatorRegisterInput {
  if (register.dataType === "string") {
    return { ok: true, currentValue: value, numericValue: null, rawValue: null };
  }
  if (register.dataType === "bool") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "on", "yes"].includes(normalized)) return { ok: true, currentValue: true, numericValue: 1, rawValue: 1 };
    if (["0", "false", "off", "no"].includes(normalized)) return { ok: true, currentValue: false, numericValue: 0, rawValue: 0 };
    return { ok: false, reason: "布尔寄存器只支持 0/1/true/false" };
  }

  const numericInput = Number(value);
  if (!Number.isFinite(numericInput)) {
    return { ok: false, reason: "请输入有效数字" };
  }

  if (!usesRawScaledRegisterValue(register)) {
    return { ok: true, currentValue: numericInput, numericValue: numericInput, rawValue: null };
  }

  const numericValue = roundByScalePrecision(numericInput, register.scale);
  const rawValue = Math.round(numericValue / normalizedScale(register.scale));
  return { ok: true, currentValue: numericValue, numericValue, rawValue };
}

export function toSimulatorNumericValue(value: DeviceRegister["currentValue"]) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function usesRawScaledRegisterValue(register: DeviceRegister) {
  const dataType = register.dataType.toLowerCase();
  return (
    dataType.includes("uint16")
    || dataType.includes("int16")
    || dataType.includes("uint32")
    || dataType.includes("int32")
    || dataType.includes("float32")
    || dataType === "float"
    || dataType.includes("bitfield")
    || dataType.startsWith("enum")
  );
}

function normalizedScale(scale: number) {
  return Number.isFinite(scale) && scale !== 0 ? scale : 1;
}

function roundByScalePrecision(value: number, scale: number) {
  const precision = decimalPlaces(normalizedScale(scale));
  return precision ? Number(value.toFixed(precision)) : value;
}

function decimalPlaces(value: number) {
  const text = String(value);
  if (text.includes("e-")) return Math.min(Number(text.split("e-")[1]) || 0, 12);
  return Math.min(text.split(".")[1]?.length ?? 0, 12);
}

function formatCompactNumber(value: number) {
  if (!Number.isFinite(value)) return String(value);
  if (Math.abs(value - Math.round(value)) < 1e-9) return String(Math.round(value));
  return String(Number(value.toFixed(12)));
}
