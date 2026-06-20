import 'package:flutter/material.dart';
import 'package:icstudio_flutter/app/app_design.dart';
import 'package:icstudio_flutter/app/app_theme.dart';
import 'package:icstudio_flutter/src/rust/api/connection.dart';
import 'package:icstudio_flutter/src/rust/api/snapshot.dart';

class RealtimeMonitorPage extends StatelessWidget {
  const RealtimeMonitorPage({
    required this.snapshot,
    required this.busy,
    required this.onRefresh,
    this.error,
    super.key,
  });

  final AppSnapshot snapshot;
  final bool busy;
  final String? error;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final dashboard = snapshot.homeDashboard;
    final connected = snapshot.connection.status == '已连接';
    return Padding(
      padding: const EdgeInsets.all(26),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          RevealOnce(
            child: Row(
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
                    boxShadow: AppDecor.glow(
                      AppColors.primary,
                      blur: 10,
                      opacity: 0.5,
                    ),
                  ),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Kicker('REALTIME · 实时数据', fontSize: 9.5),
                      const SizedBox(height: 5),
                      Text(
                        '实时数据',
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      const SizedBox(height: 5),
                      Text(
                        '从 Rust 主站读取、解码并持续更新的工程点位',
                        style: monoStyle(
                          fontSize: 11,
                          color: AppColors.textMuted,
                        ),
                      ),
                    ],
                  ),
                ),
                _GlowWrap(
                  enabled: connected && !busy,
                  child: FilledButton.icon(
                    key: const Key('monitor-refresh'),
                    onPressed: connected && !busy ? onRefresh : null,
                    icon: busy
                        ? const SizedBox.square(
                            dimension: 14,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Color(0xFF021A1E),
                            ),
                          )
                        : const Icon(Icons.refresh, size: 18),
                    label: const Text('手动刷新'),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          RevealOnce(
            order: 1,
            child: _ConnectionSummary(
              snapshot: snapshot,
              pointCount: dashboard?.values.length ?? 0,
            ),
          ),
          if (error != null) ...[
            const SizedBox(height: 10),
            Text(error!, style: const TextStyle(color: AppColors.danger)),
          ],
          const SizedBox(height: 16),
          Expanded(
            child: RevealOnce(
              order: 2,
              child: dashboard == null
                  ? const _DisconnectedMonitor()
                  : _PointTable(dashboard: dashboard),
            ),
          ),
        ],
      ),
    );
  }
}

/// 启用时为子组件添加柔和辉光。
class _GlowWrap extends StatelessWidget {
  const _GlowWrap({required this.child, required this.enabled});

  final Widget child;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(9),
        boxShadow: enabled
            ? AppDecor.glow(AppColors.primary, blur: 16, opacity: 0.4)
            : null,
      ),
      child: child,
    );
  }
}

class _ConnectionSummary extends StatelessWidget {
  const _ConnectionSummary({required this.snapshot, required this.pointCount});

  final AppSnapshot snapshot;
  final int pointCount;

  @override
  Widget build(BuildContext context) {
    final connected = snapshot.connection.status == '已连接';
    final color = connected ? AppColors.success : AppColors.warning;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: AppDecor.panel(accent: connected ? AppColors.success : null),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(9),
            ),
            child: Icon(
              connected ? Icons.sensors_rounded : Icons.sensors_off_rounded,
              color: color,
              size: 18,
            ),
          ),
          const SizedBox(width: 14),
          _SummaryValue(label: '连接', value: snapshot.connection.status),
          const _SummaryDivider(),
          _SummaryValue(
            label: '端点',
            value: snapshot.connection.endpoint,
            mono: true,
          ),
          const _SummaryDivider(),
          _SummaryValue(label: '实时点', value: '$pointCount', mono: true),
          const _SummaryDivider(),
          _SummaryValue(
            label: '成功率',
            value: '${snapshot.connection.successRate.toStringAsFixed(1)}%',
            mono: true,
          ),
          const Spacer(),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              StatusDot(color: color, size: 6, glow: connected),
              const SizedBox(width: 7),
              const Text(
                '连接后每 2 秒自动刷新',
                style: TextStyle(color: AppColors.textFaint, fontSize: 10),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SummaryValue extends StatelessWidget {
  const _SummaryValue({
    required this.label,
    required this.value,
    this.mono = false,
  });

  final String label;
  final String value;
  final bool mono;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Kicker(label, fontSize: 8.5),
        const SizedBox(height: 4),
        Text(
          value,
          style: mono
              ? monoStyle(fontSize: 12, fontWeight: FontWeight.w600)
              : const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
        ),
      ],
    );
  }
}

