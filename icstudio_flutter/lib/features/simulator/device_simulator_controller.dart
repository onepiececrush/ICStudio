import 'dart:async';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:icstudio_flutter/app/window_controls.dart';
import 'package:icstudio_flutter/features/simulator/simulator_models.dart';
import 'package:icstudio_flutter/src/rust/api/device_simulator.dart';
import 'package:icstudio_flutter/src/rust/api/profile_import.dart';

class DeviceSimulatorController extends ChangeNotifier {
  DeviceSimulatorController()
    : profiles = List<SimulatorProfile>.from(seedSimulatorProfiles),
      selectedProfileId = seedSimulatorProfiles.first.id;

  final List<SimulatorProfile> profiles;
  String selectedProfileId;
  String host = '127.0.0.1';
  int port = 5020;
  int unitId = 1;
  String serialPort = '/dev/tty.usbserial';
  int baudRate = 9600;
  bool busy = false;
  DeviceSimulatorStatus? status;
  String? notice;
  bool noticeIsError = false;
  final Set<String> pinnedRegisterIds = {};
  final List<String> recentRegisterIds = [];
  final Map<String, String> lastModified = {};
  Timer? _pollTimer;

  SimulatorProfile get selectedProfile =>
      profiles.firstWhere((profile) => profile.id == selectedProfileId);
  bool get running => status?.running ?? false;

  void selectProfile(String id) {
    if (running || busy || id == selectedProfileId) return;
    selectedProfileId = id;
    notice = null;
    notifyListeners();
  }

  void updateTcpConfig({String? host, int? port, int? unitId}) {
    if (running) return;
    if (host != null) this.host = host;
    if (port != null) this.port = port;
    if (unitId != null) this.unitId = unitId;
    notifyListeners();
  }

  void updateRtuConfig({String? serialPort, int? baudRate}) {
    if (running) return;
    if (serialPort != null) this.serialPort = serialPort;
    if (baudRate != null) this.baudRate = baudRate;
    notifyListeners();
  }

  void togglePin(String id) {
    if (!pinnedRegisterIds.remove(id)) {
      if (pinnedRegisterIds.length >= 12) {
        pinnedRegisterIds.remove(pinnedRegisterIds.first);
      }
      pinnedRegisterIds.add(id);
    }
    notifyListeners();
  }

  Future<void> start() async {
    if (busy || running) return;
    if (host != '127.0.0.1' && host != 'localhost') {
      _message('为避免误开放端口，仅允许监听 127.0.0.1 或 localhost。', error: true);
      return;
    }
    if (port < 1 || port > 65535 || unitId < 1 || unitId > 247) {
      _message('端口须为 1..65535，Unit ID 须为 1..247。', error: true);
      return;
    }
    await _run(() async {
      status = await startDeviceSimulator(
        host: host,
        port: port,
        unitId: unitId,
        registers: selectedProfile.registers
            .map(
              (item) => DeviceSimulatorRegisterDefinition(
                address: item.address,
                name: item.name,
                dataType: item.dataType,
                length: item.length,
                scale: item.scale,
                unit: item.unit,
                engineeringValue: item.value,
              ),
            )
            .toList(),
      );
      _startPolling();
      _message('从机已启动：${status!.endpoint}');
    });
  }

  Future<void> stop() async {
    if (busy || !running) return;
    await _run(() async {
      _pollTimer?.cancel();
      status = stopDeviceSimulator();
      _message('从机模拟已停止');
    });
  }

  Future<bool> setRegisterValue(
    SimulatorRegister register,
    String input,
  ) async {
    final value = double.tryParse(input.trim());
    if (value == null || !value.isFinite) {
      _message('${register.name} 不是有效数值。', error: true);
      return false;
    }
    if ((register.rangeMin != null && value < register.rangeMin!) ||
        (register.rangeMax != null && value > register.rangeMax!)) {
      _message(
        '${register.name} 超出范围 ${register.rangeMin ?? '-∞'} ~ ${register.rangeMax ?? '+∞'}。',
        error: true,
      );
      return false;
    }
    try {
      if (running) {
        status = setDeviceSimulatorRegister(
          address: register.address,
          engineeringValue: value,
        );
      }
      _replaceValues({register.id: value});
      recentRegisterIds
        ..remove(register.id)
        ..insert(0, register.id);
      if (recentRegisterIds.length > 12) recentRegisterIds.removeLast();
      lastModified[register.id] = _clock();
      notice = null;
      notifyListeners();
      return true;
    } catch (error) {
      _message('${register.name} 写值失败：$error', error: true);
      return false;
    }
  }

  Future<void> applyScenario(SimulatorScenario scenario) async {
    if (busy) return;
    await _run(() async {
      final values = calculateScenarioValues(selectedProfile, scenario);
      if (running && values.isNotEmpty) {
        status = applyDeviceSimulatorValues(
          updates: selectedProfile.registers
              .where((item) => values.containsKey(item.id))
              .map(
                (item) => DeviceSimulatorValueUpdate(
                  address: item.address,
                  engineeringValue: values[item.id]!,
                ),
              )
              .toList(),
        );
      }
      if (running) {
        status = setDeviceSimulatorFault(
          mode: scenario.faultMode,
          exceptionCode: scenario.exceptionCode,
          rate: scenario.rate,
        );
      }
      _replaceValues(values);
      for (final id in values.keys) {
        recentRegisterIds
          ..remove(id)
          ..insert(0, id);
        lastModified[id] = _clock();
      }
      while (recentRegisterIds.length > 12) {
        recentRegisterIds.removeLast();
      }
      _message(
        running
            ? '已应用场景“${scenario.name}”并同步到 Rust 从机'
            : '已预置场景“${scenario.name}”，启动后生效',
      );
    });
  }

