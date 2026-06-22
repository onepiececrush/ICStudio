import 'dart:async';

import 'package:flutter/material.dart';
import 'package:icstudio_flutter/app/app_design.dart';
import 'package:icstudio_flutter/app/app_theme.dart';
import 'package:icstudio_flutter/features/simulator/device_simulator_controller.dart';
import 'package:icstudio_flutter/features/simulator/simulator_models.dart';

class DeviceSimulatorPage extends StatefulWidget {
  const DeviceSimulatorPage({required this.controller, super.key});

  final DeviceSimulatorController controller;

  @override
  State<DeviceSimulatorPage> createState() => _DeviceSimulatorPageState();
}

class _DeviceSimulatorPageState extends State<DeviceSimulatorPage> {
  String _query = '';
  String _filter = 'all';
  int _page = 0;
  int _pageSize = 25;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.controller,
      builder: (context, _) {
        final controller = widget.controller;
        final profile = controller.selectedProfile;
        return CustomScrollView(
          key: const Key('simulator-workbench'),
          slivers: [
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
              sliver: SliverList.list(
                children: [
                  _Header(controller: controller),
                  const SizedBox(height: 14),
                  if (controller.notice != null) ...[
                    _Notice(
                      text: controller.notice!,
                      error: controller.noticeIsError,
                    ),
                    const SizedBox(height: 12),
                  ],
                  _ProfileStrip(controller: controller),
                  const SizedBox(height: 12),
                  _Facts(profile: profile, controller: controller),
                  const SizedBox(height: 12),
                  _ListenConfig(controller: controller),
                  const SizedBox(height: 12),
                  _RegisterPanel(
                    controller: controller,
                    query: _query,
                    filter: _filter,
                    page: _page,
                    pageSize: _pageSize,
                    onQuery: (value) => setState(() {
                      _query = value;
                      _page = 0;
                    }),
                    onFilter: (value) => setState(() {
                      _filter = value;
                      _page = 0;
                    }),
                    onPage: (value) => setState(() => _page = value),
                    onPageSize: (value) => setState(() {
                      _pageSize = value;
                      _page = 0;
                    }),
                  ),
                  const SizedBox(height: 12),
                  _ScenarioPanel(controller: controller),
                  const SizedBox(height: 12),
                  _RuntimePanel(controller: controller),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.controller});
  final DeviceSimulatorController controller;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        FlowingBorderDecoration(
          running: controller.running,
          color: AppColors.success,
          radius: 12,
          child: Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  (controller.running ? AppColors.success : AppColors.primary)
                      .withValues(alpha: 0.22),
                  (controller.running ? AppColors.success : AppColors.primary)
                      .withValues(alpha: 0.05),
                ],
              ),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: (controller.running ? AppColors.success : AppColors.primary)
                    .withValues(alpha: 0.3),
              ),
              boxShadow: AppDecor.glow(
                controller.running ? AppColors.success : AppColors.primary,
                blur: 14,
                opacity: 0.3,
              ),
            ),
            child: Icon(
              Icons.developer_board_rounded,
              color: controller.running ? AppColors.success : AppColors.primary,
            ),
          ),
        ),
        const SizedBox(width: 13),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Kicker('SLAVE SIMULATOR · 从机模拟', fontSize: 9),
              const SizedBox(height: 4),
              const Text(
                '从机模拟工作台',
                style: TextStyle(fontSize: 23, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 3),
              Text(
                'Device Profile 驱动 · Rust Modbus TCP Server · 仅限本机监听',
                style: monoStyle(fontSize: 10.5, color: AppColors.textMuted),
              ),
            ],
          ),
        ),
        OutlinedButton.icon(
          key: const Key('simulator-import'),
          onPressed: controller.busy || controller.running
              ? null
              : () => unawaited(controller.importProfile()),
          icon: const Icon(Icons.upload_file_rounded, size: 16),
          label: const Text('导入协议'),
        ),
        const SizedBox(width: 8),
        OutlinedButton.icon(
          key: const Key('simulator-stop'),
          onPressed: controller.busy || !controller.running
              ? null
              : () => unawaited(controller.stop()),
          icon: const Icon(Icons.stop_circle_outlined, size: 16),
          label: const Text('停止'),
        ),
        const SizedBox(width: 8),
        FlowingBorderDecoration(
          running: controller.running,
          color: AppColors.success,
          radius: 9,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(9),
              boxShadow: controller.busy || controller.running
                  ? null
                  : AppDecor.glow(AppColors.primary, blur: 16, opacity: 0.4),
            ),
            child: FilledButton.icon(
              key: const Key('simulator-start'),
              onPressed: controller.busy || controller.running
                  ? null
                  : () => unawaited(controller.start()),
              style: controller.running
                  ? FilledButton.styleFrom(
                      backgroundColor: AppColors.success,
                      foregroundColor: const Color(0xFF021E14),
                    )
                  : null,
              icon: controller.busy
                  ? const SizedBox.square(
                      dimension: 14,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Color(0xFF021A1E),
                      ),
                    )
                  : Icon(
                      controller.running
                          ? Icons.check_circle_outline_rounded
                          : Icons.play_arrow_rounded,
                      size: 18,
                    ),
              label: Text(controller.running ? '运行中' : '启动从机'),
            ),
          ),
        ),
      ],
    );
  }
}