class _SummaryDivider extends StatelessWidget {
  const _SummaryDivider();

  @override
  Widget build(BuildContext context) {
    return const SizedBox(
      height: 30,
      child: VerticalDivider(width: 28, color: AppColors.border),
    );
  }
}

class _DisconnectedMonitor extends StatelessWidget {
  const _DisconnectedMonitor();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: AppDecor.panel(raised: false),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  AppColors.primary.withValues(alpha: 0.16),
                  AppColors.primary.withValues(alpha: 0.03),
                ],
              ),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: AppColors.primary.withValues(alpha: 0.25),
              ),
            ),
            child: const Icon(
              Icons.monitor_heart_outlined,
              size: 30,
              color: AppColors.primary,
            ),
          ),
          const SizedBox(height: 16),
          const Text(
            '暂无实时数据',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 7),
          const Text(
            '请先在工程首页连接设备或启动内置闭环自测',
            style: TextStyle(color: AppColors.textMuted),
          ),
        ],
      ),
    );
  }
}

class _PointTable extends StatelessWidget {
  const _PointTable({required this.dashboard});

  final HomeDashboard dashboard;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: AppDecor.panel(),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 15, 18, 12),
            child: Row(
              children: [
                Container(
                  width: 3,
                  height: 14,
                  margin: const EdgeInsets.only(right: 9),
                  decoration: BoxDecoration(
                    color: AppColors.live,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                Text(
                  '实时点表 · ${dashboard.endpoint}',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                const Spacer(),
                const StatusDot(color: AppColors.live, size: 6),
                const SizedBox(width: 6),
                Text(
                  'LIVE',
                  style: monoStyle(
                    fontSize: 9,
                    color: AppColors.live,
                    letterSpacing: 1.5,
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1, color: AppColors.borderSoft),
          Expanded(
            child: SingleChildScrollView(
              child: SizedBox(
                width: double.infinity,
                child: DataTable(
                  headingRowColor: const WidgetStatePropertyAll(
                    Color(0xFF0A1622),
                  ),
                  columns: const [
                    DataColumn(label: Text('点位名称')),
                    DataColumn(label: Text('地址')),
                    DataColumn(label: Text('功能码')),
                    DataColumn(label: Text('原始值')),
                    DataColumn(label: Text('工程值')),
                    DataColumn(label: Text('质量')),
                  ],
                  rows: dashboard.values.map(_row).toList(),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  DataRow _row(HomeDashboardValue value) {
    return DataRow(
      cells: [
        DataCell(
          Text(
            value.name,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
        ),
        DataCell(Text(value.address.toString(), style: monoStyle(fontSize: 12))),
        DataCell(
          Text('FC03', style: monoStyle(fontSize: 12, color: AppColors.primary)),
        ),
        DataCell(
          Text(
            value.rawValue.toString(),
            style: monoStyle(fontSize: 12, color: AppColors.textMuted),
          ),
        ),
        DataCell(
          Text(
            '${value.displayValue} ${value.unit}'.trim(),
            style: monoStyle(fontSize: 12.5, fontWeight: FontWeight.w700),
          ),
        ),
        DataCell(
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const StatusDot(color: AppColors.success, size: 6),
              const SizedBox(width: 7),
              Text(value.quality),
            ],
          ),
        ),
      ],
    );
  }
}
