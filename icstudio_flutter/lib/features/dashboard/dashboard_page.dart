import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:icstudio_flutter/app/app_design.dart';
import 'package:icstudio_flutter/app/app_theme.dart';
import 'package:icstudio_flutter/src/rust/api/connection.dart';
import 'package:icstudio_flutter/src/rust/api/snapshot.dart';

class DashboardPage extends StatelessWidget {
  const DashboardPage({
    required this.snapshot,
    required this.connectionBusy,
    required this.simulatorRunning,
    required this.onConnect,
    required this.onDisconnect,
    required this.onRefresh,
    required this.onStartSelfTest,
    required this.onStopSelfTest,
    this.connectionError,
    super.key,
  });

  final AppSnapshot snapshot;
  final bool connectionBusy;
  final bool simulatorRunning;
  final String? connectionError;
  final Future<void> Function(String host, int port, int unitId) onConnect;
  final Future<void> Function() onDisconnect;
  final Future<void> Function() onRefresh;
  final Future<void> Function() onStartSelfTest;
  final Future<void> Function() onStopSelfTest;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth >= 900
            ? 3
            : constraints.maxWidth >= 560
            ? 2
            : 1;
        return CustomScrollView(
          slivers: [
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(26, 24, 26, 16),
              sliver: SliverToBoxAdapter(
                child: RevealOnce(child: _Header(snapshot: snapshot)),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(26, 0, 26, 16),
              sliver: SliverToBoxAdapter(
                child: RevealOnce(
                  order: 1,
                  child: _ConnectionPanel(
                    connection: snapshot.connection,
                    busy: connectionBusy,
                    simulatorRunning: simulatorRunning,
                    error: connectionError,
                    onConnect: onConnect,
                    onDisconnect: onDisconnect,
                    onRefresh: onRefresh,
                    onStartSelfTest: onStartSelfTest,
                    onStopSelfTest: onStopSelfTest,
                  ),
                ),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: 26),
              sliver: SliverGrid.builder(
                itemCount: snapshot.metrics.length,
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: columns,
                  mainAxisExtent: 134,
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                ),
                itemBuilder: (context, index) => RevealOnce(
                  order: 2 + index,
                  child: _MetricCard(metric: snapshot.metrics[index]),
                ),
              ),
            ),
            if (snapshot.homeDashboard != null)
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(26, 16, 26, 0),
                sliver: SliverToBoxAdapter(
                  child: RevealOnce(
                    order: 3,
                    child: _RealtimeValuesPanel(
                      dashboard: snapshot.homeDashboard!,
                    ),
                  ),
                ),
              ),
            SliverPadding(
              padding: const EdgeInsets.all(26),
              sliver: SliverToBoxAdapter(
                child: RevealOnce(
                  order: 4,
                  child: Wrap(
                    spacing: 16,
                    runSpacing: 16,
                    children: [
                      SizedBox(
                        width: constraints.maxWidth >= 860
                            ? (constraints.maxWidth - 68) * 0.63
                            : constraints.maxWidth - 52,
                        child: _DevicePanel(devices: snapshot.devices),
                      ),
                      SizedBox(
                        width: constraints.maxWidth >= 860
                            ? (constraints.maxWidth - 68) * 0.37
                            : constraints.maxWidth - 52,
                        child: _ActivityPanel(activities: snapshot.activities),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.snapshot});

  final AppSnapshot snapshot;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 4,
          height: 46,
          margin: const EdgeInsets.only(top: 2, right: 14),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [AppColors.primary, AppColors.live],
            ),
            borderRadius: BorderRadius.circular(4),
            boxShadow: AppDecor.glow(AppColors.primary, blur: 10, opacity: 0.5),
          ),
        ),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Kicker('PROJECT OVERVIEW · 工程总览', fontSize: 9.5),
              const SizedBox(height: 5),
              Text('工程总览', style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 5),
              Text(
                snapshot.project.protocolVersion,
                overflow: TextOverflow.ellipsis,
                style: monoStyle(fontSize: 11, color: AppColors.textMuted),
              ),
            ],
          ),
        ),
        _PageStatus(connected: snapshot.connection.status == '已连接'),
      ],
    );
  }
}

class _RealtimeValuesPanel extends StatelessWidget {
  const _RealtimeValuesPanel({required this.dashboard});

  final HomeDashboard dashboard;

