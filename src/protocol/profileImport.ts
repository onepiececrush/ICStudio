import { deviceProfileSchemaVersion, type DeviceProfile, type DeviceRegister, type RegisterAccess } from "./deviceProfile";
import type { PointModel, ProtocolImportArtifacts } from "./pointModel";

export type DeviceProfileImportMeta = {
  name: string;
  version: string;
  deviceType: string;
  vendor: string;
  communicationType: string;
};

export function createDeviceProfileFromPointArtifacts(meta: DeviceProfileImportMeta, artifacts: ProtocolImportArtifacts): DeviceProfile {
  const registers = artifacts.pointModels.map(pointToDeviceRegister);
  return {
    schemaVersion: deviceProfileSchemaVersion,
    id: artifacts.protocolModel.id,
    name: artifacts.protocolModel.name,
    version: artifacts.protocolModel.version,
    deviceType: meta.deviceType,
    vendor: meta.vendor,
    communicationType: meta.communicationType,
    createdAt: new Date("2026-05-23T00:00:00.000Z").toISOString(),
    source: { kind: "manual", fileName: artifacts.protocolModel.source_file },
    registers,
    scenarios: [
      {
        id: "pointmodel-preview",
        name: "PointModel 导入预览",
        description: "从通用协议导入向导 Pro 生成的默认从机模拟场景。",
        steps: registers.slice(0, 4).map((register) => ({ registerId: register.id, strategy: "fixed" as const, value: register.currentValue })),
        faultInjection: { mode: "none" },
      },
    ],
  };
}

function pointToDeviceRegister(point: PointModel): DeviceRegister {
  return {
    id: point.point_id,
    address: point.address,
    name: point.name,
    functionCode: point.area === "input_register" ? 4 : point.rw === "R/W" || point.rw === "W" ? 6 : 3,
    access: pointRwToRegisterAccess(point.rw),
    dataType: point.data_type === "float" ? "float32" : point.data_type,
    length: point.word_count,
    scale: point.scale,
    offset: point.offset,
    unit: point.unit,
    range: point.min !== undefined && point.max !== undefined ? { min: point.min, max: point.max } : undefined,
    enum: Object.entries(point.enum_map).map(([value, label]) => ({ value: Number.isFinite(Number(value)) ? Number(value) : value, label })),
    bits: Object.entries(point.bit_define)
      .filter(([bit]) => !bit.startsWith("__"))
      .map(([bit, label]) => ({ bit: Number(bit), label })),
    description: point.remark,
    group: point.group,
    currentValue: point.default_value,
  };
}

function pointRwToRegisterAccess(rw: string): RegisterAccess | string {
  if (rw === "R") return "read";
  if (rw === "W") return "write";
  if (rw === "R/W") return "readWrite";
  return rw;
}
