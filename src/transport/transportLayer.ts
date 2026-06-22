import type { CommunicationType } from "../protocol/deviceProfile";

export type TransportKind = "modbus-tcp" | "modbus-rtu" | "can" | "custom-tcp";

export type TcpListenConfig = {
  ip: string;
  port: number;
};

export type RtuListenConfig = {
  serialPort: string;
  baudRate: number;
  slaveId: number;
};

export type TransportListenConfig = {
  tcp: TcpListenConfig;
  rtu: RtuListenConfig;
  future: TransportKind[];
};

export const defaultTransportListenConfig: TransportListenConfig = {
  tcp: { ip: "0.0.0.0", port: 502 },
  rtu: { serialPort: "COM3 / tty.usbserial", baudRate: 9600, slaveId: 1 },
  future: ["can", "custom-tcp"],
};

export function resolveTransportKind(communicationType: CommunicationType): TransportKind {
  const normalized = communicationType.toLowerCase();
  if (normalized.includes("rtu")) return "modbus-rtu";
  if (normalized.includes("can")) return "can";
  if (normalized.includes("custom")) return "custom-tcp";
  return "modbus-tcp";
}