  @override
  Widget build(BuildContext context) {
    return _Panel(
      title: '关键实时数据',
      accent: AppColors.live,
      trailing: Text(
        '${dashboard.endpoint} · ${dashboard.lastUpdated}',
        style: monoStyle(fontSize: 10, color: AppColors.textFaint),
      ),
      child: Wrap(
        spacing: 10,
        runSpacing: 10,
        children: dashboard.values
            .map(
              (value) => Container(
                width: 156,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.canvas,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppColors.borderSoft),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const StatusDot(color: AppColors.live, size: 6),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            value.name,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: AppColors.textMuted,
                              fontSize: 10.5,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 7),
                    Text(
                      '${value.displayValue} ${value.unit}'.trim(),
                      style: monoStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w700,
                        color: AppColors.text,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      'FC03 / ${value.address} · ${value.quality}',
                      style: monoStyle(fontSize: 9, color: AppColors.textFaint),
                    ),
                  ],
                ),
              ),
            )
            .toList(),
      ),
    );
  }
}

class _ConnectionPanel extends StatefulWidget {
  const _ConnectionPanel({
    required this.connection,
    required this.busy,
    required this.simulatorRunning,
    required this.onConnect,
    required this.onDisconnect,
    required this.onRefresh,
    required this.onStartSelfTest,
    required this.onStopSelfTest,
    this.error,
  });

  final ConnectionInfo connection;
  final bool busy;
  final bool simulatorRunning;
  final String? error;
  final Future<void> Function(String host, int port, int unitId) onConnect;
  final Future<void> Function() onDisconnect;
  final Future<void> Function() onRefresh;
  final Future<void> Function() onStartSelfTest;
  final Future<void> Function() onStopSelfTest;

  @override
  State<_ConnectionPanel> createState() => _ConnectionPanelState();
}

class _ConnectionPanelState extends State<_ConnectionPanel> {
  final _hostController = TextEditingController(text: '127.0.0.1');
  final _portController = TextEditingController(text: '502');
  final _unitIdController = TextEditingController(text: '1');
  String? _validationError;

  @override
  void dispose() {
    _hostController.dispose();
    _portController.dispose();
    _unitIdController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final connected = widget.connection.status == '已连接';
    final error = _validationError ?? widget.error;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: AppDecor.panel(
        accent: connected ? AppColors.success : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          LayoutBuilder(
            builder: (context, constraints) {
              final connectionForm = Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      _SectionIcon(
                        icon: connected
                            ? Icons.lan_rounded
                            : Icons.link_off_rounded,
                        color: connected
                            ? AppColors.success
                            : AppColors.warning,
                      ),
                      const SizedBox(width: 11),
                      const Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Modbus TCP 连接',
                              style: TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 14,
                              ),
                            ),
                            SizedBox(height: 2),
                            Text(
                              '连接现场设备并读取首页关键寄存器',
                              style: TextStyle(
                                color: AppColors.textFaint,
                                fontSize: 10.5,
                              ),
                            ),
                          ],
                        ),
                      ),
                      _InlineStatus(
                        label: connected
                            ? '${widget.connection.endpoint} · ${widget.connection.latencyMs} ms'
                            : '等待连接',
                        active: connected,
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: _ConnectionField(
                          controller: _hostController,
                          label: 'IP / 主机名',
                        ),
                      ),
                      const SizedBox(width: 8),
                      SizedBox(
                        width: 96,
                        child: _ConnectionField(
                          controller: _portController,
                          label: '端口',
                        ),
                      ),
                      const SizedBox(width: 8),
                      SizedBox(
                        width: 82,
                        child: _ConnectionField(
                          controller: _unitIdController,
                          label: 'Unit',
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      _GlowWrap(
                        enabled: !(widget.busy || connected),
                        color: AppColors.primary,
                        child: FilledButton.icon(
                          onPressed: widget.busy || connected ? null : _connect,
                          icon: widget.busy
                              ? const SizedBox.square(
                                  dimension: 13,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Color(0xFF021A1E),
                                  ),
                                )
                              : const Icon(Icons.link_rounded, size: 16),
                          label: const Text('连接设备'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      OutlinedButton.icon(
                        onPressed: widget.busy || !connected
                            ? null
                            : widget.onRefresh,
                        icon: const Icon(Icons.refresh_rounded, size: 15),
                        label: const Text('刷新'),
                      ),
                      const SizedBox(width: 8),
                      OutlinedButton(
                        onPressed: widget.busy || !connected
                            ? null
                            : widget.onDisconnect,
                        child: const Text('断开'),
                      ),
                    ],
                  ),
                ],
              );
              final selfTest = _SelfTestCard(
                running: widget.simulatorRunning,
                busy: widget.busy,
                onStart: widget.onStartSelfTest,
                onStop: widget.onStopSelfTest,
              );
              if (constraints.maxWidth >= 680) {
                return Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: connectionForm),
                    const SizedBox(width: 20),
                    const SizedBox(
                      height: 156,
                      child: VerticalDivider(
                        width: 1,
                        color: AppColors.borderSoft,
                      ),
                    ),
                    const SizedBox(width: 20),
                    SizedBox(width: 280, child: selfTest),
                  ],
                );
              }
              return Column(
                children: [
                  connectionForm,
                  const Divider(height: 28, color: AppColors.borderSoft),
                  selfTest,
                ],
              );
            },
          ),
          if (error != null) ...[
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
              decoration: BoxDecoration(
                color: AppColors.danger.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: AppColors.danger.withValues(alpha: 0.3),
                ),
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.error_outline_rounded,
                    size: 14,
                    color: AppColors.danger,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      error,
                      style: const TextStyle(
                        color: AppColors.danger,
                        fontSize: 11.5,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _connect() async {
    final host = _hostController.text.trim();
    final port = int.tryParse(_portController.text.trim());
    final unitId = int.tryParse(_unitIdController.text.trim());
    if (host.isEmpty) {
      setState(() => _validationError = 'TCP IP 不能为空');
      return;
    }
    if (port == null || port < 1 || port > 65535) {
      setState(() => _validationError = '端口必须在 1..65535');
      return;
    }
    if (unitId == null || unitId < 1 || unitId > 247) {
      setState(() => _validationError = 'Unit ID 必须在 1..247');
      return;
    }
    setState(() => _validationError = null);
    await widget.onConnect(host, port, unitId);
  }
}

/// 启用时为子组件添加柔和辉光，呈现「带电」的主操作观感。
class _GlowWrap extends StatelessWidget {
  const _GlowWrap({
    required this.child,
    required this.enabled,
    required this.color,
  });

  final Widget child;
  final bool enabled;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(9),
        boxShadow: enabled
            ? AppDecor.glow(color, blur: 16, opacity: 0.4)
            : null,
      ),
      child: child,
    );
  }
}