class _ProfileStrip extends StatelessWidget {
  const _ProfileStrip({required this.controller});
  final DeviceSimulatorController controller;

  @override
  Widget build(BuildContext context) {
    return _Panel(
      title: '设备与协议',
      trailing: Text(
        '${controller.profiles.length} 个 Profile',
        style: const TextStyle(color: AppColors.textFaint, fontSize: 10),
      ),
      child: SizedBox(
        height: 72,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: controller.profiles.length,
          separatorBuilder: (_, _) => const SizedBox(width: 8),
          itemBuilder: (context, index) {
            final profile = controller.profiles[index];
            final selected = profile.id == controller.selectedProfileId;
            return _ProfileCard(
              profile: profile,
              selected: selected,
              running: controller.running,
              onTap: () => controller.selectProfile(profile.id),
            );
          },
        ),
      ),
    );
  }
}

class _ProfileCard extends StatefulWidget {
  const _ProfileCard({
    required this.profile,
    required this.selected,
    required this.running,
    required this.onTap,
  });

  final SimulatorProfile profile;
  final bool selected;
  final bool running;
  final VoidCallback onTap;

  @override
  State<_ProfileCard> createState() => _ProfileCardState();
}

class _ProfileCardState extends State<_ProfileCard> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final profile = widget.profile;
    final selected = widget.selected;
    final running = widget.running;
    
    return MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      child: InkWell(
        onTap: running ? null : widget.onTap,
        borderRadius: BorderRadius.circular(9),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOutCubic,
          width: 240,
          transform: Matrix4.translationValues(0, _hovered && !running ? -3 : 0, 0),
          padding: const EdgeInsets.all(11),
          decoration: BoxDecoration(
            gradient: selected
                ? LinearGradient(
                    colors: [
                      AppColors.primary.withValues(alpha: 0.18),
                      AppColors.primary.withValues(alpha: 0.03),
                    ],
                  )
                : _hovered
                    ? const LinearGradient(
                        colors: [
                          AppColors.surfaceRaised,
                          AppColors.surfaceSoft,
                        ],
                      )
                    : null,
            color: selected ? null : AppColors.canvas,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: selected
                  ? AppColors.primary.withValues(alpha: 0.6)
                  : _hovered
                      ? AppColors.border
                      : AppColors.borderSoft,
            ),
            boxShadow: selected
                ? AppDecor.glow(AppColors.primary, blur: 14, opacity: 0.25)
                : _hovered
                    ? const [
                        BoxShadow(
                          color: Color(0x30000000),
                          blurRadius: 10,
                          offset: Offset(0, 4),
                        )
                      ]
                    : null,
          ),
          child: Stack(
            children: [
              if (selected)
                Positioned(
                  left: 0,
                  top: 4,
                  bottom: 4,
                  child: Container(
                    width: 3.5,
                    decoration: BoxDecoration(
                      color: AppColors.primary,
                      borderRadius: BorderRadius.circular(2),
                      boxShadow: AppDecor.glow(AppColors.primary, blur: 6, opacity: 0.8),
                    ),
                  ),
                ),
              Padding(
                padding: EdgeInsets.only(left: selected ? 8.0 : 0.0),
                child: Row(
                  children: [
                    Icon(
                      profile.communicationType.contains('TCP')
                          ? Icons.lan_outlined
                          : Icons.usb_outlined,
                      size: 20,
                      color: selected
                          ? AppColors.primary
                          : _hovered
                              ? AppColors.text
                              : AppColors.textMuted,
                    ),
                    const SizedBox(width: 9),
                    Expanded(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            profile.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontWeight: FontWeight.w600,
                              fontSize: 12,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '${profile.communicationType} · v${profile.version} · ${profile.registers.length} 点',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: monoStyle(
                              color: selected ? AppColors.textMuted : AppColors.textFaint,
                              fontSize: 9.5,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Facts extends StatelessWidget {
  const _Facts({required this.profile, required this.controller});
  final SimulatorProfile profile;
  final DeviceSimulatorController controller;

  @override
  Widget build(BuildContext context) {
    final writable = profile.registers.where((item) => item.writable).length;
    final addresses = profile.registers.map((item) => item.address).toList();
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        _Fact(label: '设备类型', value: profile.deviceType),
        _Fact(label: '厂商', value: profile.vendor),
        _Fact(
          label: '可写 / 总点数',
          value: '$writable / ${profile.registers.length}',
        ),
        _Fact(
          label: '地址范围',
          value: addresses.isEmpty
              ? '未定义'
              : '${addresses.reduce((a, b) => a < b ? a : b)} ~ ${addresses.reduce((a, b) => a > b ? a : b)}',
        ),
        _Fact(
          label: '服务状态',
          value: controller.running
              ? '运行 · ${controller.status!.endpoint}'
              : '未启动',
          color: controller.running ? AppColors.success : AppColors.warning,
        ),
      ],
    );
  }
}

class _ListenConfig extends StatelessWidget {
  const _ListenConfig({required this.controller});
  final DeviceSimulatorController controller;

  @override
  Widget build(BuildContext context) {
    return _Panel(
      title: '监听配置',
      trailing: const _Badge(text: 'TCP 可用 · RTU 预留', color: AppColors.success),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final width = (constraints.maxWidth - 30) / 4;
          return Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              SizedBox(
                width: width.clamp(150, 260),
                child: TextFormField(
                  initialValue: controller.host,
                  enabled: !controller.running,
                  decoration: const InputDecoration(labelText: 'TCP 监听地址'),
                  onChanged: (value) => controller.updateTcpConfig(host: value),
                ),
              ),
              SizedBox(
                width: width.clamp(120, 200),
                child: TextFormField(
                  initialValue: controller.port.toString(),
                  enabled: !controller.running,
                  decoration: const InputDecoration(labelText: 'TCP 端口'),
                  onChanged: (value) =>
                      controller.updateTcpConfig(port: int.tryParse(value)),
                ),
              ),
              SizedBox(
                width: width.clamp(120, 200),
                child: TextFormField(
                  initialValue: controller.unitId.toString(),
                  enabled: !controller.running,
                  decoration: const InputDecoration(labelText: 'Unit ID'),
                  onChanged: (value) =>
                      controller.updateTcpConfig(unitId: int.tryParse(value)),
                ),
              ),
              SizedBox(
                width: width.clamp(150, 260),
                child: TextFormField(
                  initialValue: controller.serialPort,
                  enabled: !controller.running,
                  decoration: const InputDecoration(labelText: 'RTU 串口（后续）'),
                  onChanged: (value) =>
                      controller.updateRtuConfig(serialPort: value),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _RegisterPanel extends StatelessWidget {
  const _RegisterPanel({
    required this.controller,
    required this.query,
    required this.filter,
    required this.page,
    required this.pageSize,
    required this.onQuery,
    required this.onFilter,
    required this.onPage,
    required this.onPageSize,
  });

  final DeviceSimulatorController controller;
  final String query;
  final String filter;
  final int page;
  final int pageSize;
  final ValueChanged<String> onQuery;
  final ValueChanged<String> onFilter;
  final ValueChanged<int> onPage;
  final ValueChanged<int> onPageSize;

  @override
  Widget build(BuildContext context) {
    final all = controller.selectedProfile.registers.where((item) {
      final match =
          query.isEmpty ||
          item.name.toLowerCase().contains(query.toLowerCase()) ||
          item.address.toString().contains(query) ||
          item.group.toLowerCase().contains(query.toLowerCase());
      final filterMatch =
          filter == 'all' ||
          (filter == 'writable' && item.writable) ||
          (filter == 'pinned' &&
              controller.pinnedRegisterIds.contains(item.id));
      return match && filterMatch;
    }).toList();
    final pages = (all.length / pageSize).ceil().clamp(1, 9999);
    final safePage = page.clamp(0, pages - 1);
    final rows = all.skip(safePage * pageSize).take(pageSize).toList();
    return _Panel(
      title: '寄存器内存表',
      trailing: Text(
        '${all.length} 点 · 第 ${safePage + 1}/$pages 页',
        style: const TextStyle(color: AppColors.textFaint, fontSize: 10),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: TextField(
                  key: const Key('simulator-register-search'),
                  decoration: const InputDecoration(
                    hintText: '搜索名称、地址或分组',
                    prefixIcon: Icon(Icons.search_rounded, size: 18),
                  ),
                  onChanged: onQuery,
                ),
              ),
              const SizedBox(width: 8),
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'all', label: Text('全部')),
                  ButtonSegment(value: 'writable', label: Text('可写')),
                  ButtonSegment(value: 'pinned', label: Text('已固定')),
                ],
                selected: {filter},
                onSelectionChanged: (value) => onFilter(value.first),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Container(
            decoration: BoxDecoration(
              color: AppColors.canvasAlt,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: AppColors.borderSoft),
            ),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: DataTable(
                columns: const [
                  DataColumn(label: Text('固定')),
                  DataColumn(label: Text('地址')),
                  DataColumn(label: Text('名称 / 分组')),
                  DataColumn(label: Text('FC / 权限')),
                  DataColumn(label: Text('类型')),
                  DataColumn(label: Text('倍率')),
                  DataColumn(label: Text('工程值')),
                  DataColumn(label: Text('范围')),
                  DataColumn(label: Text('最近修改')),
                ],
                rows: rows
                    .map(
                      (register) => DataRow(
                        cells: [
                          DataCell(
                            IconButton(
                              tooltip: '固定到快调列表',
                              onPressed: () =>
                                  controller.togglePin(register.id),
                              icon: Icon(
                                controller.pinnedRegisterIds.contains(
                                      register.id,
                                    )
                                    ? Icons.push_pin
                                    : Icons.push_pin_outlined,
                                size: 16,
                                color:
                                    controller.pinnedRegisterIds.contains(
                                      register.id,
                                    )
                                    ? AppColors.primary
                                    : AppColors.textFaint,
                              ),
                            ),
                          ),
                          DataCell(
                            Text(
                              register.address.toString(),
                              style: monoStyle(
                                fontSize: 12,
                                color: AppColors.textMuted,
                              ),
                            ),
                          ),
                          DataCell(
                            SizedBox(
                              width: 150,
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    register.name,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  Text(
                                    register.group,
                                    style: const TextStyle(
                                      color: AppColors.textFaint,
                                      fontSize: 9,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          DataCell(
                            Text(
                              'FC${register.functionCode} · ${_accessLabel(register.access)}',
                            ),
                          ),
                          DataCell(
                            Text('${register.dataType} × ${register.length}'),
                          ),
                          DataCell(
                            Text(
                              _number(register.scale),
                              style: monoStyle(fontSize: 12),
                            ),
                          ),
                          DataCell(
                            _RegisterValueCell(
                              register: register,
                              controller: controller,
                              lastModified: controller.lastModified[register.id],
                            ),
                          ),
                          DataCell(
                            Text(
                              '${register.rangeMin ?? '-∞'} ~ ${register.rangeMax ?? '+∞'}',
                              style: monoStyle(
                                fontSize: 11,
                                color: AppColors.textMuted,
                              ),
                            ),
                          ),
                          DataCell(
                            Text(
                              controller.lastModified[register.id] ?? '—',
                              style: monoStyle(
                                fontSize: 11,
                                color: AppColors.textFaint,
                              ),
                            ),
                          ),
                        ],
                      ),
                    )
                    .toList(),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              DropdownButton<int>(
                value: pageSize,
                items: const [25, 50, 100]
                    .map(
                      (value) => DropdownMenuItem(
                        value: value,
                        child: Text('$value / 页'),
                      ),
                    )
                    .toList(),
                onChanged: (value) {
                  if (value != null) onPageSize(value);
                },
              ),
              const Spacer(),
              IconButton(
                onPressed: safePage > 0 ? () => onPage(safePage - 1) : null,
                icon: const Icon(Icons.chevron_left),
              ),
              Text('${safePage + 1} / $pages'),
              IconButton(
                onPressed: safePage + 1 < pages
                    ? () => onPage(safePage + 1)
                    : null,
                icon: const Icon(Icons.chevron_right),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ScenarioPanel extends StatelessWidget {
  const _ScenarioPanel({required this.controller});
  final DeviceSimulatorController controller;

  @override
  Widget build(BuildContext context) {
    final scenarios = controller.selectedProfile.scenarios;
    return _Panel(
      title: '运行场景与故障注入',
      trailing: Text(
        '当前故障：${_faultLabel(controller.status?.faultMode ?? 'none')}',
        style: TextStyle(
          color: (controller.status?.faultMode ?? 'none') == 'none'
              ? AppColors.success
              : AppColors.danger,
          fontSize: 10,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: scenarios
                .map(
                  (scenario) => SizedBox(
                    width: 230,
                    child: OutlinedButton(
                      key: Key('simulator-scenario-${scenario.id}'),
                      onPressed: controller.busy
                          ? null
                          : () => unawaited(controller.applyScenario(scenario)),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.all(11),
                        alignment: Alignment.centerLeft,
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Icon(
                                scenario.faultMode == 'none'
                                    ? Icons.play_circle_outline
                                    : Icons.warning_amber_rounded,
                                size: 16,
                                color: scenario.faultMode == 'none'
                                    ? AppColors.primary
                                    : AppColors.danger,
                              ),
                              const SizedBox(width: 6),
                              Text(
                                scenario.name,
                                style: const TextStyle(
                                  color: AppColors.text,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 5),
                          Text(
                            scenario.description,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: AppColors.textMuted,
                              fontSize: 10,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                )
                .toList(),
          ),
          const SizedBox(height: 12),
          const Divider(),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                onPressed: controller.running && !controller.busy
                    ? () => unawaited(controller.setFault('exceptionCode'))
                    : null,
                icon: const Icon(Icons.error_outline, size: 15),
                label: const Text('异常码 0x03'),
              ),
              OutlinedButton.icon(
                onPressed: controller.running && !controller.busy
                    ? () => unawaited(controller.setFault('timeout', rate: 0.6))
                    : null,
                icon: const Icon(Icons.timer_outlined, size: 15),
                label: const Text('60% 超时'),
              ),
              OutlinedButton.icon(
                onPressed: controller.running && !controller.busy
                    ? () => unawaited(controller.setFault('noResponse'))
                    : null,
                icon: const Icon(Icons.speaker_notes_off_outlined, size: 15),
                label: const Text('不响应'),
              ),
              OutlinedButton.icon(
                onPressed: controller.running && !controller.busy
                    ? () => unawaited(controller.setFault('outOfRange'))
                    : null,
                icon: const Icon(Icons.data_array_outlined, size: 15),
                label: const Text('越界异常'),
              ),
              TextButton.icon(
                onPressed: controller.running && !controller.busy
                    ? () => unawaited(controller.setFault('none', rate: 0))
                    : null,
                icon: const Icon(Icons.cleaning_services_outlined, size: 15),
                label: const Text('清除故障'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _RuntimePanel extends StatelessWidget {
  const _RuntimePanel({required this.controller});
  final DeviceSimulatorController controller;

  @override
  Widget build(BuildContext context) {
    final status = controller.status;
    final stats = status?.stats;
    return _Panel(
      title: '运行诊断',
      trailing: const Text(
        '最近 120 条',
        style: TextStyle(color: AppColors.textFaint, fontSize: 10),
      ),
      child: Column(
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _Stat(
                label: '正常响应',
                value: stats?.ok ?? 0,
                color: AppColors.success,
              ),
              _Stat(
                label: '异常码',
                value: stats?.exceptionCode ?? 0,
                color: AppColors.danger,
              ),
              _Stat(
                label: '超时',
                value: stats?.timeout ?? 0,
                color: AppColors.warning,
              ),
              _Stat(
                label: '不响应',
                value: stats?.noResponse ?? 0,
                color: AppColors.warning,
              ),
              _Stat(
                label: '越界',
                value: stats?.outOfRange ?? 0,
                color: AppColors.danger,
              ),
            ],
          ),
          const SizedBox(height: 10),
          LayoutBuilder(
            builder: (context, constraints) {
              final compact = constraints.maxWidth < 900;
              final frames = _LogBox(
                title: '请求 / 响应报文',
                lines:
                    status?.frames
                        .take(20)
                        .map(
                          (item) =>
                              '${item.time}  ${item.direction == 'request' ? 'RX' : 'TX'}  ${item.frame}  ${item.note}',
                        )
                        .toList() ??
                    const [],
              );
              final logs = _LogBox(
                title: 'Rust 后端日志',
                lines: status?.logs.take(20).toList() ?? const [],
              );
              return compact
                  ? Column(children: [frames, const SizedBox(height: 8), logs])
                  : Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(child: frames),
                        const SizedBox(width: 8),
                        Expanded(child: logs),
                      ],
                    );
            },
          ),
        ],
      ),
    );
  }
}

Future<void> _editRegister(
  BuildContext context,
  DeviceSimulatorController controller,
  SimulatorRegister register,
) async {
  final input = TextEditingController(text: _number(register.value));
  final accepted = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text('修改 ${register.name}'),
      content: SizedBox(
        width: 360,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '地址 ${register.address} · ${register.dataType} · 倍率 ${register.scale}',
            ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('simulator-register-value-input'),
              controller: input,
              autofocus: true,
              decoration: InputDecoration(
                labelText:
                    '工程值（${register.unit.isEmpty ? '无单位' : register.unit}）',
                helperText:
                    '允许范围：${register.rangeMin ?? '-∞'} ~ ${register.rangeMax ?? '+∞'}',
              ),
              onSubmitted: (_) => Navigator.pop(context, true),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: const Text('取消'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, true),
          child: const Text('写入'),
        ),
      ],
    ),
  );
  if (accepted == true) {
    await controller.setRegisterValue(register, input.text);
  }
  input.dispose();
}

class _Panel extends StatelessWidget {
  const _Panel({required this.title, required this.child, this.trailing});
  final String title;
  final Widget child;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
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
                  color: AppColors.primary,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.1,
                ),
              ),
              const Spacer(),
              ?trailing,
            ],
          ),
          const SizedBox(height: 13),
          child,
        ],
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({required this.label, required this.value, this.color});
  final String label;
  final String value;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 150),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: AppColors.canvas,
        borderRadius: BorderRadius.circular(9),
        border: Border.all(color: AppColors.borderSoft),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Kicker(label, fontSize: 8.5),
          const SizedBox(height: 4),
          Text(
            value,
            style: monoStyle(
              color: color ?? AppColors.text,
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.text, required this.error});
  final String text;
  final bool error;

  @override
  Widget build(BuildContext context) {
    final color = error ? AppColors.danger : AppColors.success;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.28)),
      ),
      child: Row(
        children: [
          Icon(
            error ? Icons.error_outline : Icons.check_circle_outline,
            size: 16,
            color: color,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text, style: TextStyle(color: color, fontSize: 11)),
          ),
        ],
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.text, required this.color});
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    decoration: BoxDecoration(
      color: color.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(20),
    ),
    child: Text(text, style: TextStyle(color: color, fontSize: 9)),
  );
}

class _Stat extends StatefulWidget {
  const _Stat({required this.label, required this.value, required this.color});
  final String label;
  final int value;
  final Color color;

  @override
  State<_Stat> createState() => _StatState();
}

class _StatState extends State<_Stat> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _scaleAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 320),
      vsync: this,
    );
    _scaleAnimation = TweenSequence<double>([
      TweenSequenceItem(
        tween: Tween(begin: 1.0, end: 1.25).chain(CurveTween(curve: Curves.easeOut)),
        weight: 50,
      ),
      TweenSequenceItem(
        tween: Tween(begin: 1.25, end: 1.0).chain(CurveTween(curve: Curves.easeIn)),
        weight: 50,
      ),
    ]).animate(_controller);
  }

  @override
  void didUpdateWidget(covariant _Stat oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.value != oldWidget.value) {
      _controller.forward(from: 0.0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Container(
    width: 125,
    padding: const EdgeInsets.all(10),
    decoration: BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [widget.color.withValues(alpha: 0.12), widget.color.withValues(alpha: 0.03)],
      ),
      borderRadius: BorderRadius.circular(9),
      border: Border.all(color: widget.color.withValues(alpha: 0.2)),
    ),
    child: Row(
      children: [
        Expanded(
          child: Text(
            widget.label,
            style: const TextStyle(color: AppColors.textMuted, fontSize: 10),
          ),
        ),
        ScaleTransition(
          scale: _scaleAnimation,
          child: Text(
            '${widget.value}',
            style: monoStyle(color: widget.color, fontWeight: FontWeight.w700, fontSize: 14),
          ),
        ),
      ],
    ),
  );
}

class _LogBox extends StatelessWidget {
  const _LogBox({required this.title, required this.lines});
  final String title;
  final List<String> lines;

  @override
  Widget build(BuildContext context) => Container(
    height: 190,
    padding: const EdgeInsets.all(11),
    decoration: BoxDecoration(
      color: AppColors.canvas,
      borderRadius: BorderRadius.circular(9),
      border: Border.all(color: AppColors.borderSoft),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const StatusDot(color: AppColors.live, size: 5),
            const SizedBox(width: 7),
            Text(
              title,
              style: const TextStyle(
                color: AppColors.textMuted,
                fontSize: 10.5,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
        const SizedBox(height: 9),
        Expanded(
          child: lines.isEmpty
              ? const Center(
                  child: Text(
                    '等待从机运行数据',
                    style: TextStyle(color: AppColors.textFaint, fontSize: 10),
                  ),
                )
              : ListView.builder(
                  itemCount: lines.length,
                  itemBuilder: (_, index) => Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: SelectableText(
                      lines[index],
                      style: monoStyle(
                        color: AppColors.textMuted,
                        fontSize: 9.5,
                        height: 1.4,
                        letterSpacing: 0,
                      ),
                    ),
                  ),
                ),
        ),
      ],
    ),
  );
}

String _number(double value) {
  if (value == value.roundToDouble()) return value.toInt().toString();
  return value
      .toStringAsFixed(3)
      .replaceFirst(RegExp(r'0+$'), '')
      .replaceFirst(RegExp(r'\.$'), '');
}

String _accessLabel(String value) => switch (value) {
  'readWrite' => '读写',
  'write' => '只写',
  _ => '只读',
};

String _faultLabel(String value) => switch (value) {
  'exceptionCode' => '异常码',
  'timeout' => '超时',
  'noResponse' => '不响应',
  'outOfRange' => '越界',
  _ => '无',
};

class _RegisterValueCell extends StatefulWidget {
  const _RegisterValueCell({
    required this.register,
    required this.controller,
    required this.lastModified,
  });

  final SimulatorRegister register;
  final DeviceSimulatorController controller;
  final String? lastModified;

  @override
  State<_RegisterValueCell> createState() => _RegisterValueCellState();
}

class _RegisterValueCellState extends State<_RegisterValueCell>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<Color?> _colorAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 700),
      vsync: this,
    );
    _colorAnimation = ColorTween(
      begin: AppColors.primary.withValues(alpha: 0.5),
      end: AppColors.primary.withValues(alpha: 0.08),
    ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeOut));
  }

  @override
  void didUpdateWidget(covariant _RegisterValueCell oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.lastModified != oldWidget.lastModified && widget.lastModified != null) {
      _controller.forward(from: 0.0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final register = widget.register;
    final valueContent = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          '${_number(register.value)} ${register.unit}',
          style: monoStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(width: 6),
        const Icon(
          Icons.edit_outlined,
          size: 13,
          color: AppColors.primary,
        ),
      ],
    );

    return InkWell(
      key: Key('simulator-register-${register.id}'),
      onTap: () => _editRegister(context, widget.controller, register),
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          final color = _controller.isAnimating 
              ? _colorAnimation.value 
              : AppColors.primary.withValues(alpha: 0.08);

          return Container(
            constraints: const BoxConstraints(minWidth: 92),
            padding: const EdgeInsets.symmetric(
              horizontal: 10,
              vertical: 6,
            ),
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(7),
              border: Border.all(
                color: _controller.isAnimating
                    ? AppColors.primary.withValues(alpha: 0.55)
                    : AppColors.primary.withValues(alpha: 0.25),
              ),
            ),
            child: valueContent,
          );
        },
      ),
    );
  }
}
