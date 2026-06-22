import 'package:flutter/material.dart';

/// Windows 本地字体族。
/// - [kFontSans] 使用系统 UI 字体，保证中文小字号清晰。
/// - [kFontMono] 使用 Windows 等宽字体，保证地址/功能码对齐。
const String kFontSans = 'Microsoft YaHei UI';
const String kFontMono = 'Consolas';

/// ICStudio「精密仪表」深色配色。
///
/// 设计意图：近黑画布 + 蓝图网格底纹，拉丝质感的抬升面板，电青/荧光绿作为
/// 「通电」强调色。相比旧配色，画布更深、面板与画布对比更强，层次更清晰。
abstract final class AppColors {
  // 画布（由深到浅的三层背景）
  static const canvas = Color(0xFF04080E);
  static const canvasAlt = Color(0xFF070D16);
  static const sidebar = Color(0xFF060B13);

  // 面板（抬升表面，自上而下渐亮模拟拉丝高光）
  static const surface = Color(0xFF0C1620);
  static const surfaceRaised = Color(0xFF13212F);
  static const surfaceSoft = Color(0xFF17293B);

  // 描边
  static const border = Color(0xFF20384A);
  static const borderSoft = Color(0xFF14283A);

  // 强调色
  static const primary = Color(0xFF34E2E8); // 电青 —— 交互/品牌
  static const primarySoft = Color(0xFF0E3742);
  static const live = Color(0xFFB9F33C); // 荧光绿 —— 实时/通电/迷你图
  static const success = Color(0xFF31E6A4);
  static const warning = Color(0xFFFFC24B);
  static const danger = Color(0xFFFF5C76);

  // 文本
  static const text = Color(0xFFEAF4F8);
  static const textMuted = Color(0xFFA9BBC9);
  static const textFaint = Color(0xFF7890A3);

  /// 画布主渐变（左上偏亮、右下沉入近黑），叠加蓝图网格后形成纵深。
  static const canvasGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF0A1422), canvas],
  );
}

/// 等宽数值文本样式（带表格数字，保证多位读数对齐）。
TextStyle monoStyle({
  double fontSize = 13,
  FontWeight fontWeight = FontWeight.w500,
  Color color = AppColors.text,
  double letterSpacing = 0,
  double? height,
}) {
  return TextStyle(
    fontFamily: kFontMono,
    fontSize: fontSize,
    fontWeight: fontWeight,
    color: color,
    letterSpacing: letterSpacing,
    height: height,
    fontFeatures: const [FontFeature.tabularFigures()],
  );
}

ThemeData buildAppTheme() {
  final scheme =
      ColorScheme.fromSeed(
        seedColor: AppColors.primary,
        brightness: Brightness.dark,
        surface: AppColors.surface,
      ).copyWith(
        primary: AppColors.primary,
        onPrimary: const Color(0xFF021A1E),
        secondary: AppColors.live,
        outline: AppColors.border,
        error: AppColors.danger,
      );
  final outlineBorder = OutlineInputBorder(
    borderRadius: BorderRadius.circular(9),
    borderSide: const BorderSide(color: AppColors.border),
  );
  return ThemeData(
    brightness: Brightness.dark,
    colorScheme: scheme,
    scaffoldBackgroundColor: AppColors.canvas,
    fontFamily: kFontSans,
    dividerColor: AppColors.border,
    visualDensity: VisualDensity.compact,
    splashFactory: InkSparkle.splashFactory,
    textTheme: const TextTheme(
      headlineSmall: TextStyle(
        color: AppColors.text,
        fontSize: 26,
        height: 1.1,
        fontWeight: FontWeight.w700,
        letterSpacing: 0,
      ),
      titleLarge: TextStyle(
        color: AppColors.text,
        fontSize: 18,
        fontWeight: FontWeight.w700,
        letterSpacing: 0,
      ),
      titleMedium: TextStyle(
        color: AppColors.text,
        fontSize: 13.5,
        fontWeight: FontWeight.w600,
        letterSpacing: 0,
      ),
      bodyLarge: TextStyle(color: AppColors.text, fontSize: 14),
      bodyMedium: TextStyle(color: AppColors.text, fontSize: 13),
      bodySmall: TextStyle(color: AppColors.textMuted, fontSize: 11),
    ),
    inputDecorationTheme: InputDecorationTheme(
      isDense: true,
      filled: true,
      fillColor: AppColors.canvas,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
      labelStyle: const TextStyle(color: AppColors.textMuted, fontSize: 12),
      floatingLabelStyle: const TextStyle(
        color: AppColors.primary,
        fontSize: 11,
        fontWeight: FontWeight.w600,
        letterSpacing: 0,
      ),
      border: outlineBorder,
      enabledBorder: outlineBorder,
      focusedBorder: outlineBorder.copyWith(
        borderSide: const BorderSide(color: AppColors.primary, width: 1.4),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.primary,
        foregroundColor: const Color(0xFF021A1E),
        minimumSize: const Size(0, 40),
        padding: const EdgeInsets.symmetric(horizontal: 17),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9)),
        textStyle: const TextStyle(
          fontFamily: kFontSans,
          fontSize: 12.5,
          fontWeight: FontWeight.w700,
          letterSpacing: 0,
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.text,
        minimumSize: const Size(0, 40),
        padding: const EdgeInsets.symmetric(horizontal: 15),
        side: const BorderSide(color: AppColors.border),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9)),
        textStyle: const TextStyle(
          fontFamily: kFontSans,
          fontSize: 12.5,
          fontWeight: FontWeight.w600,
          letterSpacing: 0,
        ),
      ),
    ),
    dataTableTheme: const DataTableThemeData(
      headingTextStyle: TextStyle(
        color: AppColors.textMuted,
        fontSize: 10.5,
        fontWeight: FontWeight.w700,
        letterSpacing: 0,
      ),
      dataTextStyle: TextStyle(color: AppColors.text, fontSize: 12.5),
      headingRowHeight: 40,
      dataRowMinHeight: 44,
      dataRowMaxHeight: 44,
      dividerThickness: 0.5,
    ),
    scrollbarTheme: ScrollbarThemeData(
      thumbColor: WidgetStateProperty.all(AppColors.border),
      radius: const Radius.circular(8),
      thickness: WidgetStateProperty.all(5),
    ),
  );
}
