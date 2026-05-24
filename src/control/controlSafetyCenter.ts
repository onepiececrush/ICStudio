export const CONTROL_SAFETY_HIGH_RISK_OPERATIONS = [
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
] as const;

export type ControlSafetyOperation = typeof CONTROL_SAFETY_HIGH_RISK_OPERATIONS[number] | string;

export type ControlSafetyUser = {
  id: string;
  name: string;
  permissions: string[];
};

export type ControlSafetyDevice = {
  id: string;
  name: string;
  connected: boolean;
  mode: "real-device" | "self-test" | "simulator" | string;
  state: string;
  writableScopes: string[];
};

export type ControlWriteRange = {
  min: number;
  max: number;
  unit?: string;
};

export type ControlBatchWriteItem = {
  address: number;
  value: unknown;
  expectedReadback?: unknown;
  range?: ControlWriteRange;
};

export type ControlCommandRequest = {
  operation: ControlSafetyOperation;
  label: string;
  deviceId: string;
  deviceScope: string;
  requiredPermission: string;
  address?: number;
  value?: unknown;
  range?: ControlWriteRange;
  expectedReadback?: unknown;
  allowedStates?: string[];
  requiresConfirmation?: boolean;
  selfTestOnly?: boolean;
  batch?: ControlBatchWriteItem[];
};

export type ControlConfirmationChallenge = {
  operation: ControlSafetyOperation;
  label: string;
  warningLevel: "info" | "warning" | "danger";
  message: string;
  value?: unknown;
};

export type ControlTransportRead = {
  operation: ControlSafetyOperation;
  deviceId: string;
  address: number;
};

export type ControlTransportWrite = ControlTransportRead & {
  value: unknown;
};

export type ControlSafetyContext = {
  now: () => string;
  user: ControlSafetyUser;
  device: ControlSafetyDevice;
  confirm: (challenge: ControlConfirmationChallenge) => Promise<boolean>;
  transport: {
    read: (request: ControlTransportRead) => Promise<unknown>;
    write: (request: ControlTransportWrite) => Promise<{ ok: boolean; response?: string; error?: string }>;
  };
};

export type ControlOperationLog = {
  time: string;
  user: string;
  operation: string;
  device: string;
  address: string;
  writeValue: unknown;
  beforeValue: unknown;
  afterValue: unknown;
  result: "success" | "failed";
  failureReason: string;
  mode: string;
};

export type ControlExecutionResult = {
  ok: boolean;
  reason?: string;
  response?: string;
};