  Future<void> setFault(
    String mode, {
    int exceptionCode = 3,
    double rate = 1,
  }) async {
    if (!running) {
      _message('请先启动从机，再设置故障注入。', error: true);
      return;
    }
    await _run(() async {
      status = setDeviceSimulatorFault(
        mode: mode,
        exceptionCode: exceptionCode,
        rate: rate,
      );
      _message(mode == 'none' ? '故障注入已清除' : '故障注入已更新：$mode');
    });
  }

  Future<void> importProfile() async {
    if (busy || running) return;
    final path = await WindowControls.pickSimulatorProfile();
    if (path == null) return;
    await _run(() async {
      final imported = await importDeviceSimulatorProfile(path: path);
      final profile = _fromImported(imported);
      profiles.removeWhere((item) => item.id == profile.id);
      profiles.insert(0, profile);
      selectedProfileId = profile.id;
      _message('已导入模拟协议：${profile.name}');
    });
  }

  Future<void> refresh() async {
    if (!running) return;
    try {
      status = getDeviceSimulatorStatus();
      final values = <String, double>{};
      for (final register in selectedProfile.registers) {
        for (final runtime in status!.registers) {
          if (runtime.address == register.address) {
            values[register.id] = runtime.engineeringValue;
          }
        }
      }
      _replaceValues(values, notify: false);
      notifyListeners();
    } catch (error) {
      _pollTimer?.cancel();
      _message('刷新从机状态失败：$error', error: true);
    }
  }

  Future<void> _run(Future<void> Function() action) async {
    busy = true;
    notice = null;
    notifyListeners();
    try {
      await action();
    } catch (error) {
      _message(error.toString(), error: true);
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  void _replaceValues(Map<String, double> values, {bool notify = true}) {
    if (values.isEmpty) return;
    final index = profiles.indexWhere((item) => item.id == selectedProfileId);
    profiles[index] = selectedProfile.copyWith(
      registers: selectedProfile.registers
          .map(
            (item) => values.containsKey(item.id)
                ? item.copyWith(value: values[item.id])
                : item,
          )
          .toList(),
    );
    if (notify) notifyListeners();
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(
      const Duration(seconds: 1),
      (_) => unawaited(refresh()),
    );
  }

  void _message(String value, {bool error = false}) {
    notice = value.replaceFirst('AnyhowException(', '');
    noticeIsError = error;
    notifyListeners();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    if (running) {
      try {
        stopDeviceSimulator();
      } catch (_) {
        // Process teardown will release the localhost listener.
      }
    }
    super.dispose();
  }
}

Map<String, double> calculateScenarioValues(
  SimulatorProfile profile,
  SimulatorScenario scenario,
) {
  final values = <String, double>{};
  for (final step in scenario.steps) {
    SimulatorRegister? register;
    for (final item in profile.registers) {
      if (item.id == step.registerId) register = item;
    }
    if (register == null) continue;
    final value = switch (step.strategy) {
      'fixed' => step.value ?? register.value,
      'random' => ((step.min ?? 0) + (step.max ?? 100)) / 2,
      'increment' => register.value + (step.step ?? 1),
      'decrement' => register.value - (step.step ?? 1),
      'sine' =>
        (step.offset ?? register.value) + (step.amplitude ?? 1) * sin(pi / 4),
      _ => register.value,
    };
    values[register.id] = value
        .clamp(
          register.rangeMin ?? double.negativeInfinity,
          register.rangeMax ?? double.infinity,
        )
        .toDouble();
  }
  return values;
}

SimulatorProfile _fromImported(ImportedSimulatorProfile profile) =>
    SimulatorProfile(
      id: profile.id,
      name: profile.name,
      version: profile.version,
      deviceType: profile.deviceType,
      vendor: profile.vendor,
      communicationType: profile.communicationType,
      registers: profile.registers
          .map(
            (item) => SimulatorRegister(
              id: item.id,
              address: item.address,
              name: item.name,
              functionCode: item.functionCode,
              access: item.access,
              dataType: item.dataType,
              length: item.length,
              scale: item.scale,
              unit: item.unit,
              rangeMin: item.rangeMin,
              rangeMax: item.rangeMax,
              description: item.description,
              group: item.group,
              value: item.engineeringValue,
            ),
          )
          .toList(),
      scenarios: profile.scenarios
          .map(
            (item) => SimulatorScenario(
              id: item.id,
              name: item.name,
              description: item.description,
              faultMode: item.faultMode,
              exceptionCode: item.exceptionCode,
              rate: item.rate,
              steps: item.steps
                  .map(
                    (step) => SimulatorScenarioStep(
                      registerId: step.registerId,
                      strategy: step.strategy,
                      value: step.value,
                      min: step.min,
                      max: step.max,
                      step: step.step,
                      amplitude: step.amplitude,
                      offset: step.offset,
                    ),
                  )
                  .toList(),
            ),
          )
          .toList(),
    );

String _clock() {
  final now = DateTime.now();
  String two(int value) => value.toString().padLeft(2, '0');
  return '${two(now.hour)}:${two(now.minute)}:${two(now.second)}';
}
