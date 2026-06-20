class SimulatorProfile {
  const SimulatorProfile({
    required this.id,
    required this.name,
    required this.version,
    required this.deviceType,
    required this.vendor,
    required this.communicationType,
    required this.registers,
    required this.scenarios,
  });

  final String id;
  final String name;
  final String version;
  final String deviceType;
  final String vendor;
  final String communicationType;
  final List<SimulatorRegister> registers;
  final List<SimulatorScenario> scenarios;

  SimulatorProfile copyWith({List<SimulatorRegister>? registers}) =>
      SimulatorProfile(
        id: id,
        name: name,
        version: version,
        deviceType: deviceType,
        vendor: vendor,
        communicationType: communicationType,
        registers: registers ?? this.registers,
        scenarios: scenarios,
      );
}

class SimulatorRegister {
  const SimulatorRegister({
    required this.id,
    required this.address,
    required this.name,
    required this.functionCode,
    required this.access,
    required this.dataType,
    required this.length,
    required this.scale,
    required this.unit,
    required this.group,
    required this.value,
    this.rangeMin,
    this.rangeMax,
    this.description = '',
  });

  final String id;
  final int address;
  final String name;
  final int functionCode;
  final String access;
  final String dataType;
  final int length;
  final double scale;
  final String unit;
  final double? rangeMin;
  final double? rangeMax;
  final String description;
  final String group;
  final double value;

  bool get writable => access == 'write' || access == 'readWrite';

  SimulatorRegister copyWith({double? value}) => SimulatorRegister(
    id: id,
    address: address,
    name: name,
    functionCode: functionCode,
    access: access,
    dataType: dataType,
    length: length,
    scale: scale,
    unit: unit,
    rangeMin: rangeMin,
    rangeMax: rangeMax,
    description: description,
    group: group,
    value: value ?? this.value,
  );
}

class SimulatorScenario {
  const SimulatorScenario({
    required this.id,
    required this.name,
    required this.description,
    required this.steps,
    this.faultMode = 'none',
    this.exceptionCode = 3,
    this.rate = 0,
  });

  final String id;
  final String name;
  final String description;
  final List<SimulatorScenarioStep> steps;
  final String faultMode;
  final int exceptionCode;
  final double rate;
}

class SimulatorScenarioStep {
  const SimulatorScenarioStep({
    required this.registerId,
    required this.strategy,
    this.value,
    this.min,
    this.max,
    this.step,
    this.amplitude,
    this.offset,
  });

  final String registerId;
  final String strategy;
  final double? value;
  final double? min;
  final double? max;
  final double? step;
  final double? amplitude;
  final double? offset;
}