export function createControlSafetyCenter(context: ControlSafetyContext) {
  const logs: ControlOperationLog[] = [];

  function pushLog(request: ControlCommandRequest, overrides: Partial<ControlOperationLog>) {
    logs.push({
      time: context.now(),
      user: context.user.name,
      operation: request.label,
      device: context.device.name,
      address: request.address === undefined ? "" : String(request.address),
      writeValue: request.value,
      beforeValue: "未执行",
      afterValue: "未执行",
      result: "failed",
      failureReason: "",
      mode: context.device.mode,
      ...overrides,
    });
  }

  async function execute(request: ControlCommandRequest): Promise<ControlExecutionResult> {
    const guardFailure = await runPreflightChecks(request);
    if (guardFailure) {
      pushLog(request, {
        result: "failed",
        failureReason: guardFailure,
      });
      return { ok: false, reason: guardFailure };
    }

    if (request.batch?.length) {
      return executeBatch(request);
    }

    if (request.address === undefined) {
      const reason = "缺少写入地址。";
      pushLog(request, { failureReason: reason });
      return { ok: false, reason };
    }

    const beforeValue = await safeRead(request, request.address, "未读取");
    const writeResult = await safeWrite(request, request.address, request.value, beforeValue);
    if (!writeResult.ok) return writeResult;

    const expectedReadback = request.expectedReadback !== undefined ? request.expectedReadback : request.value;
    const readbackResult = await readBack(request, request.address, beforeValue);
    if (!readbackResult.ok) return readbackResult;
    const readback = readbackResult.value;
    if (!sameValue(readback, expectedReadback)) {
      const reason = `回读校验失败: 期望 ${String(expectedReadback)}，实际 ${String(readback)}。`;
      pushLog(request, {
        address: String(request.address),
        writeValue: request.value,
        beforeValue,
        afterValue: readback,
        result: "failed",
        failureReason: reason,
      });
      return { ok: false, reason };
    }
    pushLog(request, {
      address: String(request.address),
      writeValue: request.value,
      beforeValue,
      afterValue: readback,
      result: "success",
      failureReason: "",
    });
    return { ok: true, response: writeResult.response };
  }

  async function runPreflightChecks(request: ControlCommandRequest): Promise<string | undefined> {
    if (!context.user.permissions.includes(request.requiredPermission)) return `权限不足：缺少 ${request.requiredPermission}。`;
    if (context.device.id !== request.deviceId) return `当前连接设备不匹配：期望 ${request.deviceId}，实际 ${context.device.id}。`;
    if (!context.device.connected) return "设备未连接，禁止执行控制命令。";
    if (!context.device.writableScopes.includes(request.deviceScope)) return `设备写入范围不允许：${request.deviceScope}。`;
    if (request.allowedStates?.length && !request.allowedStates.includes(context.device.state)) {
      return `设备状态不允许：当前 ${context.device.state}，允许 ${request.allowedStates.join("/")}。`;
    }
    if (request.selfTestOnly && !["self-test", "simulator"].includes(context.device.mode)) {
      return "该操作仅允许在自测模式或内置模拟器中执行。";
    }

    const rangeFailure = validateRanges(request);
    if (rangeFailure) return rangeFailure;

    if (request.requiresConfirmation || CONTROL_SAFETY_HIGH_RISK_OPERATIONS.includes(request.operation as typeof CONTROL_SAFETY_HIGH_RISK_OPERATIONS[number])) {
      const confirmed = await context.confirm({
        operation: request.operation,
        label: request.label,
        warningLevel: "danger",
        value: request.value,
        message: `即将在${context.device.mode === "real-device" ? "真实设备模式" : "自测模式"}对 ${context.device.name} 执行高危操作：${request.label}，范围 ${request.deviceScope}，写入值 ${String(request.value ?? request.batch?.length ?? "")}。请二次确认。`,
      });
      if (!confirmed) return "用户取消二次确认。";
    }

    return undefined;
  }

  function validateRanges(request: ControlCommandRequest) {
    if (request.range && typeof request.value === "number" && (request.value < request.range.min || request.value > request.range.max)) {
      return `${request.label} ${request.value} 超出范围 ${request.range.min} ~ ${request.range.max}${request.range.unit ? ` ${request.range.unit}` : ""}。`;
    }
    for (const item of request.batch ?? []) {
      if (item.range && typeof item.value === "number" && (item.value < item.range.min || item.value > item.range.max)) {
        return `${request.label} 地址 ${item.address} 的值 ${item.value} 超出范围 ${item.range.min} ~ ${item.range.max}${item.range.unit ? ` ${item.range.unit}` : ""}。`;
      }
    }
    return undefined;
  }

  async function executeBatch(request: ControlCommandRequest): Promise<ControlExecutionResult> {
    for (const item of request.batch ?? []) {
      const beforeValue = await safeRead(request, item.address, "未读取");
      const writeResult = await safeWrite(request, item.address, item.value, beforeValue);
      if (!writeResult.ok) return writeResult;
      const expectedReadback = item.expectedReadback !== undefined ? item.expectedReadback : item.value;
      const readbackResult = await readBack(request, item.address, beforeValue);
      if (!readbackResult.ok) return readbackResult;
      const afterValue = readbackResult.value;
      if (!sameValue(afterValue, expectedReadback)) {
        const reason = `回读校验失败: 地址 ${item.address} 期望 ${String(expectedReadback)}，实际 ${String(afterValue)}。`;
        pushLog(request, {
          address: String(item.address),
          writeValue: item.value,
          beforeValue,
          afterValue,
          result: "failed",
          failureReason: reason,
        });
        return { ok: false, reason };
      }
      pushLog(request, {
        address: String(item.address),
        writeValue: item.value,
        beforeValue,
        afterValue,
        result: "success",
        failureReason: "",
      });
    }
    return { ok: true };
  }

  async function safeRead(request: ControlCommandRequest, address: number, fallback: unknown) {
    try {
      return await context.transport.read({ operation: request.operation, deviceId: request.deviceId, address });
    } catch {
      return fallback;
    }
  }

  async function safeWrite(
    request: ControlCommandRequest,
    address: number,
    value: unknown,
    beforeValue: unknown,
  ): Promise<ControlExecutionResult & { response?: string }> {
    try {
      const writeResult = await context.transport.write({
        operation: request.operation,
        deviceId: request.deviceId,
        address,
        value,
      });
      if (writeResult.ok) return { ok: true, response: writeResult.response };
      const reason = `写入失败: ${writeResult.error ?? "未知错误"}`;
      pushLog(request, {
        address: String(address),
        writeValue: value,
        beforeValue,
        afterValue: "未回读",
        result: "failed",
        failureReason: reason,
      });
      return { ok: false, reason };
    } catch (error) {
      const reason = `写入失败: ${errorMessage(error)}`;
      pushLog(request, {
        address: String(address),
        writeValue: value,
        beforeValue,
        afterValue: "未回读",
        result: "failed",
        failureReason: reason,
      });
      return { ok: false, reason };
    }
  }

  async function readBack(
    request: ControlCommandRequest,
    address: number,
    beforeValue: unknown,
  ): Promise<{ ok: true; value: unknown } | { ok: false; reason: string }> {
    try {
      return {
        ok: true,
        value: await context.transport.read({ operation: request.operation, deviceId: request.deviceId, address }),
      };
    } catch (error) {
      const reason = `回读失败: ${errorMessage(error)}`;
      pushLog(request, {
        address: String(address),
        writeValue: request.batch?.find((item) => item.address === address)?.value ?? request.value,
        beforeValue,
        afterValue: "回读失败",
        result: "failed",
        failureReason: reason,
      });
      return { ok: false, reason };
    }
  }

  return {
    execute,
    getLogs: () => logs.map((log) => ({ ...log })),
    clearLogs: () => {
      logs.splice(0, logs.length);
    },
  };
}

function sameValue(left: unknown, right: unknown) {
  return Object.is(left, right) || String(left) === String(right);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "未知错误");
}
