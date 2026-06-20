import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:icstudio_flutter/app/icstudio_app.dart';
import 'package:icstudio_flutter/features/dashboard/dashboard_page.dart';
import 'package:icstudio_flutter/src/rust/api/backend.dart';
import 'package:icstudio_flutter/src/rust/api/connection.dart';
import 'package:icstudio_flutter/src/rust/api/snapshot.dart';

void main() {
  testWidgets('fits the minimum macOS desktop window without overflow', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(960, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      ICStudioApp(
        backendStatus: backendStatusFixture,
        snapshot: snapshotFixture,
      ),
    );

    expect(find.text('工程总览'), findsOneWidget);
    expect(find.byKey(const Key('window-close')), findsOneWidget);
    expect(find.byKey(const Key('window-minimize')), findsOneWidget);
    expect(find.byKey(const Key('window-maximize')), findsOneWidget);
    expect(find.text('Modbus TCP 连接'), findsOneWidget);
    expect(find.text('内置闭环自测'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('shows the Rust-backed dashboard and navigates modules', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(1400, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      ICStudioApp(
        backendStatus: backendStatusFixture,
        snapshot: snapshotFixture,
      ),
    );

    expect(find.text('EVE储能项目'), findsOneWidget);
    expect(find.text('Rust Core'), findsOneWidget);
    expect(find.text('系统健康度'), findsOneWidget);
    expect(find.text('PCS-01'), findsOneWidget);
    expect(find.text('等待首页设备连接'), findsOneWidget);
    expect(find.text('Modbus TCP 连接'), findsOneWidget);
    expect(find.text('内置闭环自测'), findsOneWidget);
    expect(find.text('启动自测'), findsOneWidget);
    expect(
      tester
          .widget<FilledButton>(find.byKey(const Key('start-self-test')))
          .onPressed,
      isNotNull,
    );
    expect(
      tester
          .widget<OutlinedButton>(find.byKey(const Key('stop-self-test')))
          .onPressed,
      isNull,
    );

    await tester.enterText(find.byType(TextField).at(1), '0');
    await tester.tap(find.widgetWithText(FilledButton, '连接设备'));
    await tester.pump();

    expect(find.text('端口必须在 1..65535'), findsOneWidget);

    await tester.tap(find.text('通信调试'));
    await tester.pumpAndSettle();

    expect(find.text('该模块将在后续阶段迁移'), findsOneWidget);

    await tester.tap(find.text('实时监控'));
    await tester.pumpAndSettle();

    expect(find.text('暂无实时数据'), findsOneWidget);
    expect(
      tester
          .widget<FilledButton>(find.byKey(const Key('monitor-refresh')))
          .onPressed,
      isNull,
    );
  });

  testWidgets(
    'opens the global simulator quick adjust drawer from any module',
    (WidgetTester tester) async {
      tester.view.physicalSize = const Size(1200, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(
        ICStudioApp(
          backendStatus: backendStatusFixture,
          snapshot: snapshotFixture,
        ),
      );
      tester
          .widget<OutlinedButton>(find.byKey(const Key('simulator-quick-open')))
          .onPressed!();
      await tester.pumpAndSettle();

      expect(find.text('寄存器快调'), findsOneWidget);
      expect(find.text('报文记录'), findsOneWidget);
      expect(find.byKey(const Key('simulator-quick-search')), findsOneWidget);
      expect(find.text('快速搜索结果'), findsOneWidget);

      await tester.tap(find.byKey(const Key('simulator-quick-close')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('simulator-quick-search')), findsNothing);
    },
  );

  testWidgets('shows decoded Modbus realtime values', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(1400, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: DashboardPage(
            snapshot: realtimeSnapshotFixture,
            connectionBusy: false,
            simulatorRunning: false,
            onConnect: (_, _, _) async {},
            onDisconnect: () async {},
            onRefresh: () async {},
            onStartSelfTest: () async {},
            onStopSelfTest: () async {},
          ),
        ),
      ),
    );

    await tester.scrollUntilVisible(
      find.text('1250.00 kW'),
      300,
      scrollable: find.byType(Scrollable).first,
    );

    expect(find.text('关键实时数据'), findsOneWidget);
    expect(find.text('127.0.0.1:502 · 刚刚'), findsOneWidget);
    expect(find.text('1250.00 kW'), findsOneWidget);
    expect(find.text('FC03 / 14006 · 良好'), findsOneWidget);
  });

  testWidgets('navigates to the connected realtime point table', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(1400, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      ICStudioApp(
        backendStatus: backendStatusFixture,
        snapshot: realtimeSnapshotFixture,
      ),
    );
    await tester.tap(find.text('实时监控'));
    await tester.pumpAndSettle();

    expect(find.text('实时点表 · 127.0.0.1:502'), findsOneWidget);
    expect(find.text('总有功功率'), findsOneWidget);
    expect(find.text('12500'), findsOneWidget);
    expect(find.text('1250.00 kW'), findsOneWidget);
    expect(
      tester
          .widget<FilledButton>(find.byKey(const Key('monitor-refresh')))
          .onPressed,
      isNotNull,
    );
  });
}

const backendStatusFixture = BackendStatus(
  serviceName: 'ICStudio Rust Core',
  version: '0.1.0',
  bridgeReady: true,
);

const snapshotFixture = AppSnapshot(
  project: ProjectInfo(
    name: 'EVE储能项目',
    protocolVersion: 'PCS Modbus V3.13 / BMS V1.06',
    operator_: 'admin',
  ),
  connection: ConnectionInfo(
    mode: 'Modbus TCP 主站',
    endpoint: '未连接',
    status: '未连接',
    latencyMs: 0,
    successRate: 0,
  ),
  metrics: [
    MetricCard(
      key: 'health',
      label: '系统健康度',
      value: '--',
      unit: '分',
      tone: 'blue',
      helper: '等待连接',
    ),
  ],
  devices: [
    DeviceStatus(
      name: 'PCS-01',
      deviceType: 'PCS',
      connection: '未连接',
      runtime: '未连接',
      quality: '--',
      lastSeen: '现在',
    ),
  ],
  activities: [
    ActivityItem(
      tone: 'cyan',
      title: '等待首页设备连接',
      detail: '请在首页输入下位机 IP 和端口后连接',
      time: '现在',
    ),
  ],
  trends: [TrendPoint(time: '现在', power: 0, soc: 0, quality: 0)],
);

final realtimeSnapshotFixture = AppSnapshot(
  project: snapshotFixture.project,
  connection: const ConnectionInfo(
    mode: 'Modbus TCP 主站',
    endpoint: '127.0.0.1:502',
    status: '已连接',
    latencyMs: 4,
    successRate: 100,
  ),
  metrics: snapshotFixture.metrics,
  devices: snapshotFixture.devices,
  activities: snapshotFixture.activities,
  trends: snapshotFixture.trends,
  homeDashboard: const HomeDashboard(
    endpoint: '127.0.0.1:502',
    connectionStatus: '已连接',
    lastUpdated: '刚刚',
    values: [
      HomeDashboardValue(
        address: 14006,
        name: '总有功功率',
        rawValue: 12500,
        engineeringValue: 1250,
        displayValue: '1250.00',
        unit: 'kW',
        quality: '良好',
      ),
    ],
  ),
);
