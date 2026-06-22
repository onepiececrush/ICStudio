import 'package:flutter/material.dart';
import 'package:icstudio_flutter/app/app_theme.dart';

/// 「精密仪表」视觉基元：抬升面板装饰、辉光、蓝图网格、入场动效与小型仪表组件。
/// 全部为静态/一次性逻辑，不含循环动画，保证 `pumpAndSettle` 不会挂起。
abstract final class AppDecor {
  /// 抬升面板：自上而下的拉丝渐变 + 顶部高光描边 + 柔和投影。
  /// [accent] 不为空时附加同色辉光与左侧强调描边，用于「通电/选中」态。
  static BoxDecoration panel({
    bool raised = true,
    Color? accent,
    double radius = 14,
    double accentOpacity = 0.5,
  }) {
    return BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: raised
            ? const [AppColors.surfaceRaised, AppColors.surface]
            : const [AppColors.surface, AppColors.canvasAlt],
      ),
      borderRadius: BorderRadius.circular(radius),
      border: Border.all(
        color: accent?.withValues(alpha: 0.32) ?? AppColors.borderSoft,
      ),
      boxShadow: [
        // 主投影：把面板从画布上托起来
        const BoxShadow(
          color: Color(0x40000000),
          blurRadius: 22,
          offset: Offset(0, 10),
        ),
        // 顶部内高光：拉丝金属边缘
        const BoxShadow(
          color: Color(0x0FFFFFFF),
          blurRadius: 0,
          spreadRadius: -0.5,
          offset: Offset(0, 1),
        ),
        if (accent != null)
          BoxShadow(
            color: accent.withValues(alpha: accentOpacity * 0.28),
            blurRadius: 26,
            spreadRadius: -6,
            offset: const Offset(0, 6),
          ),
      ],
    );
  }

  /// 颜色辉光（用于主操作按钮 / 实时读数 / 在线状态）。
  static List<BoxShadow> glow(
    Color color, {
    double blur = 20,
    double opacity = 0.45,
  }) {
    return [
      BoxShadow(
        color: color.withValues(alpha: opacity),
        blurRadius: blur,
        spreadRadius: -4,
      ),
    ];
  }
}

/// 画布蓝图网格 + 顶部辉光底纹。极低透明度，只为营造纵深，不抢内容。
class BlueprintBackground extends StatelessWidget {
  const BlueprintBackground({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(gradient: AppColors.canvasGradient),
      child: CustomPaint(
        painter: _BlueprintPainter(),
        isComplex: true,
        willChange: false,
        child: child,
      ),
    );
  }
}

class _BlueprintPainter extends CustomPainter {
  const _BlueprintPainter();

  @override
  void paint(Canvas canvas, Size size) {
    const step = 32.0;
    final minor = Paint()
      ..color = const Color(0x06FFFFFF)
      ..strokeWidth = 1;
    final major = Paint()
      ..color = const Color(0x0E34E2E8)
      ..strokeWidth = 1;
    var i = 0;
    for (double x = 0; x <= size.width; x += step, i++) {
      canvas.drawLine(
        Offset(x, 0),
        Offset(x, size.height),
        i % 4 == 0 ? major : minor,
      );
    }
    i = 0;
    for (double y = 0; y <= size.height; y += step, i++) {
      canvas.drawLine(
        Offset(0, y),
        Offset(size.width, y),
        i % 4 == 0 ? major : minor,
      );
    }
    // 左上角辉光，模拟控制台环境光
    final glow = Paint()
      ..shader =
          RadialGradient(
            colors: [
              AppColors.primary.withValues(alpha: 0.05),
              Colors.transparent,
            ],
          ).createShader(
            Rect.fromCircle(
              center: const Offset(0, 0),
              radius: size.width * 0.5,
            ),
          );
    canvas.drawRect(Offset.zero & size, glow);
  }

  @override
  bool shouldRepaint(covariant _BlueprintPainter oldDelegate) => false;
}

/// 一次性入场动效：淡入 + 上浮。通过 [order] 错开时长形成级联效果。
/// 使用 TweenAnimationBuilder，不依赖定时器/控制器，`pumpAndSettle` 安全。
class RevealOnce extends StatelessWidget {
  const RevealOnce({required this.child, this.order = 0, super.key});

  final Widget child;
  final int order;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: Duration(milliseconds: 340 + order * 70),
      curve: Curves.easeOutCubic,
      builder: (context, t, child) {
        return Opacity(
          opacity: t.clamp(0.0, 1.0),
          child: Transform.translate(
            offset: Offset(0, (1 - t) * 16),
            child: child,
          ),
        );
      },
      child: child,
    );
  }
}

/// 状态指示点（可发光）。
class StatusDot extends StatelessWidget {
  const StatusDot({
    required this.color,
    this.size = 8,
    this.glow = true,
    super.key,
  });

  final Color color;
  final double size;
  final bool glow;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        boxShadow: glow ? AppDecor.glow(color, blur: 8, opacity: 0.7) : null,
      ),
    );
  }
}

/// 仪表小标签，用于段落/卡片的 kicker。
class Kicker extends StatelessWidget {
  const Kicker(
    this.text, {
    this.color = AppColors.textFaint,
    this.fontSize = 9.5,
    super.key,
  });

  final String text;
  final Color color;
  final double fontSize;

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: monoStyle(
        fontSize: fontSize,
        fontWeight: FontWeight.w600,
        color: color,
        letterSpacing: 0.8,
      ),
    );
  }
}

/// 细量程轨道：[fraction] 为 null 时显示空闲基线（未连接），否则按比例填充。
class ValueTrack extends StatelessWidget {
  const ValueTrack({required this.color, this.fraction, super.key});

  final Color color;
  final double? fraction;

  @override
  Widget build(BuildContext context) {
    final f = fraction;
    return ClipRRect(
      borderRadius: BorderRadius.circular(3),
      child: Stack(
        children: [
          Container(height: 4, color: AppColors.canvas),
          if (f != null)
            FractionallySizedBox(
              widthFactor: f.clamp(0.02, 1.0),
              child: Container(
                height: 4,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [color.withValues(alpha: 0.55), color],
                  ),
                  boxShadow: AppDecor.glow(color, blur: 6, opacity: 0.5),
                ),
              ),
            )
          else
            // 空闲态：等距刻度，呈现「待机仪表」观感
            Row(
              children: List.generate(
                24,
                (i) => Expanded(
                  child: Container(
                    height: 4,
                    margin: const EdgeInsets.only(right: 2),
                    color: i.isEven ? AppColors.borderSoft : Colors.transparent,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
