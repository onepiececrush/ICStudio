import { createBlankTestCase, type TestCase, type TestStep } from "./testOrchestrator";

const templateSpecs: Array<{ id: string; name: string; deviceType: string; tags: string[]; steps: TestStep[] }> = [
  {
    id: "tpl-pmu-communication",
    name: "PMU 通信测试",
    deviceType: "PMU",
    tags: ["通信", "PMU"],
    steps: [
      { step_id: "connect", type: "connect_device", target_device: "PMU-01" },
      { step_id: "read-frequency", type: "read_point", target_device: "PMU-01", point_address: "grid-frequency" },
      { step_id: "assert-frequency", type: "assert_value", target_device: "PMU-01", point_address: "grid-frequency", value: 50, condition: { operator: ">=" } },
      { step_id: "frame", type: "check_frame", target_device: "PMU-01", condition: { contains: "READ" } },
    ],
  },
  {
    id: "tpl-pcs-online",
    name: "PCS 在线测试",
    deviceType: "PCS",
    tags: ["PCS", "在线"],
    steps: [
      { step_id: "connect", type: "connect_device", target_device: "PCS-01" },
      { step_id: "read-run-mode", type: "read_point", target_device: "PCS-01", point_address: "run-mode" },
      { step_id: "assert-online", type: "assert_enum", target_device: "PCS-01", point_address: "run-mode", value: 1, condition: { enum: { "1": "运行" }, label: "运行" } },
    ],
  },
  {
    id: "tpl-pcs-start",
    name: "PCS 启动测试",
    deviceType: "PCS",
    tags: ["PCS", "启动"],
    steps: [
      { step_id: "connect", type: "connect_device", target_device: "PCS-01" },
      { step_id: "start", type: "start_scenario", target_device: "PCS-01", condition: { scenarioId: "pcs-start" } },
      { step_id: "wait-running", type: "wait_condition", target_device: "PCS-01", point_address: "run-mode", condition: { operator: "==", value: 1 }, timeout: 5000 },
      { step_id: "screenshot", type: "capture_screenshot", target_device: "PCS-01" },
    ],
  },
  {
    id: "tpl-pcs-stop",
    name: "PCS 停止测试",
    deviceType: "PCS",
    tags: ["PCS", "停止"],
    steps: [
      { step_id: "connect", type: "connect_device", target_device: "PCS-01" },
      { step_id: "write-stop", type: "write_point", target_device: "PCS-01", point_address: "run-mode", value: 0 },
      { step_id: "assert-stop", type: "assert_value", target_device: "PCS-01", point_address: "run-mode", value: 0 },
    ],
  },
  {
    id: "tpl-pcs-power",
    name: "PCS 功率给定测试",
    deviceType: "PCS",
    tags: ["PCS", "功率"],
    steps: [
      { step_id: "connect", type: "connect_device", target_device: "PCS-01" },
      { step_id: "write-power", type: "write_point", target_device: "PCS-01", point_address: "active-power", value: 500 },
      { step_id: "read-power", type: "read_point", target_device: "PCS-01", point_address: "active-power" },
      { step_id: "assert-power", type: "assert_value", target_device: "PCS-01", point_address: "active-power", value: 500 },
    ],
  },
  {
    id: "tpl-bms-range",
    name: "BMS 数据范围测试",
    deviceType: "BMS",
    tags: ["BMS", "范围"],
    steps: [
      { step_id: "connect", type: "connect_device", target_device: "BMS-01" },
      { step_id: "read-soc", type: "read_point", target_device: "BMS-01", point_address: "soc" },
      { step_id: "assert-soc-min", type: "assert_value", target_device: "BMS-01", point_address: "soc", value: 0, condition: { operator: ">=" } },
      { step_id: "assert-soc-max", type: "assert_value", target_device: "BMS-01", point_address: "soc", value: 100, condition: { operator: "<=" } },
    ],
  },
  {
    id: "tpl-liquid-communication",
    name: "液冷通信测试",
    deviceType: "液冷",
    tags: ["液冷", "通信"],
    steps: [
      { step_id: "connect", type: "connect_device", target_device: "LCS-01" },
      { step_id: "read-temp", type: "read_point", target_device: "LCS-01", point_address: "outlet-temp" },
      { step_id: "check-frame", type: "check_frame", target_device: "LCS-01", condition: { contains: "READ" } },
    ],
  },
  {
    id: "tpl-env-estop",
    name: "动环急停测试",
    deviceType: "动环",
    tags: ["动环", "急停"],
    steps: [
      { step_id: "connect", type: "connect_device", target_device: "ENV-01" },
      { step_id: "write-estop", type: "write_point", target_device: "ENV-01", point_address: "emergency-stop", value: 1 },
      { step_id: "assert-estop-bit", type: "assert_bit", target_device: "ENV-01", point_address: "emergency-stop", condition: { bit: 0, expected: true } },
    ],
  },
  {
    id: "tpl-fault-recovery",
    name: "故障恢复测试",
    deviceType: "PCS",
    tags: ["故障", "恢复"],
    steps: [
      { step_id: "connect", type: "connect_device", target_device: "PCS-01" },
      { step_id: "inject", type: "inject_fault", target_device: "PCS-01", condition: { mode: "exceptionCode", exceptionCode: "0x03", scenarioId: "pcs-fault" } },
      { step_id: "assert-fault", type: "assert_bit", target_device: "PCS-01", point_address: "fault-word", condition: { bit: 0, expected: true } },
      { step_id: "clear", type: "clear_fault", target_device: "PCS-01", point_address: "fault-word" },
    ],
  },
  {
    id: "tpl-home-loopback",
    name: "首页自测模拟闭环测试",
    deviceType: "系统",
    tags: ["首页", "自测", "模拟器"],
    steps: [
      { step_id: "connect-sim", type: "connect_device", target_device: "内置从机模拟器" },
      { step_id: "start-normal", type: "start_scenario", target_device: "内置从机模拟器", condition: { scenarioId: "normal" } },
      { step_id: "read-kpi", type: "read_point", target_device: "内置从机模拟器", point_address: "active-power" },
      { step_id: "screenshot", type: "capture_screenshot", target_device: "首页" },
      { step_id: "report", type: "export_report", target_device: "首页" },
    ],
  },
];

export const builtInAutoTestTemplates: TestCase[] = templateSpecs.map((spec) => ({
  ...createBlankTestCase({ case_id: spec.id, case_name: spec.name, device_type: spec.deviceType }),
  tags: spec.tags,
  steps: spec.steps,
  expected: { editableTemplate: true },
}));
