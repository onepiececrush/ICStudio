import 'dart:math' as math;
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
/// 画布蓝图网格 + 顶部辉光底纹。通过极慢网格滑动及环境光呼吸增加背景活性。
class BlueprintBackground extends StatefulWidget {
  const BlueprintBackground({required this.child, super.key});

  final Widget child;

  @override
  State<BlueprintBackground> createState() => _BlueprintBackgroundState();
}

class _BlueprintBackgroundState extends State<BlueprintBackground>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(seconds: 80),
      vsync: this,
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(gradient: AppColors.canvasGradient),
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          return CustomPaint(
            painter: _BlueprintPainter(animationValue: _controller.value),
            isComplex: true,
            willChange: true,
            child: child,
          );
        },
        child: widget.child,
      ),
    );
  }
}

class _BlueprintPainter extends CustomPainter {
  const _BlueprintPainter({required this.animationValue});

  final double animationValue;

  @override
  void paint(Canvas canvas, Size size) {
    const step = 32.0;
    // 极慢的漂移：网格沿 x, y 移动
    final offset = step * animationValue;

    final minor = Paint()
      ..color = const Color(0x06FFFFFF)
      ..strokeWidth = 1;
    final major = Paint()
      ..color = const Color(0x0C34E2E8)
      ..strokeWidth = 1;

    var i = 0;
    for (double x = offset - step; x <= size.width + step; x += step, i++) {
      if (x < 0) continue;
      canvas.drawLine(
        Offset(x, 0),
        Offset(x, size.height),
        i % 4 == 0 ? major : minor,
      );
    }
    i = 0;
    for (double y = offset - step; y <= size.height + step; y += step, i++) {
      if (y < 0) continue;
      canvas.drawLine(
        Offset(0, y),
        Offset(size.width, y),
        i % 4 == 0 ? major : minor,
      );
    }

    // 左上角辉光增加微妙的 12 秒周期正弦呼吸，模拟控制台环境光
    final wave = math.sin(animationValue * math.pi * 2 * 6.66);
    final glowScale = 0.95 + 0.05 * wave;

    final glow = Paint()
      ..shader = RadialGradient(
        colors: [
          AppColors.primary.withValues(alpha: 0.05 * glowScale),
          Colors.transparent,
        ],
      ).createShader(
        Rect.fromCircle(
          center: const Offset(0, 0),
          radius: size.width * 0.55 * glowScale,
        ),
      );
    canvas.drawRect(Offset.zero & size, glow);
  }

  @override
  bool shouldRepaint(covariant _BlueprintPainter oldDelegate) {
    return oldDelegate.animationValue != animationValue;
  }
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

/// 状态指示点（支持呼吸脉冲晕染）。
class StatusDot extends StatefulWidget {
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
  State<StatusDot> createState() => _StatusDotState();
}

class _StatusDotState extends State<StatusDot> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 2000),
      vsync: this,
    );
    if (widget.glow) {
      _controller.repeat();
    }
  }

  @override
  void didUpdateWidget(covariant StatusDot oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.glow != oldWidget.glow) {
      if (widget.glow) {
        _controller.repeat();
      } else {
        _controller.stop();
      }
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.glow) {
      return Container(
        width: widget.size,
        height: widget.size,
        decoration: BoxDecoration(
          color: widget.color,
          shape: BoxShape.circle,
        ),
      );
    }

    return SizedBox(
      width: widget.size,
      height: widget.size,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          final pulseValue = _controller.value;
          final outerOpacity = (1.0 - pulseValue) * 0.45;
          final outerSize = widget.size + (widget.size * 1.6 * pulseValue);

          return Stack(
            alignment: Alignment.center,
            clipBehavior: Clip.none,
            children: [
              Container(
                width: outerSize,
                height: outerSize,
                decoration: BoxDecoration(
                  color: widget.color.withValues(alpha: outerOpacity),
                  shape: BoxShape.circle,
                ),
              ),
              Container(
                width: widget.size,
                height: widget.size,
                decoration: BoxDecoration(
                  color: widget.color,
                  shape: BoxShape.circle,
                  boxShadow: AppDecor.glow(widget.color, blur: 8, opacity: 0.7),
                ),
              ),
            ],
          );
        },
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

/// 细量程轨道：[fraction] 为 null 时显示空闲基线，否则按比例填充并附带斜纹流动光效。
class ValueTrack extends StatefulWidget {
  const ValueTrack({required this.color, this.fraction, super.key});

  final Color color;
  final double? fraction;

  @override
  State<ValueTrack> createState() => _ValueTrackState();
}

class _ValueTrackState extends State<ValueTrack> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 1600),
      vsync: this,
    );
    if (widget.fraction != null) {
      _controller.repeat();
    }
  }

  @override
  void didUpdateWidget(covariant ValueTrack oldWidget) {
    super.didUpdateWidget(oldWidget);
    if ((widget.fraction != null) != (oldWidget.fraction != null)) {
      if (widget.fraction != null) {
        _controller.repeat();
      } else {
        _controller.stop();
      }
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final f = widget.fraction;
    if (f == null) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(3),
        child: SizedBox(
          height: 4,
          child: Stack(
            children: [
              Container(height: 4, color: AppColors.canvas),
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
        ),
      );
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(3),
      child: SizedBox(
        height: 4,
        child: AnimatedBuilder(
          animation: _controller,
          builder: (context, child) {
            return CustomPaint(
              painter: _ValueTrackPainter(
                color: widget.color,
                fraction: f,
                animationValue: _controller.value,
              ),
              child: const SizedBox.expand(),
            );
          },
        ),
      ),
    );
  }
}