class _ConnectionField extends StatelessWidget {
  const _ConnectionField({required this.controller, required this.label});

  final TextEditingController controller;
  final String label;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      style: monoStyle(fontSize: 13, color: AppColors.text),
      decoration: InputDecoration(labelText: label),
    );
  }
}

class _PageStatus extends StatelessWidget {
  const _PageStatus({required this.connected});

  final bool connected;

  @override
  Widget build(BuildContext context) {
    final color = connected ? AppColors.success : AppColors.warning;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.28)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          StatusDot(color: color, size: 8),
          const SizedBox(width: 8),
          Text(
            connected ? '设备在线' : '等待连接',
            style: TextStyle(
              color: color,
              fontSize: 11,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionIcon extends StatelessWidget {
  const _SectionIcon({required this.icon, required this.color});

  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 36,
      height: 36,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            color.withValues(alpha: 0.18),
            color.withValues(alpha: 0.05),
          ],
        ),
        borderRadius: BorderRadius.circular(9),
        border: Border.all(color: color.withValues(alpha: 0.22)),
      ),
      child: Icon(icon, size: 18, color: color),
    );
  }
}

class _InlineStatus extends StatelessWidget {
  const _InlineStatus({required this.label, required this.active});

  final String label;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final color = active ? AppColors.success : AppColors.textFaint;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(7),
        border: Border.all(color: color.withValues(alpha: 0.18)),
      ),
      child: Text(label, style: monoStyle(fontSize: 9.5, color: color)),
    );
  }
}

class _SelfTestCard extends StatelessWidget {
  const _SelfTestCard({
    required this.running,
    required this.busy,
    required this.onStart,
    required this.onStop,
  });

  final bool running;
  final bool busy;
  final Future<void> Function() onStart;
  final Future<void> Function() onStop;

