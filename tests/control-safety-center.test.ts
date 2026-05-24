import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTROL_SAFETY_HIGH_RISK_OPERATIONS,
  createControlSafetyCenter,
  type ControlCommandRequest,
  type ControlSafetyContext,
} from "../src/control/controlSafetyCenter";

const baseContext: ControlSafetyContext = {
  now: () => "2026-05-24T00:00:00.000Z",
  user: {
    id: "u-admin",
    name: "admin",
    permissions: ["control:execute", "control:power", "control:parameters", "control:upgrade", "simulator:fault"],
  },
  device: {
    id: "pcs-1",
    name: "PCS-01",
    connected: true,
    mode: "real-device",
    state: "standby",
    writableScopes: ["pcs", "bms", "simulator"],
  },
  confirm: async () => true,
  transport: {
    read: async () => 0,
    write: async () => ({ ok: true, response: "ACK" }),
  },
};

function request(overrides: Partial<ControlCommandRequest> = {}): ControlCommandRequest {
  return {
    operation: "active-power-setpoint",
    label: "有功功率给定",
    deviceId: "pcs-1",
    deviceScope: "pcs",
    requiredPermission: "control:power",
    address: 14006,
    value: 500,
    range: { min: -1000, max: 1000, unit: "kW" },
    expectedReadback: 500,
    allowedStates: ["standby", "running"],
    requiresConfirmation: true,
    ...overrides,
  };
}

test("declares every documented high-risk operation as guarded", () => {
  assert.deepEqual(CONTROL_SAFETY_HIGH_RISK_OPERATIONS, [
    "start",
    "stop",
    "reset",
    "emergency-stop",
    "active-power-setpoint",
    "reactive-power-setpoint",
    "parameter-batch-write",
    "fault-clear",
    "firmware-upgrade",
    "simulator-fault-injection",
  ]);
});

test("executes high-risk command only after permission, scope, state, self-test, range and confirmation checks, then write/readback/log", async () => {
  const events: string[] = [];
  const memory = new Map<number, unknown>([[14006, 0]]);
  const center = createControlSafetyCenter({
    ...baseContext,
    confirm: async (challenge) => {
      events.push(`confirm:${challenge.operation}:${challenge.warningLevel}`);
      assert.match(challenge.message, /有功功率给定/);
      assert.match(challenge.message, /500/);
      return true;
    },
    transport: {
      read: async (readback) => {
        events.push(`read:${readback.address}`);
        return memory.get(readback.address);
      },
      write: async (command) => {
        events.push(`write:${command.address}=${String(command.value)}`);
        memory.set(command.address, command.value);
        return { ok: true, response: "ACK" };
      },
    },
  });

  const result = await center.execute(request());

  assert.equal(result.ok, true);
  assert.equal(result.reason, undefined);
  assert.deepEqual(events, ["confirm:active-power-setpoint:danger", "read:14006", "write:14006=500", "read:14006"]);
  assert.equal(center.getLogs().length, 1);
  assert.deepEqual(center.getLogs()[0], {
    time: "2026-05-24T00:00:00.000Z",
    user: "admin",
    operation: "有功功率给定",
    device: "PCS-01",
    address: "14006",
    writeValue: 500,
    beforeValue: 0,
    afterValue: 500,
    result: "success",
    failureReason: "",
    mode: "real-device",
  });
});

test("blocks missing permission, disconnected device, unsafe state, real-device self-test-only operations and rejected confirmation with explicit reasons and logs", async () => {
  const cases: Array<[string, ControlSafetyContext, Partial<ControlCommandRequest>, RegExp]> = [
    ["permission", { ...baseContext, user: { ...baseContext.user, permissions: [] } }, {}, /权限不足/],
    ["connection", { ...baseContext, device: { ...baseContext.device, connected: false } }, {}, /设备未连接/],
    ["state", { ...baseContext, device: { ...baseContext.device, state: "fault" } }, {}, /设备状态不允许/],
    ["self-test", baseContext, { selfTestOnly: true, operation: "simulator-fault-injection", label: "从机模拟故障注入", requiredPermission: "simulator:fault" }, /仅允许在自测模式/],
    ["confirm", { ...baseContext, confirm: async () => false }, {}, /用户取消二次确认/],
  ];

  for (const [name, context, overrides, reason] of cases) {
    const center = createControlSafetyCenter(context);
    const result = await center.execute(request(overrides));
    assert.equal(result.ok, false, name);
    assert.match(result.reason ?? "", reason, name);
    assert.equal(center.getLogs().length, 1, name);
    assert.match(center.getLogs()[0].failureReason, reason, name);
    assert.equal(center.getLogs()[0].result, "failed", name);
  }
});

test("validates setpoint ranges before writing and logs the exact failure reason", async () => {
  let writeCount = 0;
  const center = createControlSafetyCenter({
    ...baseContext,
    transport: {
      read: async () => 0,
      write: async () => {
        writeCount += 1;
        return { ok: true };
      },
    },
  });

  const result = await center.execute(request({ value: 1500 }));

  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /超出范围 -1000 ~ 1000 kW/);
  assert.equal(writeCount, 0);
  assert.equal(center.getLogs()[0].writeValue, 1500);
  assert.match(center.getLogs()[0].failureReason, /超出范围/);
});

