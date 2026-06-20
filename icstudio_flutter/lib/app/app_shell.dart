import 'dart:async';

import 'package:flutter/material.dart';
import 'package:icstudio_flutter/app/app_design.dart';
import 'package:icstudio_flutter/app/navigation.dart';
import 'package:icstudio_flutter/app/app_theme.dart';
import 'package:icstudio_flutter/app/window_controls.dart';
import 'package:icstudio_flutter/features/dashboard/dashboard_page.dart';
import 'package:icstudio_flutter/features/monitor/realtime_monitor_page.dart';
import 'package:icstudio_flutter/features/simulator/device_simulator_controller.dart';
import 'package:icstudio_flutter/features/simulator/device_simulator_page.dart';
import 'package:icstudio_flutter/features/simulator/simulator_quick_drawer.dart';
import 'package:icstudio_flutter/src/rust/api/backend.dart';
import 'package:icstudio_flutter/src/rust/api/connection.dart';
import 'package:icstudio_flutter/src/rust/api/simulator.dart';
import 'package:icstudio_flutter/src/rust/api/snapshot.dart';

class AppShell extends StatefulWidget {
  const AppShell({
    required this.backendStatus,
    required this.snapshot,
    super.key,
  });

  final BackendStatus backendStatus;
  final AppSnapshot snapshot;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  AppModule _activeModule = AppModule.dashboard;
  late AppSnapshot _snapshot;
  bool _connectionBusy = false;
  bool _simulatorRunning = false;
  String? _connectionError;
  Timer? _pollTimer;
  late final DeviceSimulatorController _deviceSimulatorController;
  bool _quickDrawerOpen = false;

