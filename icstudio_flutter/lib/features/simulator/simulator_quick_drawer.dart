import 'dart:async';

import 'package:flutter/material.dart';
import 'package:icstudio_flutter/app/app_design.dart';
import 'package:icstudio_flutter/app/app_theme.dart';
import 'package:icstudio_flutter/features/simulator/device_simulator_controller.dart';
import 'package:icstudio_flutter/features/simulator/simulator_models.dart';

class SimulatorQuickDrawer extends StatefulWidget {
  const SimulatorQuickDrawer({
    required this.controller,
    required this.onClose,
    super.key,
  });

  final DeviceSimulatorController controller;
  final VoidCallback onClose;

  @override
  State<SimulatorQuickDrawer> createState() => _SimulatorQuickDrawerState();
}

class _SimulatorQuickDrawerState extends State<SimulatorQuickDrawer> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.controller,
      builder: (context, _) {
        final controller = widget.controller;
        final profile = controller.selectedProfile;
        final pinned = _resolve(profile, controller.pinnedRegisterIds);
        final recent = _resolve(profile, controller.recentRegisterIds);
        final normalized = _query.trim().toLowerCase();
        final results = profile.registers
            .where(
              (item) =>
                  normalized.isEmpty ||
                  item.name.toLowerCase().contains(normalized) ||
                  item.address.toString().contains(normalized) ||
                  item.group.toLowerCase().contains(normalized),
            )
            .take(12)
            .toList();
        return DefaultTabController(
          length: 2,
          child: Material(
            color: AppColors.surface,
            elevation: 20,
            child: Column(
              children: [
                Container(
                  padding: const EdgeInsets.fromLTRB(18, 16, 10, 10),
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [AppColors.surfaceRaised, AppColors.surface],
                    ),
                    border: Border(bottom: BorderSide(color: AppColors.border)),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [
                              AppColors.primary.withValues(alpha: 0.22),
                              AppColors.primary.withValues(alpha: 0.05),
                            ],
                          ),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: AppColors.primary.withValues(alpha: 0.3),
                          ),
                          boxShadow: AppDecor.glow(
                            AppColors.primary,
                            blur: 12,
                            opacity: 0.3,
                          ),
                        ),
                        child: const Icon(
                          Icons.tune_rounded,
                          color: AppColors.primary,
                          size: 19,
                        ),
                      ),
                      const SizedBox(width: 11),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              '模拟快调',
                              style: TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 15,
                              ),
                            ),
                            Text(
                              '${profile.name} · ${controller.running ? '运行中' : '未启动'}',
                              overflow: TextOverflow.ellipsis,
                              style: monoStyle(
                                color: controller.running
                                    ? AppColors.live
                                    : AppColors.textMuted,
                                fontSize: 9.5,
                              ),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        key: const Key('simulator-quick-close'),
                        onPressed: widget.onClose,
                        icon: const Icon(Icons.close_rounded),
                      ),
                    ],
                  ),
                ),
                const TabBar(
                  tabs: [
                    Tab(text: '寄存器快调'),
                    Tab(text: '报文记录'),
                  ],
                ),
                Expanded(
                  child: TabBarView(
                    children: [
                      ListView(
                        padding: const EdgeInsets.all(14),
                        children: [
                          TextField(
                            key: const Key('simulator-quick-search'),
                            decoration: const InputDecoration(
                              hintText: '搜索地址、名称或分组',
                              prefixIcon: Icon(Icons.search, size: 17),
                            ),
                            onChanged: (value) =>
                                setState(() => _query = value),
                          ),
                          const SizedBox(height: 14),
                          _QuickSection(
                            title: '常用快调',
                            helper: pinned.isEmpty
                                ? '在从机模拟页固定常用点'
                                : '已固定 ${pinned.length} 个寄存器',
                            registers: pinned,
                            controller: controller,
                          ),
                          const SizedBox(height: 14),
                          _QuickSection(
                            title: '最近修改',
                            helper: recent.isEmpty ? '尚无跨页面修改记录' : '最近修改的寄存器',
                            registers: recent,
                            controller: controller,
                          ),
                          const SizedBox(height: 14),
                          _QuickSection(
                            title: '快速搜索结果',
                            helper: '最多显示 12 个匹配点',
                            registers: results,
                            controller: controller,
                          ),
                        ],
                      ),
                      _FrameLog(controller: controller),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _QuickSection extends StatelessWidget {
  const _QuickSection({
    required this.title,
    required this.helper,
    required this.registers,
    required this.controller,
  });

  final String title;
  final String helper;
  final List<SimulatorRegister> registers;
  final DeviceSimulatorController controller;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 2),
        Text(
          helper,
          style: const TextStyle(color: AppColors.textFaint, fontSize: 9),
        ),
        const SizedBox(height: 8),
        if (registers.isEmpty)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.canvasAlt,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: AppColors.borderSoft),
            ),
            child: Text(
              helper,
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.textFaint, fontSize: 10),
            ),
          )
        else
          ...registers.map(
            (register) =>
                _QuickRegister(register: register, controller: controller),
          ),
      ],
    );
  }
}

