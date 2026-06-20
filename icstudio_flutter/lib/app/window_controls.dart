import 'package:flutter/services.dart';

abstract final class WindowControls {
  static const _channel = MethodChannel('icstudio/window');

  static Future<void> startDrag() => _channel.invokeMethod('startDrag');

  static Future<void> minimize() => _channel.invokeMethod('minimize');

  static Future<void> toggleMaximize() =>
      _channel.invokeMethod('toggleMaximize');

  static Future<void> close() => _channel.invokeMethod('close');

  static Future<String?> pickSimulatorProfile() =>
      _channel.invokeMethod<String>('pickSimulatorProfile');
}
