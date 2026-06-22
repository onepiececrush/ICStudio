import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:icstudio_flutter/app/app_theme.dart';
import 'package:icstudio_flutter/app/app_design.dart';
import 'package:icstudio_flutter/features/simulator/device_simulator_controller.dart';
import 'package:icstudio_flutter/features/simulator/global_frame_log_drawer.dart';

class FrameLogStandaloneApp extends StatefulWidget {
  const FrameLogStandaloneApp({super.key});

  @override
  State<FrameLogStandaloneApp> createState() => _FrameLogStandaloneAppState();
}

class _FrameLogStandaloneAppState extends State<FrameLogStandaloneApp> {
  late final DeviceSimulatorController _controller;

  @override
  void initState() {
    super.initState();
    _controller = DeviceSimulatorController();
    // 强制开始定时拉取最新状态（哪怕从机是由另一个主应用进程拉起的，底层的 Rust Core 实例也是共享的）
    _controller.refresh();
    Timer.periodic(const Duration(milliseconds: 1000), (timer) {
      if (mounted) {
        unawaited(_controller.refresh());
      } else {
        timer.cancel();
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ICStudio 报文监视终端',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      home: Scaffold(
        body: BlueprintBackground(
          child: GlobalFrameLogDrawer(
            controller: _controller,
            onClose: () => exit(0),
            isStandalone: true,
          ),
        ),
      ),
    );
  }
}