  @override
  void initState() {
    super.initState();
    _snapshot = widget.snapshot;
    _deviceSimulatorController = DeviceSimulatorController();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _deviceSimulatorController.dispose();
    if (_simulatorRunning) {
      try {
        stopHomeSelfTest();
      } catch (_) {
        // The process teardown will release the local-only simulator resources.
      }
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          BlueprintBackground(
            child: Column(
              children: [
                _TitleBar(
                  backendStatus: widget.backendStatus,
                  snapshot: _snapshot,
                  simulatorController: _deviceSimulatorController,
                  onOpenQuickDrawer: () {
                    setState(() => _quickDrawerOpen = true);
                  },
                ),
                Expanded(
                  child: Row(
                    children: [
                      _Sidebar(
                        activeModule: _activeModule,
                        onSelected: (module) {
                          setState(() => _activeModule = module);
                        },
                      ),
                      Expanded(
                        child: Column(
                          children: [
                            // 模块切换过渡：淡入 + 轻微上浮，避免硬切。
                            // 用 AnimatedSwitcher（一次性，会自然收敛），
                            // KeyedSubtree 以当前模块为 key 触发切换。
                            Expanded(
                              child: AnimatedSwitcher(
                                duration: const Duration(milliseconds: 260),
                                switchInCurve: Curves.easeOutCubic,
                                switchOutCurve: Curves.easeIn,
                                transitionBuilder: (child, animation) {
                                  return FadeTransition(
                                    opacity: animation,
                                    child: SlideTransition(
                                      position: Tween<Offset>(
                                        begin: const Offset(0, 0.02),
                                        end: Offset.zero,
                                      ).animate(animation),
                                      child: child,
                                    ),
                                  );
                                },
                                child: KeyedSubtree(
                                  key: ValueKey(_activeModule),
                                  child: _buildWorkspace(),
                                ),
                              ),
                            ),
                            _StatusBar(
                              snapshot: _snapshot,
                              bridgeReady: widget.backendStatus.bridgeReady,
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
          // 快调抽屉：遮罩淡入、面板自右滑入。
          // 用 AnimatedSwitcher 包裹，关闭时先播放退场动画再从树中卸载，
          // 既有过渡观感，又保证关闭后控件被移除（满足 findsNothing 契约）。
          Positioned.fill(
            top: 60,
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 200),
              child: _quickDrawerOpen
                  ? GestureDetector(
                      key: const Key('simulator-quick-scrim'),
                      onTap: () => setState(() => _quickDrawerOpen = false),
                      child: Container(
                        color: Colors.black.withValues(alpha: 0.45),
                      ),
                    )
                  : const SizedBox.shrink(key: ValueKey('quick-scrim-off')),
            ),
          ),
          Positioned(
            top: 60,
            right: 0,
            bottom: 0,
            width: 400,
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 260),
              switchInCurve: Curves.easeOutCubic,
              switchOutCurve: Curves.easeInCubic,
              transitionBuilder: (child, animation) {
                return FadeTransition(
                  opacity: animation,
                  child: SlideTransition(
                    position: Tween<Offset>(
                      begin: const Offset(1, 0),
                      end: Offset.zero,
                    ).animate(animation),
                    child: child,
                  ),
                );
              },
              child: _quickDrawerOpen
                  ? SimulatorQuickDrawer(
                      key: const ValueKey('quick-drawer'),
                      controller: _deviceSimulatorController,
                      onClose: () => setState(() => _quickDrawerOpen = false),
                    )
                  : const SizedBox.shrink(key: ValueKey('quick-drawer-off')),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildWorkspace() {
    if (_activeModule == AppModule.dashboard) {
      return DashboardPage(
        snapshot: _snapshot,
        connectionBusy: _connectionBusy,
        simulatorRunning: _simulatorRunning,
        connectionError: _connectionError,
        onConnect: _connect,
        onDisconnect: _disconnect,
        onRefresh: _refresh,
        onStartSelfTest: _startSelfTest,
        onStopSelfTest: _stopSelfTest,
      );
    }
    if (_activeModule == AppModule.monitor) {
      return RealtimeMonitorPage(
        snapshot: _snapshot,
        busy: _connectionBusy,
        error: _connectionError,
        onRefresh: _refresh,
      );
    }
    if (_activeModule == AppModule.simulator) {
      return DeviceSimulatorPage(controller: _deviceSimulatorController);
    }
    return _ModulePlaceholder(module: _activeModule);
  }

  Future<void> _connect(String host, int port, int unitId) async {
    final connected = await _runConnectionAction(
      () => connectHomeModbus(host: host, port: port, unitId: unitId),
    );
    if (connected) _startPolling();
  }

  Future<void> _refresh() async {
    final refreshed = await _runConnectionAction(refreshHomeModbus);
    if (!refreshed) _stopPolling();
  }

  Future<void> _disconnect() async {
    if (_simulatorRunning) {
      await _stopSelfTest();
      return;
    }
    _stopPolling();
    await _runConnectionAction(() async => disconnectHomeModbus());
  }

  Future<void> _startSelfTest() async {
    final started = await _runConnectionAction(
      () => startHomeSelfTest(host: '127.0.0.1', port: 1502, unitId: 1),
    );
    if (!mounted || !started) return;
    setState(() => _simulatorRunning = true);
    _startPolling();
  }

  Future<void> _stopSelfTest() async {
    _stopPolling();
    setState(() {
      _connectionBusy = true;
      _connectionError = null;
    });
    try {
      stopHomeSelfTest();
      if (!mounted) return;
      setState(() {
        _snapshot = getAppSnapshot();
        _simulatorRunning = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _connectionError = error.toString());
    } finally {
      if (mounted) setState(() => _connectionBusy = false);
    }
  }

  Future<bool> _runConnectionAction(
    Future<HomeConnectionStatus> Function() action,
  ) async {
    setState(() {
      _connectionBusy = true;
      _connectionError = null;
    });
    try {
      await action();
      if (!mounted) return false;
      setState(() => _snapshot = getAppSnapshot());
      return true;
    } catch (error) {
      if (!mounted) return false;
      setState(() {
        _snapshot = getAppSnapshot();
        _connectionError = error.toString();
      });
      return false;
    } finally {
      if (mounted) {
        setState(() => _connectionBusy = false);
      }
    }
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 2), (_) {
      if (mounted && !_connectionBusy) unawaited(_refresh());
    });
  }

  void _stopPolling() {
    _pollTimer?.cancel();
    _pollTimer = null;
  }
}

class _TitleBar extends StatelessWidget {
  const _TitleBar({
    required this.backendStatus,
    required this.snapshot,
    required this.simulatorController,
    required this.onOpenQuickDrawer,
  });

  final BackendStatus backendStatus;
  final AppSnapshot snapshot;
  final DeviceSimulatorController simulatorController;
  final VoidCallback onOpenQuickDrawer;

  @override
  Widget build(BuildContext context) {
    final connected = snapshot.connection.status == '已连接';
    return GestureDetector(
      behavior: HitTestBehavior.translucent,
      onPanStart: (_) => unawaited(WindowControls.startDrag()),
      onDoubleTap: () => unawaited(WindowControls.toggleMaximize()),
      child: Container(
        height: 60,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF0B1622), Color(0xFF070E17)],
          ),
          border: Border(bottom: BorderSide(color: AppColors.borderSoft)),
        ),
        child: Row(
          children: [
            const SizedBox(
              width: 196,
              child: Padding(
                padding: EdgeInsets.symmetric(horizontal: 12),
                child: Row(
                  children: [
                    _WindowButtons(),
                    SizedBox(width: 13),
                    _BrandMark(),
                    SizedBox(width: 9),
                    Expanded(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'ICStudio',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: AppColors.text,
                              fontSize: 14.5,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.3,
                            ),
                          ),
                          Text(
                            'INDUSTRIAL HMI',
                            style: TextStyle(
                              fontFamily: kFontMono,
                              color: AppColors.textFaint,
                              fontSize: 7.5,
                              fontWeight: FontWeight.w500,
                              letterSpacing: 2.2,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(
              height: 26,
              child: VerticalDivider(width: 1, color: AppColors.border),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 18),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Kicker('当前工程', fontSize: 8.5),
                    const SizedBox(height: 3),
                    Text(
                      snapshot.project.name,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: AppColors.text,
                        fontSize: 13.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            AnimatedBuilder(
              animation: simulatorController,
              builder: (context, _) {
                final running = simulatorController.running;
                return Padding(
                  padding: const EdgeInsets.only(right: 10),
                  child: OutlinedButton.icon(
                    key: const Key('simulator-quick-open'),
                    onPressed: onOpenQuickDrawer,
                    icon: Icon(
                      Icons.tune_rounded,
                      size: 15,
                      color: running ? AppColors.live : AppColors.primary,
                    ),
                    label: Text(
                      '模拟快调 ${simulatorController.pinnedRegisterIds.length}',
                    ),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size(0, 34),
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      side: BorderSide(
                        color: running
                            ? AppColors.live.withValues(alpha: 0.4)
                            : AppColors.border,
                      ),
                    ),
                  ),
                );
              },
            ),
            _StatusChip(
              icon: connected ? Icons.lan_rounded : Icons.link_off_rounded,
              label: snapshot.connection.status,
              detail: snapshot.connection.endpoint,
              color: connected ? AppColors.success : AppColors.warning,
            ),
            const SizedBox(width: 8),
            _StatusChip(
              icon: Icons.memory_rounded,
              label: backendStatus.bridgeReady ? 'Rust Core' : 'Core 异常',
              detail: 'v${backendStatus.version}',
              color: backendStatus.bridgeReady
                  ? AppColors.primary
                  : AppColors.danger,
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              child: Row(
                children: [
                  Container(
                    width: 30,
                    height: 30,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [AppColors.surfaceSoft, AppColors.surface],
                      ),
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: AppColors.primary.withValues(alpha: 0.35),
                      ),
                    ),
                    child: Text(
                      snapshot.project.operator_.characters.first.toUpperCase(),
                      style: const TextStyle(
                        color: AppColors.primary,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    snapshot.project.operator_,
                    style: const TextStyle(
                      color: AppColors.textMuted,
                      fontSize: 11.5,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BrandMark extends StatelessWidget {
  const _BrandMark();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 26,
      height: 26,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.primary, Color(0xFF1C9FB6)],
        ),
        borderRadius: BorderRadius.circular(8),
        boxShadow: AppDecor.glow(AppColors.primary, blur: 12, opacity: 0.5),
      ),
      child: const Icon(Icons.bolt_rounded, size: 16, color: Color(0xFF04181C)),
    );
  }
}

class _WindowButtons extends StatelessWidget {
  const _WindowButtons();

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _WindowButton(
          key: const Key('window-close'),
          color: const Color(0xFFFF625A),
          icon: Icons.close_rounded,
          onTap: WindowControls.close,
        ),
        const SizedBox(width: 6),
        _WindowButton(
          key: const Key('window-minimize'),
          color: const Color(0xFFFFBE3D),
          icon: Icons.remove_rounded,
          onTap: WindowControls.minimize,
        ),
        const SizedBox(width: 6),
        _WindowButton(
          key: const Key('window-maximize'),
          color: const Color(0xFF2BD04F),
          icon: Icons.open_in_full_rounded,
          onTap: WindowControls.toggleMaximize,
        ),
      ],
    );
  }
}

class _WindowButton extends StatefulWidget {
  const _WindowButton({
    super.key,
    required this.color,
    required this.icon,
    required this.onTap,
  });

  final Color color;
  final IconData icon;
  final Future<void> Function() onTap;

  @override
  State<_WindowButton> createState() => _WindowButtonState();
}

class _WindowButtonState extends State<_WindowButton> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => unawaited(widget.onTap()),
        child: SizedBox.square(
          dimension: 12,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: widget.color,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: widget.color.withValues(alpha: 0.32),
                  blurRadius: _hovered ? 7 : 0,
                ),
              ],
            ),
            child: _hovered
                ? Icon(widget.icon, size: 8, color: const Color(0xAA301A18))
                : null,
          ),
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({
    required this.icon,
    required this.label,
    required this.detail,
    required this.color,
  });

  final IconData icon;
  final String label;
  final String detail;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 40,
      constraints: const BoxConstraints(minWidth: 110, maxWidth: 138),
      padding: const EdgeInsets.symmetric(horizontal: 11),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [AppColors.surfaceRaised, AppColors.surface],
        ),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.22)),
      ),
      child: Row(
        children: [
          Container(
            width: 24,
            height: 24,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(7),
            ),
            child: Icon(icon, size: 14, color: color),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppColors.text,
                    fontSize: 10.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                Text(
                  detail,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: monoStyle(
                    fontSize: 9,
                    color: AppColors.textFaint,
                    fontWeight: FontWeight.w400,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Sidebar extends StatelessWidget {
  const _Sidebar({required this.activeModule, required this.onSelected});

  final AppModule activeModule;
  final ValueChanged<AppModule> onSelected;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 196,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF080F18), AppColors.sidebar],
        ),
        border: Border(right: BorderSide(color: AppColors.borderSoft)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(18, 16, 16, 9),
            child: Kicker('工作区'),
          ),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.fromLTRB(10, 0, 10, 12),
              itemCount: AppModule.values.length,
              itemBuilder: (context, index) {
                final module = AppModule.values[index];
                // 入场级联：每个导航项按序错开淡入上浮。
                return RevealOnce(
                  order: index,
                  child: _NavTile(
                    module: module,
                    selected: module == activeModule,
                    onTap: () => onSelected(module),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _NavTile extends StatefulWidget {
  const _NavTile({
    required this.module,
    required this.selected,
    required this.onTap,
  });

  final AppModule module;
  final bool selected;
  final VoidCallback onTap;

  @override
  State<_NavTile> createState() => _NavTileState();
}

class _NavTileState extends State<_NavTile> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final selected = widget.selected;
    final fg = selected
        ? AppColors.primary
        : (_hovered ? AppColors.text : AppColors.textMuted);
    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: MouseRegion(
        onEnter: (_) => setState(() => _hovered = true),
        onExit: (_) => setState(() => _hovered = false),
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: widget.onTap,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            height: 38,
            decoration: BoxDecoration(
              gradient: selected
                  ? LinearGradient(
                      colors: [
                        AppColors.primary.withValues(alpha: 0.16),
                        AppColors.primary.withValues(alpha: 0.02),
                      ],
                    )
                  : null,
              color: selected
                  ? null
                  : (_hovered ? AppColors.surface.withValues(alpha: 0.6) : null),
              borderRadius: BorderRadius.circular(9),
              border: Border.all(
                color: selected
                    ? AppColors.primary.withValues(alpha: 0.22)
                    : Colors.transparent,
              ),
            ),
            child: Row(
              children: [
                AnimatedContainer(
                  duration: const Duration(milliseconds: 160),
                  width: 3,
                  height: selected ? 20 : 0,
                  margin: const EdgeInsets.only(right: 9),
                  decoration: BoxDecoration(
                    color: AppColors.primary,
                    borderRadius: const BorderRadius.horizontal(
                      right: Radius.circular(3),
                    ),
                    boxShadow: AppDecor.glow(
                      AppColors.primary,
                      blur: 8,
                      opacity: 0.7,
                    ),
                  ),
                ),
                if (!selected) const SizedBox(width: 12),
                Icon(widget.module.icon, size: 17, color: fg),
                const SizedBox(width: 11),
                Text(
                  widget.module.label,
                  style: TextStyle(
                    color: fg,
                    fontSize: 12.5,
                    fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StatusBar extends StatelessWidget {
  const _StatusBar({required this.snapshot, required this.bridgeReady});

  final AppSnapshot snapshot;
  final bool bridgeReady;

  @override
  Widget build(BuildContext context) {
    final color = bridgeReady ? AppColors.success : AppColors.danger;
    return Container(
      height: 30,
      padding: const EdgeInsets.symmetric(horizontal: 14),
      decoration: const BoxDecoration(
        color: AppColors.sidebar,
        border: Border(top: BorderSide(color: AppColors.borderSoft)),
      ),
      child: Row(
        children: [
          StatusDot(color: color, size: 7),
          const SizedBox(width: 8),
          Text(
            bridgeReady ? 'Rust 服务正常' : 'Rust 服务异常',
            style: const TextStyle(color: AppColors.textMuted, fontSize: 10.5),
          ),
          const Spacer(),
          Text(
            'LATENCY ${snapshot.connection.latencyMs}ms',
            style: monoStyle(fontSize: 9.5, color: AppColors.textFaint),
          ),
          const SizedBox(width: 14),
          Text(
            'SUCCESS ${snapshot.connection.successRate.toStringAsFixed(1)}%',
            style: monoStyle(fontSize: 9.5, color: AppColors.textFaint),
          ),
        ],
      ),
    );
  }
}

class _ModulePlaceholder extends StatelessWidget {
  const _ModulePlaceholder({required this.module});

  final AppModule module;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: RevealOnce(
        child: Container(
          width: 440,
          padding: const EdgeInsets.all(30),
          decoration: AppDecor.panel(),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      AppColors.primary.withValues(alpha: 0.18),
                      AppColors.primary.withValues(alpha: 0.04),
                    ],
                  ),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: AppColors.primary.withValues(alpha: 0.25),
                  ),
                ),
                child: Icon(module.icon, size: 24, color: AppColors.primary),
              ),
              const SizedBox(height: 16),
              Text(module.label, style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 8),
              const Text(
                '该模块将在后续阶段迁移',
                style: TextStyle(color: AppColors.textMuted, fontSize: 12),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