const seedSimulatorProfiles = [
  SimulatorProfile(
    id: 'universal-power-interface-v1',
    name: '通用功率设备接口',
    version: '1.0.0',
    deviceType: '通用功率控制单元',
    vendor: '开放协议实验室',
    communicationType: 'Modbus TCP',
    registers: [
      SimulatorRegister(
        id: 'run-mode',
        address: 40001,
        name: '运行模式',
        functionCode: 3,
        access: 'readWrite',
        dataType: 'uint16',
        length: 1,
        scale: 1,
        unit: '',
        rangeMin: 0,
        rangeMax: 5,
        description: '由 Device Profile 定义的通用状态字。',
        group: '状态',
        value: 1,
      ),
      SimulatorRegister(
        id: 'active-power',
        address: 40002,
        name: '有功设定',
        functionCode: 6,
        access: 'readWrite',
        dataType: 'int16',
        length: 1,
        scale: 0.1,
        unit: 'kW',
        rangeMin: -500,
        rangeMax: 500,
        group: '控制',
        value: 120,
      ),
      SimulatorRegister(
        id: 'dc-voltage',
        address: 40003,
        name: '直流电压',
        functionCode: 3,
        access: 'read',
        dataType: 'uint16',
        length: 1,
        scale: 0.1,
        unit: 'V',
        rangeMin: 0,
        rangeMax: 1200,
        group: '遥测',
        value: 748.2,
      ),
      SimulatorRegister(
        id: 'fault-word',
        address: 40004,
        name: '故障字',
        functionCode: 3,
        access: 'read',
        dataType: 'bitfield',
        length: 1,
        scale: 1,
        unit: '',
        rangeMin: 0,
        rangeMax: 65535,
        group: '告警',
        value: 0,
      ),
      SimulatorRegister(
        id: 'temperature',
        address: 40005,
        name: '温度采样',
        functionCode: 4,
        access: 'read',
        dataType: 'int16',
        length: 1,
        scale: 0.1,
        unit: '℃',
        rangeMin: -40,
        rangeMax: 125,
        group: '遥测',
        value: 26.5,
      ),
    ],
    scenarios: [
      SimulatorScenario(
        id: 'normal',
        name: '正常运行',
        description: '状态、功率、温度保持在正常范围。',
        steps: [
          SimulatorScenarioStep(
            registerId: 'run-mode',
            strategy: 'fixed',
            value: 1,
          ),
          SimulatorScenarioStep(
            registerId: 'active-power',
            strategy: 'sine',
            amplitude: 30,
            offset: 120,
          ),
          SimulatorScenarioStep(
            registerId: 'temperature',
            strategy: 'random',
            min: 24,
            max: 32,
          ),
          SimulatorScenarioStep(
            registerId: 'fault-word',
            strategy: 'fixed',
            value: 0,
          ),
        ],
      ),
      SimulatorScenario(
        id: 'standby',
        name: '待机',
        description: '批量将运行模式和功率归零。',
        steps: [
          SimulatorScenarioStep(
            registerId: 'run-mode',
            strategy: 'fixed',
            value: 0,
          ),
          SimulatorScenarioStep(
            registerId: 'active-power',
            strategy: 'fixed',
            value: 0,
          ),
        ],
      ),
      SimulatorScenario(
        id: 'charging',
        name: '充电',
        description: '递增设定值，模拟充电过程。',
        steps: [
          SimulatorScenarioStep(
            registerId: 'run-mode',
            strategy: 'fixed',
            value: 2,
          ),
          SimulatorScenarioStep(
            registerId: 'active-power',
            strategy: 'increment',
            step: 25,
          ),
          SimulatorScenarioStep(
            registerId: 'dc-voltage',
            strategy: 'random',
            min: 720,
            max: 780,
          ),
        ],
      ),
      SimulatorScenario(
        id: 'discharging',
        name: '放电',
        description: '递减设定值，模拟放电过程。',
        steps: [
          SimulatorScenarioStep(
            registerId: 'run-mode',
            strategy: 'fixed',
            value: 3,
          ),
          SimulatorScenarioStep(
            registerId: 'active-power',
            strategy: 'decrement',
            step: 30,
          ),
        ],
      ),
      SimulatorScenario(
        id: 'fault',
        name: '故障',
        description: '写入故障字，并注入 Modbus 异常码。',
        steps: [
          SimulatorScenarioStep(
            registerId: 'run-mode',
            strategy: 'fixed',
            value: 4,
          ),
          SimulatorScenarioStep(
            registerId: 'fault-word',
            strategy: 'fixed',
            value: 3,
          ),
        ],
        faultMode: 'exceptionCode',
        exceptionCode: 3,
        rate: 1,
      ),
      SimulatorScenario(
        id: 'communication-abnormal',
        name: '通信异常',
        description: '保持寄存器值并按比例模拟超时。',
        steps: [
          SimulatorScenarioStep(
            registerId: 'run-mode',
            strategy: 'fixed',
            value: 5,
          ),
        ],
        faultMode: 'timeout',
        rate: 0.6,
      ),
      SimulatorScenario(
        id: 'no-response',
        name: '不响应注入',
        description: '主站请求后不返回响应。',
        steps: [],
        faultMode: 'noResponse',
        rate: 1,
      ),
      SimulatorScenario(
        id: 'out-of-range',
        name: '数据越界注入',
        description: '返回非法数据地址异常。',
        steps: [],
        faultMode: 'outOfRange',
        rate: 1,
      ),
    ],
  ),
  SimulatorProfile(
    id: 'environment-controller-v2',
    name: '环境控制器通用表',
    version: '2.1.0',
    deviceType: '环境控制单元',
    vendor: '开放协议实验室',
    communicationType: 'Modbus RTU',
    registers: [
      SimulatorRegister(
        id: 'env-mode',
        address: 30001,
        name: '工作状态',
        functionCode: 4,
        access: 'read',
        dataType: 'uint16',
        length: 1,
        scale: 1,
        unit: '',
        rangeMin: 0,
        rangeMax: 2,
        group: '状态',
        value: 1,
      ),
      SimulatorRegister(
        id: 'ambient-temp',
        address: 30002,
        name: '环境温度',
        functionCode: 4,
        access: 'read',
        dataType: 'int16',
        length: 1,
        scale: 0.1,
        unit: '℃',
        rangeMin: -40,
        rangeMax: 85,
        group: '遥测',
        value: 23.4,
      ),
    ],
    scenarios: [
      SimulatorScenario(
        id: 'normal',
        name: '正常运行',
        description: '环境参数稳定。',
        steps: [
          SimulatorScenarioStep(
            registerId: 'env-mode',
            strategy: 'fixed',
            value: 1,
          ),
          SimulatorScenarioStep(
            registerId: 'ambient-temp',
            strategy: 'sine',
            amplitude: 2,
            offset: 24,
          ),
        ],
      ),
      SimulatorScenario(
        id: 'communication-abnormal',
        name: '通信异常',
        description: '模拟不响应。',
        steps: [],
        faultMode: 'noResponse',
        rate: 1,
      ),
    ],
  ),
];
