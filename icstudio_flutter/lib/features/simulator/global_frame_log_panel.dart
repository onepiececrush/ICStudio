part of 'global_frame_log_drawer.dart';

class _DrawerPanel extends StatelessWidget {
  const _DrawerPanel({
    required this.grouped,
    required this.selected,
    required this.query,
    required this.frozen,
    required this.liveCount,
    required this.onClose,
    required this.onDrag,
    required this.onResize,
    required this.onFreeze,
    required this.onQuery,
    required this.onSelect,
    this.isStandalone = false,
  });

  final GlobalFrameLogGroups grouped;
  final GlobalFrameLogView? selected;
  final String query;
  final bool frozen;
  final int liveCount;
  final VoidCallback onClose;
  final ValueChanged<Offset> onDrag;
  final ValueChanged<Offset> onResize;
  final VoidCallback onFreeze;
  final ValueChanged<String> onQuery;
  final ValueChanged<String> onSelect;
  final bool isStandalone;

  @override
  Widget build(BuildContext context) => Material(
    key: const Key('global-frame-drawer'),
    color: AppColors.surface,
    elevation: 24,
    borderRadius: isStandalone ? BorderRadius.zero : BorderRadius.circular(12),
    child: Stack(
      children: [
        Column(
          children: [
            _FrameHeader(
              summary: grouped.summary,
              liveCount: liveCount,
              frozen: frozen,
              onClose: onClose,
              onDrag: onDrag,
              onFreeze: onFreeze,
              isStandalone: isStandalone,
            ),
            _FrameToolbar(onQuery: onQuery),
            Expanded(
              child: _FrameStreams(grouped: grouped, onSelect: onSelect),
            ),
            _FrameDetail(frame: selected),
          ],
        ),
        if (!isStandalone) _ResizeHandle(onResize: onResize),
      ],
    ),
  );
}

class _FrameHeader extends StatelessWidget {
  const _FrameHeader({
    required this.summary,
    required this.liveCount,
    required this.frozen,
    required this.onClose,
    required this.onDrag,
    required this.onFreeze,
    this.isStandalone = false,
  });

  final GlobalFrameLogSummary summary;
  final int liveCount;
  final bool frozen;
  final VoidCallback onClose;
  final ValueChanged<Offset> onDrag;
  final VoidCallback onFreeze;
  final bool isStandalone;

  @override
  Widget build(BuildContext context) => GestureDetector(
    onPanUpdate: isStandalone ? null : (details) => onDrag(details.delta),
    child: Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 10, 12),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [AppColors.surfaceRaised, AppColors.surface],
        ),
        border: Border(bottom: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        children: [
          const Icon(Icons.cable_rounded, color: AppColors.primary, size: 22),
          const SizedBox(width: 10),
          _FrameTitle(summary: summary, liveCount: liveCount),
          TextButton.icon(
            key: const Key('global-frame-freeze'),
            onPressed: onFreeze,
            icon: Icon(frozen ? Icons.play_arrow_rounded : Icons.pause_rounded),
            label: Text(frozen ? '继续刷新' : '暂停刷新'),
          ),
          if (!isStandalone)
            IconButton(
              tooltip: '物理独立窗口运行',
              onPressed: () {
                Process.start(Platform.resolvedExecutable, ['--window=frame_log']);
              },
              icon: const Icon(Icons.open_in_new_rounded, size: 18, color: AppColors.primary),
            ),
          IconButton(
            key: const Key('global-frame-close'),
            onPressed: isStandalone ? () => exit(0) : onClose,
            icon: const Icon(Icons.close_rounded),
          ),
        ],
      ),
    ),
  );
}

class _FrameTitle extends StatelessWidget {
  const _FrameTitle({required this.summary, required this.liveCount});
  final GlobalFrameLogSummary summary;
  final int liveCount;

  @override
  Widget build(BuildContext context) => Expanded(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Kicker('GLOBAL FRAME MONITOR', fontSize: 8.5),
        Text('报文记录', style: Theme.of(context).textTheme.titleMedium),
        Text(
          '累计 $liveCount 条 · 显示 ${summary.total} 条 · 读取 ${summary.read} / 写入 ${summary.write}',
          style: monoStyle(color: AppColors.textFaint, fontSize: 9.5),
        ),
      ],
    ),
  );
}

class _FrameToolbar extends StatelessWidget {
  const _FrameToolbar({required this.onQuery});
  final ValueChanged<String> onQuery;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
    child: TextField(
      key: const Key('global-frame-search'),
      decoration: const InputDecoration(
        hintText: '搜索报文 / 地址 / FC10',
        prefixIcon: Icon(Icons.search_rounded, size: 17),
      ),
      onChanged: onQuery,
    ),
  );
}

class _FrameStreams extends StatelessWidget {
  const _FrameStreams({required this.grouped, required this.onSelect});
  final GlobalFrameLogGroups grouped;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      _FrameStream(title: '读取报文', frames: grouped.read, onSelect: onSelect),
      _FrameStream(title: '写入报文', frames: grouped.write, onSelect: onSelect),
      _FrameStream(title: '其他报文', frames: grouped.other, onSelect: onSelect),
    ],
  );
}

class _FrameStream extends StatelessWidget {
  const _FrameStream({
    required this.title,
    required this.frames,
    required this.onSelect,
  });

  final String title;
  final List<GlobalFrameLogView> frames;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) => Expanded(
    child: Container(
      margin: const EdgeInsets.fromLTRB(10, 0, 0, 10),
      decoration: BoxDecoration(
        color: AppColors.canvas,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.borderSoft),
      ),
      child: Column(
        children: [
          _FrameStreamHeader(title: title, count: frames.length),
          Expanded(
            child: _FrameList(frames: frames, onSelect: onSelect),
          ),
        ],
      ),
    ),
  );
}

