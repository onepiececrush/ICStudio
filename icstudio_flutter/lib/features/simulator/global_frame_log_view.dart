import 'package:icstudio_flutter/src/rust/api/device_simulator.dart';

enum GlobalFrameOperation { read, write, other }

class GlobalFrameLogView {
  const GlobalFrameLogView({
    required this.id,
    required this.operation,
    required this.operationLabel,
    required this.frame,
  });

  final String id;
  final GlobalFrameOperation operation;
  final String operationLabel;
  final DeviceSimulatorFrame frame;
}

class GlobalFrameLogSummary {
  const GlobalFrameLogSummary({
    required this.total,
    required this.read,
    required this.write,
    required this.other,
  });

  final int total;
  final int read;
  final int write;
  final int other;
}

class GlobalFrameLogGroups {
  const GlobalFrameLogGroups({
    required this.all,
    required this.read,
    required this.write,
    required this.other,
    required this.summary,
  });

  final List<GlobalFrameLogView> all;
  final List<GlobalFrameLogView> read;
  final List<GlobalFrameLogView> write;
  final List<GlobalFrameLogView> other;
  final GlobalFrameLogSummary summary;
}

const _readFunctionCodes = {0x03, 0x04};
const _writeFunctionCodes = {0x05, 0x06, 0x0f, 0x10};

GlobalFrameLogGroups groupGlobalFrameLogViews(
  List<DeviceSimulatorFrame> logs, [
  String keyword = '',
]) {
  final views = logs.indexed.map(_toView).where(_matches(keyword)).toList();
  final read = views.where(
    (view) => view.operation == GlobalFrameOperation.read,
  );
  final write = views.where(
    (view) => view.operation == GlobalFrameOperation.write,
  );
  final other = views.where(
    (view) => view.operation == GlobalFrameOperation.other,
  );
  return GlobalFrameLogGroups(
    all: views,
    read: read.toList(),
    write: write.toList(),
    other: other.toList(),
    summary: GlobalFrameLogSummary(
      total: views.length,
      read: read.length,
      write: write.length,
      other: other.length,
    ),
  );
}

GlobalFrameLogView _toView((int, DeviceSimulatorFrame) item) {
  final operation = _operationFor(item.$2);
  return GlobalFrameLogView(
    id: '${item.$1}-${item.$2.time}-${item.$2.direction}-${item.$2.frame}',
    operation: operation,
    operationLabel: _operationLabel(operation),
    frame: item.$2,
  );
}

bool Function(GlobalFrameLogView) _matches(String keyword) {
  final query = keyword.trim().toLowerCase();
  return (view) => query.isEmpty || _searchText(view).contains(query);
}

String _searchText(GlobalFrameLogView view) => [
  view.frame.direction,
  view.frame.time,
  view.frame.frame,
  view.frame.note,
  view.operation.name,
  view.operationLabel,
].join(' ').toLowerCase();

GlobalFrameOperation _operationFor(DeviceSimulatorFrame frame) {
  final functionCode = _extractFunctionCode(frame);
  if (functionCode != null) return _operationFromFunctionCode(functionCode);
  return _operationFromNote(frame.note);
}

int? _extractFunctionCode(DeviceSimulatorFrame frame) {
  final bytes = _parseHexBytes(frame.frame);
  if (_isModbusTcpFrame(bytes)) return bytes[7];
  if (bytes.length >= 2) return bytes[1];
  return _functionCodeFromNote(frame.note);
}

List<int> _parseHexBytes(String frame) {
  final tokens = frame.trim().split(RegExp(r'\s+'));
  if (tokens.any((token) => !RegExp(r'^[0-9a-fA-F]{2}$').hasMatch(token))) {
    return const [];
  }
  return tokens.map((token) => int.parse(token, radix: 16)).toList();
}

bool _isModbusTcpFrame(List<int> bytes) =>
    bytes.length >= 8 && bytes[2] == 0x00 && bytes[3] == 0x00;

int? _functionCodeFromNote(String note) {
  final upper = note.toUpperCase();
  if (RegExp(r'\bFC(?:0?3|0?4)\b').hasMatch(upper)) return 0x03;
  if (RegExp(r'\bFC(?:0?5|0?6|0?F|15|10|16)\b').hasMatch(upper)) {
    return 0x10;
  }
  return null;
}

GlobalFrameOperation _operationFromFunctionCode(int functionCode) {
  final normalized = functionCode & 0x7f;
  if (_readFunctionCodes.contains(normalized)) return GlobalFrameOperation.read;
  if (_writeFunctionCodes.contains(normalized)) {
    return GlobalFrameOperation.write;
  }
  return GlobalFrameOperation.other;
}

GlobalFrameOperation _operationFromNote(String note) {
  if (RegExp('写|WRITE', caseSensitive: false).hasMatch(note)) {
    return GlobalFrameOperation.write;
  }
  if (RegExp('读|READ', caseSensitive: false).hasMatch(note)) {
    return GlobalFrameOperation.read;
  }
  return GlobalFrameOperation.other;
}

String _operationLabel(GlobalFrameOperation operation) => switch (operation) {
  GlobalFrameOperation.read => '读取报文',
  GlobalFrameOperation.write => '写入报文',
  GlobalFrameOperation.other => '其他报文',
};