class _QuickRegister extends StatelessWidget {
  const _QuickRegister({required this.register, required this.controller});
  final SimulatorRegister register;
  final DeviceSimulatorController controller;

  @override
  Widget build(BuildContext context) {
    final pinned = controller.pinnedRegisterIds.contains(register.id);
    return Container(
      margin: const EdgeInsets.only(bottom: 7),
      padding: const EdgeInsets.all(11),
      decoration: BoxDecoration(
        color: AppColors.canvas,
        borderRadius: BorderRadius.circular(9),
        border: Border.all(
          color: pinned
              ? AppColors.primary.withValues(alpha: 0.28)
              : AppColors.borderSoft,
        ),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      register.name,
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      '${register.address} · ${register.dataType} · ×${register.scale}',
                      style: monoStyle(
                        color: AppColors.textFaint,
                        fontSize: 9,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                visualDensity: VisualDensity.compact,
                tooltip: pinned ? '取消固定' : '固定',
                onPressed: () => controller.togglePin(register.id),
                icon: Icon(
                  pinned ? Icons.push_pin : Icons.push_pin_outlined,
                  size: 15,
                  color: pinned ? AppColors.primary : AppColors.textMuted,
                ),
              ),
            ],
          ),
          Row(
            children: [
              Expanded(
                child: TextFormField(
                  key: Key('simulator-quick-value-${register.id}'),
                  initialValue: _number(register.value),
                  style: monoStyle(fontSize: 13),
                  decoration: InputDecoration(
                    suffixText: register.unit,
                    helperText:
                        '${register.rangeMin ?? '-∞'} ~ ${register.rangeMax ?? '+∞'}',
                  ),
                  onFieldSubmitted: (value) =>
                      unawaited(controller.setRegisterValue(register, value)),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                controller.lastModified[register.id] ?? '未修改',
                style: monoStyle(color: AppColors.textFaint, fontSize: 9),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _FrameLog extends StatelessWidget {
  const _FrameLog({required this.controller});
  final DeviceSimulatorController controller;

  @override
  Widget build(BuildContext context) {
    final frames = controller.status?.frames ?? const [];
    if (frames.isEmpty) {
      return const Center(
        child: Text(
          '启动从机并接收主站请求后显示报文',
          style: TextStyle(color: AppColors.textFaint, fontSize: 10),
        ),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.all(14),
      itemCount: frames.length,
      separatorBuilder: (_, _) => const SizedBox(height: 7),
      itemBuilder: (context, index) {
        final frame = frames[index];
        final request = frame.direction == 'request';
        return Container(
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
                  Text(
                    request ? 'REQ' : 'RES',
                    style: monoStyle(
                      color: request ? AppColors.warning : AppColors.success,
                      fontWeight: FontWeight.w700,
                      fontSize: 9,
                      letterSpacing: 1,
                    ),
                  ),
                  const Spacer(),
                  Text(
                    frame.time,
                    style: monoStyle(color: AppColors.textFaint, fontSize: 9),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              SelectableText(
                frame.frame,
                style: monoStyle(
                  color: AppColors.text,
                  fontSize: 9.5,
                  height: 1.45,
                  letterSpacing: 0,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                frame.note,
                style: const TextStyle(color: AppColors.textMuted, fontSize: 9),
              ),
            ],
          ),
        );
      },
    );
  }
}

List<SimulatorRegister> _resolve(
  SimulatorProfile profile,
  Iterable<String> ids,
) => ids
    .map(
      (id) =>
          profile.registers.where((register) => register.id == id).firstOrNull,
    )
    .whereType<SimulatorRegister>()
    .toList();

String _number(double value) => value == value.roundToDouble()
    ? value.toInt().toString()
    : value.toString();
