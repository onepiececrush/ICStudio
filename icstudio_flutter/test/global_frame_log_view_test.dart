import 'package:flutter_test/flutter_test.dart';
import 'package:icstudio_flutter/features/simulator/global_frame_log_view.dart';
import 'package:icstudio_flutter/src/rust/api/device_simulator.dart';

void main() {
  test('groups Modbus frame logs into read, write and other streams', () {
    final grouped = groupGlobalFrameLogViews([
      frame('request', '00 01 00 00 00 06 01 03 36 B1 00 01', 'FC03 读取'),
      frame('response', '00 02 00 00 00 06 01 10 36 D5 00 02', 'FC16 写入'),
      frame('request', 'LISTEN TCP 127.0.0.1:5020 UNIT 1', '当前模拟设备'),
    ]);

    expect(grouped.summary.total, 3);
    expect(grouped.read.single.operationLabel, '读取报文');
    expect(grouped.write.single.operationLabel, '写入报文');
    expect(grouped.other.single.operationLabel, '其他报文');
  });

  test('searches frame, note and operation labels', () {
    final grouped = groupGlobalFrameLogViews([
      frame('request', '00 01 00 00 00 06 01 03 36 B1 00 01', 'address=14001'),
      frame('request', '00 02 00 00 00 06 01 06 36 B6 00 01', 'address=14006'),
    ], '写入');

    expect(grouped.summary.total, 1);
    expect(grouped.write.single.frame.frame, contains('06 36 B6'));
  });
}

DeviceSimulatorFrame frame(String direction, String frame, String note) =>
    DeviceSimulatorFrame(
      direction: direction,
      time: '10:00:00',
      frame: frame,
      note: note,
    );
