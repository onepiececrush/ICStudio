import assert from "node:assert/strict";
import test from "node:test";
import {
  dashboardCoreKpiPointIds,
  inspectPointBinding,
  monitorPointIds,
  parameterPointIds,
  pointBindingRegistry,
} from "../src/pointBinding/registry";

const requiredTraceKeys = [
  "componentId",
  "pageName",
  "deviceInstance",
  "protocolVersion",
  "registerAddress",
  "functionCode",
  "dataType",
  "byteOrder",
  "scale",
  "offset",
  "unit",
  "rawRegisterValue",
  "engineeringValue",
  "formattedValue",
  "lastUpdateTime",
  "lastRequestFrame",
  "lastResponseFrame",
  "latencyMs",
  "communicationStatus",
] as const;

test("dashboard core KPIs expose complete point binding traces", () => {
  assert.deepEqual(dashboardCoreKpiPointIds, [
    "home.kpi.pcs-online",
    "home.kpi.system-state",
    "home.kpi.active-power",
    "home.kpi.reactive-power",
    "home.kpi.dc-voltage",
    "home.kpi.battery-current",
    "home.kpi.current-alarms",
  ]);

  for (const pointId of dashboardCoreKpiPointIds) {
    const trace = inspectPointBinding(pointId);
    assert.equal(trace.kind, "bound", `${pointId} should be bound`);
    for (const key of requiredTraceKeys) {
      assert.notEqual(trace[key], undefined, `${pointId} should include ${key}`);
    }
    assert.match(trace.componentId, /^Home/, `${pointId} component id should identify the home widget`);
    assert.equal(trace.pageName, "首页");
    assert.match(trace.lastRequestFrame, /^[0-9A-F]{2}( [0-9A-F]{2})+$/);
    assert.match(trace.lastResponseFrame, /^[0-9A-F]{2}( [0-9A-F]{2})+$/);
    assert.ok(trace.diagnostics.length >= 1, `${pointId} should include diagnostics`);
  }
});

test("dashboard topology, PCS matrix, and health cards are covered by traceable point ids", () => {
  const ids = Object.keys(pointBindingRegistry);
  assert.ok(ids.filter((id) => id.startsWith("home.pcs.")).length >= 16, "every PCS matrix card should have a trace id");
  for (const subsystem of ["bms", "liquid-cooling", "environment", "meter", "transformer"]) {
    assert.ok(ids.some((id) => id.includes(subsystem)), `${subsystem} health card should have a trace id`);
  }
  for (const topology of ["grid-frequency", "pcs-total-active-power", "battery-soc", "liquid-outlet-temp", "meter-active-power", "transformer-winding-temp"]) {
    assert.equal(inspectPointBinding(`home.topology.${topology}`).kind, "bound", `${topology} topology value should be traceable`);
  }
});

test("monitor and parameter pages expose clickable value traces", () => {
  assert.ok(monitorPointIds.length >= 8, "real-time monitor should expose several data values");
  assert.ok(parameterPointIds.length >= 8, "parameter configuration should expose several data values");

  for (const pointId of monitorPointIds) {
    const trace = inspectPointBinding(pointId);
    assert.equal(trace.kind, "bound");
    assert.equal(trace.pageName, "实时监控");
    assert.ok(trace.formattedValue.length > 0);
  }

  for (const pointId of parameterPointIds) {
    const trace = inspectPointBinding(pointId);
    assert.equal(trace.kind, "bound");
    assert.equal(trace.pageName, "参数配置");
    assert.ok(trace.formattedValue.length > 0);
  }
});

test("inspector reports unbound, communication failure, and simulator comparison diagnostics", () => {
  const missing = inspectPointBinding("unknown.widget.value");
  assert.equal(missing.kind, "unbound");
  assert.equal(missing.diagnostics[0]?.code, "NO_BINDING");

  const timeout = inspectPointBinding("home.kpi.current-alarms");
  assert.equal(timeout.kind, "bound");
  assert.ok(timeout.diagnostics.some((item) => item.code === "COMM_TIMEOUT"), "communication failure reason should be visible");

  const simulatorChecked = inspectPointBinding("monitor.bms.soc");
  assert.equal(simulatorChecked.kind, "bound");
  assert.ok(simulatorChecked.simulatorExpectation, "self-test mode should include expected simulator value");
  assert.equal(simulatorChecked.simulatorExpectation?.status, "match");
});