class _FrameStreamHeader extends StatelessWidget {
  const _FrameStreamHeader({required this.title, required this.count});
  final String title;
  final int count;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(10),
    child: Row(children: [Text(title), const Spacer(), Text('$count')]),
  );
}

class _FrameList extends StatelessWidget {
  const _FrameList({required this.frames, required this.onSelect});
  final List<GlobalFrameLogView> frames;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    if (frames.isEmpty) return const Center(child: Text('暂无报文'));
    return ListView.builder(
      itemCount: frames.length,
      itemBuilder: (_, index) =>
          _FrameRow(frame: frames[index], onSelect: onSelect),
    );
  }
}

class _FrameRow extends StatefulWidget {
  const _FrameRow({required this.frame, required this.onSelect});
  final GlobalFrameLogView frame;
  final ValueChanged<String> onSelect;

  @override
  State<_FrameRow> createState() => _FrameRowState();
}

class _FrameRowState extends State<_FrameRow> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final frame = widget.frame;
    final request = frame.frame.direction == 'request';
    final hasError = frame.frame.note.contains('异常') ||
        frame.frame.note.toLowerCase().contains('error') ||
        frame.frame.note.contains('失败') ||
        frame.frame.note.contains('超时') ||
        frame.frame.note.contains('不响应') ||
        frame.frame.note.contains('越界');

    final Color badgeColor;
    final String directionText;
    final Color cardBg;

    if (request) {
      badgeColor = AppColors.primary;
      directionText = '→ REQ';
      cardBg = AppColors.primary.withValues(alpha: 0.02);
    } else if (hasError) {
      badgeColor = AppColors.danger;
      directionText = '⚠ ERROR';
      cardBg = AppColors.danger.withValues(alpha: 0.04);
    } else {
      badgeColor = AppColors.success;
      directionText = '← RES';
      cardBg = AppColors.success.withValues(alpha: 0.02);
    }

    final fcMatch = RegExp(r'FC\d+').stringMatch(frame.frame.note);
    final fcText = fcMatch ??
        (frame.operation == GlobalFrameOperation.read
            ? 'FC03'
            : (frame.operation == GlobalFrameOperation.write ? 'FC10' : 'FC'));

    final fcColor = frame.operation == GlobalFrameOperation.read
        ? const Color(0xFF34E8A8)
        : (frame.operation == GlobalFrameOperation.write
            ? const Color(0xFFB58CFF)
            : AppColors.textMuted);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: MouseRegion(
        onEnter: (_) => setState(() => _hovered = true),
        onExit: (_) => setState(() => _hovered = false),
        child: InkWell(
          onTap: () => widget.onSelect(frame.id),
          borderRadius: BorderRadius.circular(8),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOutCubic,
            transform: Matrix4.translationValues(0, _hovered ? -1.5 : 0, 0),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: _hovered
                  ? AppColors.surfaceSoft.withValues(alpha: 0.8)
                  : cardBg.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: _hovered
                    ? badgeColor.withValues(alpha: 0.45)
                    : hasError
                        ? AppColors.danger.withValues(alpha: 0.28)
                        : AppColors.borderSoft,
              ),
              boxShadow: _hovered
                  ? [
                      BoxShadow(
                        color: badgeColor.withValues(alpha: 0.12),
                        blurRadius: 8,
                        offset: const Offset(0, 3),
                      )
                    ]
                  : null,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      frame.frame.time,
                      style: monoStyle(fontSize: 9.5, color: AppColors.textFaint),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                      decoration: BoxDecoration(
                        color: fcColor.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(4),
                        border: Border.all(color: fcColor.withValues(alpha: 0.2)),
                      ),
                      child: Text(
                        fcText,
                        style: monoStyle(
                          fontSize: 8.5,
                          fontWeight: FontWeight.w700,
                          color: fcColor,
                        ),
                      ),
                    ),
                    const Spacer(),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: badgeColor.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(5),
                      ),
                      child: Text(
                        directionText,
                        style: monoStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w700,
                          color: badgeColor,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  frame.frame.frame,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: monoStyle(
                    fontSize: 10.5,
                    color: _hovered ? AppColors.text : AppColors.textMuted,
                    height: 1.3,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  frame.frame.note,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 10,
                    color: hasError
                        ? AppColors.danger
                        : _hovered
                            ? AppColors.textMuted
                            : AppColors.textFaint,
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

class _FrameDetail extends StatelessWidget {
  const _FrameDetail({required this.frame});
  final GlobalFrameLogView? frame;

  @override
  Widget build(BuildContext context) => Container(
    height: 96,
    width: double.infinity,
    margin: const EdgeInsets.fromLTRB(10, 0, 10, 10),
    padding: const EdgeInsets.all(11),
    decoration: AppDecor.panel(radius: 8),
    child: frame == null
        ? const Center(child: Text('未选中报文'))
        : SelectableText(
            '${frame!.operationLabel}\n${frame!.frame.frame}\n${frame!.frame.note}',
          ),
  );
}

class _ResizeHandle extends StatelessWidget {
  const _ResizeHandle({required this.onResize});
  final ValueChanged<Offset> onResize;

  @override
  Widget build(BuildContext context) => Positioned(
    right: 0,
    bottom: 0,
    child: GestureDetector(
      onPanUpdate: (details) => onResize(details.delta),
      child: const SizedBox(
        width: 26,
        height: 26,
        child: Icon(Icons.drag_handle_rounded, size: 16),
      ),
    ),
  );
}