test("fails when transport write or readback verification fails, preserving before and after values in operation log", async () => {
  const writeFailure = createControlSafetyCenter({
    ...baseContext,
    transport: {
      read: async () => 12,
      write: async () => ({ ok: false, error: "Modbus 异常码 03" }),
    },
  });
  const writeResult = await writeFailure.execute(request({ value: 66, expectedReadback: 66 }));
  assert.equal(writeResult.ok, false);
  assert.match(writeResult.reason ?? "", /Modbus 异常码 03/);
  assert.deepEqual(writeFailure.getLogs()[0], {
    time: "2026-05-24T00:00:00.000Z",
    user: "admin",
    operation: "有功功率给定",
    device: "PCS-01",
    address: "14006",
    writeValue: 66,
    beforeValue: 12,
    afterValue: "未回读",
    result: "failed",
    failureReason: "写入失败: Modbus 异常码 03",
    mode: "real-device",
  });

  const readbackFailure = createControlSafetyCenter({
    ...baseContext,
    transport: {
      read: async () => 65,
      write: async () => ({ ok: true }),
    },
  });
  const readbackResult = await readbackFailure.execute(request({ value: 66, expectedReadback: 66 }));
  assert.equal(readbackResult.ok, false);
  assert.match(readbackResult.reason ?? "", /回读校验失败/);
  assert.equal(readbackFailure.getLogs()[0].beforeValue, 65);
  assert.equal(readbackFailure.getLogs()[0].afterValue, 65);
});

test("logs thrown transport write and readback errors with explicit failure reasons", async () => {
  const writeThrows = createControlSafetyCenter({
    ...baseContext,
    transport: {
      read: async () => 12,
      write: async () => {
        throw new Error("Tauri invoke rejected");
      },
    },
  });

  const writeResult = await writeThrows.execute(request({ value: 77, expectedReadback: 77 }));

  assert.equal(writeResult.ok, false);
  assert.match(writeResult.reason ?? "", /Tauri invoke rejected/);
  assert.deepEqual(writeThrows.getLogs()[0], {
    time: "2026-05-24T00:00:00.000Z",
    user: "admin",
    operation: "有功功率给定",
    device: "PCS-01",
    address: "14006",
    writeValue: 77,
    beforeValue: 12,
    afterValue: "未回读",
    result: "failed",
    failureReason: "写入失败: Tauri invoke rejected",
    mode: "real-device",
  });

  const readbackThrows = createControlSafetyCenter({
    ...baseContext,
    transport: {
      read: async () => {
        throw new Error("read timeout");
      },
      write: async () => ({ ok: true }),
    },
  });

  const readbackResult = await readbackThrows.execute(request({ value: 88, expectedReadback: 88 }));

  assert.equal(readbackResult.ok, false);
  assert.match(readbackResult.reason ?? "", /回读失败: read timeout/);
  assert.equal(readbackThrows.getLogs()[0].beforeValue, "未读取");
  assert.equal(readbackThrows.getLogs()[0].afterValue, "回读失败");
  assert.equal(readbackThrows.getLogs()[0].failureReason, "回读失败: read timeout");
});

test("logs thrown batch write errors with the failed address and preserves earlier successful rows", async () => {
  const memory = new Map<number, unknown>([[41001, 1], [41002, 2]]);
  const center = createControlSafetyCenter({
    ...baseContext,
    transport: {
      read: async ({ address }) => memory.get(address),
      write: async ({ address, value }) => {
        if (address === 41002) throw new Error("batch write timeout");
        memory.set(address, value);
        return { ok: true };
      },
    },
  });

  const result = await center.execute(request({
    operation: "parameter-batch-write",
    label: "参数批量写入",
    requiredPermission: "control:parameters",
    address: undefined,
    value: undefined,
    range: undefined,
    expectedReadback: undefined,
    batch: [
      { address: 41001, value: 10, expectedReadback: 10, range: { min: 0, max: 100 } },
      { address: 41002, value: 20, expectedReadback: 20, range: { min: 0, max: 100 } },
    ],
  }));

  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /batch write timeout/);
  assert.deepEqual(center.getLogs().map((entry) => [entry.address, entry.beforeValue, entry.writeValue, entry.afterValue, entry.result, entry.failureReason]), [
    ["41001", 1, 10, 10, "success", ""],
    ["41002", 2, 20, "未回读", "failed", "写入失败: batch write timeout"],
  ]);
});

test("supports batch parameter write with per-address before/after log rows", async () => {
  const memory = new Map<number, unknown>([[41001, 1], [41002, 2]]);
  const center = createControlSafetyCenter({
    ...baseContext,
    transport: {
      read: async ({ address }) => memory.get(address),
      write: async ({ address, value }) => {
        memory.set(address, value);
        return { ok: true };
      },
    },
  });

  const result = await center.execute(request({
    operation: "parameter-batch-write",
    label: "参数批量写入",
    requiredPermission: "control:parameters",
    address: undefined,
    value: undefined,
    range: undefined,
    expectedReadback: undefined,
    batch: [
      { address: 41001, value: 10, expectedReadback: 10, range: { min: 0, max: 100 } },
      { address: 41002, value: 20, expectedReadback: 20, range: { min: 0, max: 100 } },
    ],
  }));

  assert.equal(result.ok, true);
  assert.deepEqual(center.getLogs().map((entry) => [entry.address, entry.beforeValue, entry.writeValue, entry.afterValue, entry.result]), [
    ["41001", 1, 10, 10, "success"],
    ["41002", 2, 20, 20, "success"],
  ]);
});

test("always performs write-after-readback verification even without explicit expectedReadback", async () => {
  const center = createControlSafetyCenter({
    ...baseContext,
    transport: {
      read: async () => 0,
      write: async () => ({ ok: true }),
    },
  });

  const result = await center.execute(request({ expectedReadback: undefined, value: 88 }));

  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /回读校验失败/);
  assert.equal(center.getLogs()[0].beforeValue, 0);
  assert.equal(center.getLogs()[0].afterValue, 0);
});
