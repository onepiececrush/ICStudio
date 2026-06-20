import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:icstudio_flutter/app/app_theme.dart';
import 'package:icstudio_flutter/features/simulator/device_simulator_controller.dart';
import 'package:icstudio_flutter/features/simulator/device_simulator_page.dart';
import 'package:icstudio_flutter/features/simulator/simulator_models.dart';

void main() {
  test('calculates fixed, sine, random and incremental scenario values', () {
    final profile = seedSimulatorProfiles.first;
    final normal = calculateScenarioValues(profile, profile.scenarios.first);
    final charging = calculateScenarioValues(profile, profile.scenarios[2]);

    expect(normal['run-mode'], 1);
    expect(normal['active-power'], closeTo(141.213, 0.001));
    expect(normal['temperature'], 28);
    expect(charging['active-power'], 145);
    expect(charging['dc-voltage'], 750);
  });

  testWidgets('shows the complete simulator workbench and register filters', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1200, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final controller = DeviceSimulatorController();
    addTearDown(controller.dispose);

    await tester.pumpWidget(
      MaterialApp(
        theme: buildAppTheme(),
        home: Scaffold(body: DeviceSimulatorPage(controller: controller)),
      ),
    );

    expect(find.byKey(const Key('simulator-workbench')), findsOneWidget);
    expect(find.text('从机模拟工作台'), findsOneWidget);
    expect(find.text('通用功率设备接口'), findsOneWidget);
    expect(find.text('寄存器内存表'), findsOneWidget);
    expect(find.text('运行场景与故障注入'), findsOneWidget);
    expect(find.text('直流电压'), findsOneWidget);

    await tester.tap(find.text('可写'));
    await tester.pump();

    expect(find.text('有功设定'), findsOneWidget);
    expect(find.text('直流电压'), findsNothing);

    await tester.drag(
      find.byKey(const Key('simulator-workbench')),
      const Offset(0, -1800),
    );
    await tester.pumpAndSettle();
    expect(find.text('运行诊断'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
