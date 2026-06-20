import 'package:flutter/material.dart';

enum AppModule {
  dashboard('工程首页', Icons.home_outlined),
  communication('通信调试', Icons.cable_outlined),
  hostVerification('主机验证', Icons.fact_check_outlined),
  protocol('协议管理', Icons.account_tree_outlined),
  devices('设备管理', Icons.memory_outlined),
  monitor('实时监控', Icons.monitor_heart_outlined),
  parameters('参数配置', Icons.tune_outlined),
  control('运行控制', Icons.electric_bolt_outlined),
  events('故障事件', Icons.warning_amber_outlined),
  waveform('波形录波', Icons.show_chart_outlined),
  history('历史数据', Icons.storage_outlined),
  autotest('自动化测试', Icons.science_outlined),
  simulator('从机模拟', Icons.developer_board_outlined),
  scada('SCADA 设计', Icons.dashboard_customize_outlined),
  data('数据服务', Icons.dns_outlined),
  upgrade('固件升级', Icons.system_update_alt_outlined),
  settings('系统设置', Icons.settings_outlined);

  const AppModule(this.label, this.icon);

  final String label;
  final IconData icon;
}