class _ValueTrackPainter extends CustomPainter {
  const _ValueTrackPainter({
    required this.color,
    required this.fraction,
    required this.animationValue,
  });

  final Color color;
  final double fraction;
  final double animationValue;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final bgPaint = Paint()..color = AppColors.canvas;
    canvas.drawRect(rect, bgPaint);

    final w = size.width * fraction.clamp(0.0, 1.0);
    if (w <= 0) return;

    final progressRect = Rect.fromLTWH(0, 0, w, size.height);
    final fillPaint = Paint()
      ..shader = LinearGradient(
        colors: [color.withValues(alpha: 0.55), color],
      ).createShader(progressRect);

    canvas.drawRect(progressRect, fillPaint);

    canvas.save();
    canvas.clipRect(progressRect);

    final stripePaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.26)
      ..strokeWidth = 2.0
      ..strokeCap = StrokeCap.square;

    const stripeSpacing = 12.0;
    final offset = animationValue * stripeSpacing;

    for (double x = -stripeSpacing; x < w + stripeSpacing; x += stripeSpacing) {
      final startX = x + offset;
      canvas.drawLine(
        Offset(startX, 0),
        Offset(startX - 4, size.height),
        stripePaint,
      );
    }

    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _ValueTrackPainter oldDelegate) {
    return oldDelegate.color != color ||
        oldDelegate.fraction != fraction ||
        oldDelegate.animationValue != animationValue;
  }
}

/// 工业仪表盘风格四角定位标线装饰器
class TechCornerDecoration extends StatelessWidget {
  const TechCornerDecoration({
    required this.child,
    this.color,
    this.cornerSize = 7.0,
    this.strokeWidth = 1.2,
    super.key,
  });

  final Widget child;
  final Color? color;
  final double cornerSize;
  final double strokeWidth;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      foregroundPainter: _TechCornerPainter(
        color: color ?? AppColors.primary.withValues(alpha: 0.45),
        cornerSize: cornerSize,
        strokeWidth: strokeWidth,
      ),
      child: child,
    );
  }
}

class _TechCornerPainter extends CustomPainter {
  const _TechCornerPainter({
    required this.color,
    required this.cornerSize,
    required this.strokeWidth,
  });

  final Color color;
  final double cornerSize;
  final double strokeWidth;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = strokeWidth
      ..style = PaintingStyle.stroke;

    final w = size.width;
    final h = size.height;
    final s = cornerSize;

    // 左上角 L
    canvas.drawPath(
      Path()
        ..moveTo(0, s)
        ..lineTo(0, 0)
        ..lineTo(s, 0),
      paint,
    );

    // 右上角 L
    canvas.drawPath(
      Path()
        ..moveTo(w - s, 0)
        ..lineTo(w, 0)
        ..lineTo(w, s),
      paint,
    );

    // 左下角 L
    canvas.drawPath(
      Path()
        ..moveTo(0, h - s)
        ..lineTo(0, h)
        ..lineTo(s, h),
      paint,
    );

    // 右下角 L
    canvas.drawPath(
      Path()
        ..moveTo(w - s, h)
        ..lineTo(w, h)
        ..lineTo(w, h - s),
      paint,
    );
  }

  @override
  bool shouldRepaint(covariant _TechCornerPainter oldDelegate) {
    return oldDelegate.color != color ||
        oldDelegate.cornerSize != cornerSize ||
        oldDelegate.strokeWidth != strokeWidth;
  }
}

/// 环绕跑马灯流光描边装饰器，用于表达设备“运行中/自检中”的高能活性。
class FlowingBorderDecoration extends StatefulWidget {
  const FlowingBorderDecoration({
    required this.child,
    required this.running,
    required this.color,
    this.radius = 11.0,
    super.key,
  });

  final Widget child;
  final bool running;
  final Color color;
  final double radius;

  @override
  State<FlowingBorderDecoration> createState() => _FlowingBorderDecorationState();
}

class _FlowingBorderDecorationState extends State<FlowingBorderDecoration>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 2500),
      vsync: this,
    );
    if (widget.running) {
      _controller.repeat();
    }
  }

  @override
  void didUpdateWidget(covariant FlowingBorderDecoration oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.running != oldWidget.running) {
      if (widget.running) {
        _controller.repeat();
      } else {
        _controller.stop();
        _controller.reset();
      }
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.running) return widget.child;

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return CustomPaint(
          foregroundPainter: _FlowingBorderPainter(
            color: widget.color,
            radius: widget.radius,
            animationValue: _controller.value,
          ),
          child: child,
        );
      },
      child: widget.child,
    );
  }
}

class _FlowingBorderPainter extends CustomPainter {
  const _FlowingBorderPainter({
    required this.color,
    required this.radius,
    required this.animationValue,
  });

  final Color color;
  final double radius;
  final double animationValue;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final rrect = RRect.fromRectAndRadius(rect, Radius.circular(radius));

    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;

    final angle = animationValue * 2 * math.pi;
    paint.shader = SweepGradient(
      center: Alignment.center,
      startAngle: angle,
      endAngle: angle + 2 * math.pi,
      colors: [
        color.withValues(alpha: 0.05),
        color,
        color.withValues(alpha: 0.05),
      ],
      stops: const [0.0, 0.18, 0.35],
    ).createShader(rect);

    canvas.drawRRect(rrect, paint);
  }

  @override
  bool shouldRepaint(covariant _FlowingBorderPainter oldDelegate) {
    return oldDelegate.color != color ||
        oldDelegate.radius != radius ||
        oldDelegate.animationValue != animationValue;
  }
}