  @override
  Widget build(BuildContext context) {
    return FlowingBorderDecoration(
      running: running,
      color: AppColors.live,
      radius: 11,
      child: TechCornerDecoration(
        color: running ? AppColors.live.withValues(alpha: 0.5) : AppColors.borderSoft,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: running
                  ? [
                      AppColors.live.withValues(alpha: 0.12),
                      AppColors.live.withValues(alpha: 0.02),
                    ]
                  : const [AppColors.surface, AppColors.canvasAlt],
            ),
            borderRadius: BorderRadius.circular(11),
            border: Border.all(
              color: running
                  ? AppColors.live.withValues(alpha: 0.3)
                  : AppColors.borderSoft,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  _SectionIcon(
                    icon: Icons.science_outlined,
                    color: running ? AppColors.live : AppColors.primary,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          '内置闭环自测',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          running ? '模拟器运行中' : '127.0.0.1:1502 · Unit 1',
                          style: monoStyle(
                            fontSize: 9.5,
                            color: running ? AppColors.live : AppColors.textFaint,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 13),
              Row(
                children: [
                  Expanded(
                    child: _GlowWrap(
                      enabled: !(busy || running),
                      color: AppColors.primary,
                      child: FilledButton.icon(
                        key: const Key('start-self-test'),
                        onPressed: busy || running ? null : onStart,
                        icon: const Icon(Icons.play_arrow_rounded, size: 16),
                        label: const Text('启动自测'),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  OutlinedButton.icon(
                    key: const Key('stop-self-test'),
                    onPressed: busy || !running ? null : onStop,
                    icon: const Icon(Icons.stop_rounded, size: 14),
                    label: const Text('停止自测'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MetricCard extends StatefulWidget {
  const _MetricCard({required this.metric});

  final MetricCard metric;

  @override
  State<_MetricCard> createState() => _MetricCardState();
}

class _MetricCardState extends State<_MetricCard> {
  Offset _mousePos = Offset.zero;
  bool _hovered = false;

  void _onHover(PointerHoverEvent event, BoxConstraints constraints) {
    final size = Size(constraints.maxWidth, constraints.maxHeight);
    final localPos = event.localPosition;
    final dx = (localPos.dx / size.width) - 0.5;
    final dy = (localPos.dy / size.height) - 0.5;
    setState(() {
      _mousePos = Offset(dx, dy);
    });
  }

  @override
  Widget build(BuildContext context) {
    final metric = widget.metric;
    final color = _toneColor(metric.tone);
    final hasValue = metric.value.trim() != '--' && metric.value.trim().isNotEmpty;
    final fraction = _trackFraction(metric);
    final targetOffset = _hovered ? _mousePos : Offset.zero;

    return LayoutBuilder(
      builder: (context, constraints) {
        return MouseRegion(
          onEnter: (_) => setState(() => _hovered = true),
          onExit: (_) => setState(() {
            _hovered = false;
            _mousePos = Offset.zero;
          }),
          onHover: (event) => _onHover(event, constraints),
          child: TweenAnimationBuilder<Offset>(
            duration: const Duration(milliseconds: 240),
            curve: Curves.easeOutCubic,
            tween: Tween<Offset>(
              begin: Offset.zero,
              end: targetOffset,
            ),
            builder: (context, offset, child) {
              final finalMatrix = Matrix4.identity()
                ..setEntry(3, 2, 0.0016)
                ..rotateX(-offset.dy * 0.16)
                ..rotateY(offset.dx * 0.16);

              return Transform(
                transform: finalMatrix,
                alignment: Alignment.center,
                child: child,
              );
            },
            child: TechCornerDecoration(
              color: _hovered && hasValue ? color.withValues(alpha: 0.55) : null,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                padding: const EdgeInsets.fromLTRB(15, 14, 15, 13),
                decoration: AppDecor.panel(
                  accent: _hovered && hasValue ? color : null,
                  accentOpacity: 0.8,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 28,
                          height: 28,
                          decoration: BoxDecoration(
                            color: color.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Icon(_metricIcon(metric.key), size: 15, color: color),
                        ),
                        const SizedBox(width: 9),
                        Expanded(
                          child: Text(
                            metric.label,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: AppColors.textMuted,
                              fontSize: 11.5,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                        StatusDot(
                          color: hasValue ? color : AppColors.textFaint,
                          size: 7,
                          glow: hasValue,
                        ),
                      ],
                    ),
                    const Spacer(),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.baseline,
                      textBaseline: TextBaseline.alphabetic,
                      children: [
                        Text(
                          metric.value,
                          style: monoStyle(
                            fontSize: 27,
                            fontWeight: FontWeight.w700,
                            color: hasValue ? AppColors.text : AppColors.textFaint,
                            letterSpacing: -0.5,
                          ),
                        ),
                        const SizedBox(width: 5),
                        Text(
                          metric.unit,
                          style: monoStyle(fontSize: 10.5, color: AppColors.textMuted),
                        ),
                        const Spacer(),
                        Text(
                          metric.helper,
                          overflow: TextOverflow.ellipsis,
                          style: monoStyle(fontSize: 9, color: color),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    ValueTrack(color: color, fraction: fraction),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  /// 仅对有界量（健康度/SOC/SOH，0~100）显示比例填充；其余显示空闲基线。
  double? _trackFraction(MetricCard metric) {
    if (!{'health', 'soc', 'soh'}.contains(metric.key)) return null;
    final parsed = double.tryParse(metric.value.replaceAll(RegExp(r'[^0-9.\-]'), ''));
    if (parsed == null) return null;
    return (parsed / 100).clamp(0.0, 1.0);
  }
}

IconData _metricIcon(String key) {
  return switch (key) {
    'health' => Icons.favorite_outline_rounded,
    'online' => Icons.devices_rounded,
    'active-power' => Icons.bolt_rounded,
    'dc-voltage' => Icons.battery_charging_full_rounded,
    'soc' => Icons.battery_5_bar_rounded,
    'soh' => Icons.health_and_safety_outlined,
    _ => Icons.analytics_outlined,
  };
}

class _DevicePanel extends StatelessWidget {
  const _DevicePanel({required this.devices});

  final List<DeviceStatus> devices;

  @override
  Widget build(BuildContext context) {
    return _Panel(
      title: '设备状态',
      trailing: Text(
        '${devices.length} 台设备',
        style: monoStyle(fontSize: 10, color: AppColors.textFaint),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: DataTable(
          headingRowHeight: 40,
          dataRowMinHeight: 44,
          dataRowMaxHeight: 44,
          columns: const [
            DataColumn(label: Text('设备')),
            DataColumn(label: Text('类型')),
            DataColumn(label: Text('连接')),
            DataColumn(label: Text('运行状态')),
            DataColumn(label: Text('质量')),
          ],
          rows: devices
              .map(
                (device) => DataRow(
                  cells: [
                    DataCell(
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(
                            Icons.memory_rounded,
                            size: 15,
                            color: AppColors.primary,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            device.name,
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                    ),
                    DataCell(Text(device.deviceType)),
                    DataCell(_ConnBadge(text: device.connection)),
                    DataCell(Text(device.runtime)),
                    DataCell(
                      Text(
                        device.quality,
                        style: monoStyle(
                          fontSize: 11.5,
                          color: AppColors.textMuted,
                        ),
                      ),
                    ),
                  ],
                ),
              )
              .toList(),
        ),
      ),
    );
  }
}

class _ConnBadge extends StatelessWidget {
  const _ConnBadge({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final online = text.contains('已');
    final color = online ? AppColors.success : AppColors.textFaint;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        StatusDot(color: color, size: 6, glow: online),
        const SizedBox(width: 7),
        Text(text, style: TextStyle(color: color, fontSize: 12)),
      ],
    );
  }
}

class _ActivityPanel extends StatelessWidget {
  const _ActivityPanel({required this.activities});

  final List<ActivityItem> activities;

  @override
  Widget build(BuildContext context) {
    return _Panel(
      title: '最近活动',
      child: Column(
        children: activities
            .map(
              (activity) => Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.canvas,
                  borderRadius: BorderRadius.circular(9),
                  border: Border.all(color: AppColors.borderSoft),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: StatusDot(
                        color: _toneColor(activity.tone),
                        size: 7,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            activity.title,
                            style: const TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            activity.detail,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: AppColors.textMuted,
                              fontSize: 10.5,
                              height: 1.35,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      activity.time,
                      style: monoStyle(fontSize: 9, color: AppColors.textFaint),
                    ),
                  ],
                ),
              ),
            )
            .toList(),
      ),
    );
  }
}

class _Panel extends StatelessWidget {
  const _Panel({
    required this.title,
    required this.child,
    this.trailing,
    this.accent,
  });

  final String title;
  final Widget child;
  final Widget? trailing;
  final Color? accent;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: AppDecor.panel(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 3,
                height: 14,
                margin: const EdgeInsets.only(right: 9),
                decoration: BoxDecoration(
                  color: accent ?? AppColors.primary,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Text(title, style: Theme.of(context).textTheme.titleMedium),
              if (trailing != null) ...[const Spacer(), trailing!],
            ],
          ),
          const SizedBox(height: 14),
          child,
        ],
      ),
    );
  }
}

Color _toneColor(String tone) {
  return switch (tone) {
    'green' => AppColors.success,
    'red' => AppColors.danger,
    'purple' => const Color(0xFFB18CFF),
    'cyan' => const Color(0xFF4DDBD4),
    'orange' => AppColors.warning,
    _ => AppColors.primary,
  };
}
