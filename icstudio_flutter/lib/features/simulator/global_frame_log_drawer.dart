import 'dart:io';
import 'package:flutter/material.dart';
import 'package:icstudio_flutter/app/app_design.dart';
import 'package:icstudio_flutter/app/app_theme.dart';
import 'package:icstudio_flutter/features/simulator/device_simulator_controller.dart';
import 'package:icstudio_flutter/features/simulator/global_frame_log_view.dart';
import 'package:icstudio_flutter/src/rust/api/device_simulator.dart';

part 'global_frame_log_panel.dart';

class GlobalFrameLogDrawer extends StatefulWidget {
  const GlobalFrameLogDrawer({
    required this.controller,
    required this.onClose,
    this.isStandalone = false,
    super.key,
  });

  final DeviceSimulatorController controller;
  final VoidCallback onClose;
  final bool isStandalone;

  @override
  State<GlobalFrameLogDrawer> createState() => _GlobalFrameLogDrawerState();
}

class _GlobalFrameLogDrawerState extends State<GlobalFrameLogDrawer> {
  static const _minWidth = 560.0;
  static const _minHeight = 340.0;
  static const _defaultWidth = 860.0;
  static const _defaultHeight = 600.0;
  static const _margin = 14.0;
  static const _topGuard = 70.0;

  Offset? _origin;
  Size _size = const Size(_defaultWidth, _defaultHeight);
  String _query = '';
  String? _selectedId;
  bool _frozen = false;
  List<DeviceSimulatorFrame> _frozenFrames = const [];

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.controller,
      builder: (context, _) => LayoutBuilder(
        builder: (context, constraints) => _buildPositionedPanel(constraints),
      ),
    );
  }

  Widget _buildPositionedPanel(BoxConstraints constraints) {
    final bounds = _bounds(constraints);
    final grouped = groupGlobalFrameLogViews(_sourceFrames(), _query);
    final selected = grouped.all.where((item) => item.id == _selectedId);

    if (widget.isStandalone) {
      return _DrawerPanel(
        grouped: grouped,
        selected: selected.firstOrNull,
        query: _query,
        frozen: _frozen,
        liveCount: widget.controller.status?.frames.length ?? 0,
        onClose: widget.onClose,
        onDrag: (_) {},
        onResize: (_) {},
        onFreeze: _toggleFrozen,
        onQuery: (value) => setState(() => _query = value),
        onSelect: (id) => setState(() => _selectedId = id),
        isStandalone: true,
      );
    }

    return Stack(
      children: [
        Positioned(
          left: bounds.left,
          top: bounds.top,
          width: bounds.width,
          height: bounds.height,
          child: _DrawerPanel(
            grouped: grouped,
            selected: selected.firstOrNull,
            query: _query,
            frozen: _frozen,
            liveCount: widget.controller.status?.frames.length ?? 0,
            onClose: widget.onClose,
            onDrag: (delta) => _move(delta, constraints),
            onResize: (delta) => _resize(delta, constraints),
            onFreeze: _toggleFrozen,
            onQuery: (value) => setState(() => _query = value),
            onSelect: (id) => setState(() => _selectedId = id),
          ),
        ),
      ],
    );
  }

  List<DeviceSimulatorFrame> _sourceFrames() {
    if (_frozen) return _frozenFrames;
    return widget.controller.status?.frames ?? const [];
  }

  _FrameBounds _bounds(BoxConstraints constraints) {
    final maxWidth = (constraints.maxWidth - _margin * 2).clamp(320.0, 1200.0);
    final maxHeight = (constraints.maxHeight - _topGuard - _margin).clamp(
      280.0,
      760.0,
    );
    final width = _size.width.clamp(_minWidth, maxWidth);
    final height = _size.height.clamp(_minHeight, maxHeight);
    final fallback = Offset(constraints.maxWidth - width - 24, _topGuard);
    final origin = _origin ?? fallback;
    return _FrameBounds(
      left: origin.dx.clamp(_margin, constraints.maxWidth - width - _margin),
      top: origin.dy.clamp(_topGuard, constraints.maxHeight - height - _margin),
      width: width,
      height: height,
    );
  }

  void _move(Offset delta, BoxConstraints constraints) {
    final bounds = _bounds(constraints);
    setState(() {
      _origin = Offset(bounds.left + delta.dx, bounds.top + delta.dy);
    });
  }

  void _resize(Offset delta, BoxConstraints constraints) {
    final bounds = _bounds(constraints);
    setState(() {
      _size = Size(bounds.width + delta.dx, bounds.height + delta.dy);
    });
  }

  void _toggleFrozen() {
    setState(() {
      if (_frozen) {
        _frozen = false;
        _frozenFrames = const [];
        return;
      }
      _frozenFrames = List<DeviceSimulatorFrame>.from(
        widget.controller.status?.frames ?? const [],
      );
      _frozen = true;
    });
  }
}

class _FrameBounds {
  const _FrameBounds({
    required this.left,
    required this.top,
    required this.width,
    required this.height,
  });

  final double left;
  final double top;
  final double width;
  final double height;
}
