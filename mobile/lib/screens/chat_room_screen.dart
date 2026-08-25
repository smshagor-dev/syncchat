import 'package:flutter/material.dart';

import '../sheets.dart';
import '../theme.dart';
import '../widgets.dart';
import 'core_screens.dart';
import 'parity_surface_screen.dart';

class ChatRoomScreen extends StatefulWidget {
  const ChatRoomScreen({
    super.key,
    required this.name,
    this.group = false,
  });

  final String name;
  final bool group;

  @override
  State<ChatRoomScreen> createState() => _ChatRoomScreenState();
}

class _ChatRoomScreenState extends State<ChatRoomScreen> {
  final controller = TextEditingController();
  bool searchOpen = false;
  bool recording = false;
  bool replyVisible = false;

  static const messages = [
    (false, 'Can you check the new SyncChat mobile layout?', '10:34 PM'),
    (true, 'Yes. I am matching the web mobile view page by page.', '10:35 PM'),
    (false, 'Keep the bottom navigation and room appearance too.', '10:36 PM'),
    (true, 'Pinned messages, attachments, calls and tools stay in scope.', '10:37 PM'),
    (false, 'Perfect. Do not miss any screen.', '10:38 PM'),
  ];

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.isDark ? SyncColors.spill900 : SyncColors.slate100,
      body: SafeArea(
        child: Column(
          children: [
            _roomHeader(context),
            if (searchOpen)
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                child: TextField(
                  autofocus: true,
                  decoration: InputDecoration(
                    hintText: 'Search in chat...',
                    prefixIcon: const Icon(Icons.search_rounded),
                    suffixIcon: IconButton(
                      onPressed: () => setState(() => searchOpen = false),
                      icon: const Icon(Icons.close_rounded),
                    ),
                  ),
                ),
              ),
            _pinnedBanner(context),
            Expanded(
              child: CustomPaint(
                painter: _WallpaperPainter(dark: context.isDark),
                child: ListView.builder(
                  padding: const EdgeInsets.fromLTRB(12, 12, 12, 18),
                  itemCount: messages.length + 2,
                  itemBuilder: (context, index) {
                    if (index == 0) {
                      return const _DayChip(label: 'Today');
                    }
                    if (index == 4) {
                      return const _SystemChip(label: 'Messages are protected in this room');
                    }
                    final messageIndex = index > 4 ? index - 2 : index - 1;
                    final message = messages[messageIndex];
                    return _MessageBubble(
                      mine: message.$1,
                      text: message.$2,
                      time: message.$3,
                      onLongPress: () => _showMessageActions(context),
                    );
                  },
                ),
              ),
            ),
            if (replyVisible)
              Container(
                color: context.panel,
                padding: const EdgeInsets.fromLTRB(12, 7, 12, 4),
                child: Row(
                  children: [
                    Container(width: 3, height: 36, color: SyncColors.sky),
                    const SizedBox(width: 9),
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Replying to Atia', style: TextStyle(fontWeight: FontWeight.w800)),
                          Text(
                            'Keep the bottom navigation and room appearance too.',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: () => setState(() => replyVisible = false),
                      icon: const Icon(Icons.close_rounded, size: 18),
                    ),
                  ],
                ),
              ),
            _composer(context),
          ],
        ),
      ),
    );
  }

  Widget _roomHeader(BuildContext context) {
    return Container(
      color: context.panel,
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.pop(context),
            icon: const Icon(Icons.arrow_back_rounded),
          ),
          SyncAvatar(name: widget.name, online: !widget.group, radius: 20),
          const SizedBox(width: 10),
          Expanded(
            child: InkWell(
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => ParitySurfaceScreen(
                    title: widget.group ? 'Group profile' : 'Friend profile',
                  ),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w900),
                  ),
                  Text(
                    widget.group ? '8 participants · secure content' : 'online',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 12, color: context.muted),
                  ),
                ],
              ),
            ),
          ),
          IconButton(
            onPressed: () => setState(() => searchOpen = !searchOpen),
            icon: Icon(searchOpen ? Icons.close_rounded : Icons.search_rounded),
          ),
          IconButton(
            onPressed: () => _openCall(context, video: false),
            icon: const Icon(Icons.call_outlined),
          ),
          IconButton(
            onPressed: () => _openCall(context, video: true),
            icon: const Icon(Icons.videocam_outlined),
          ),
          IconButton(
            onPressed: () => showRoomActionsSheet(
              context,
              onOpenTools: () => Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => const ChatToolsScreen()),
              ),
              onOpenAppearance: () => Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => const RoomAppearanceScreen()),
              ),
            ),
            icon: const Icon(Icons.more_vert_rounded),
          ),
        ],
      ),
    );
  }

  Widget _pinnedBanner(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 0, 12, 8),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: context.panel.withOpacity(.95),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.border),
      ),
      child: Row(
        children: [
          const Icon(Icons.push_pin_outlined, size: 17, color: SyncColors.sky),
          const SizedBox(width: 7),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Pinned Messages (2)',
                  style: TextStyle(
                    color: SyncColors.sky,
                    fontSize: 11,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                Text(
                  'release checklist',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                ),
              ],
            ),
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            onPressed: () => showSyncSheet(
              context,
              title: 'Pinned messages',
              actions: const [
                SyncSheetAction(
                  label: 'Release checklist',
                  subtitle: 'Pinned by Atia',
                  icon: Icons.push_pin_outlined,
                ),
                SyncSheetAction(
                  label: 'Design reference',
                  subtitle: 'Pinned by you',
                  icon: Icons.push_pin_outlined,
                ),
                SyncSheetAction(label: 'Pin history', icon: Icons.history_rounded),
              ],
            ),
            icon: const Icon(Icons.keyboard_arrow_down_rounded),
          ),
        ],
      ),
    );
  }

  Widget _composer(BuildContext context) {
    final bottom = MediaQuery.paddingOf(context).bottom + 8;
    return Container(
      color: context.panel,
      padding: EdgeInsets.fromLTRB(8, 7, 8, bottom),
      child: recording ? _recordingComposer(context) : _textComposer(context),
    );
  }

  Widget _recordingComposer(BuildContext context) {
    return Row(
      children: [
        IconButton(
          onPressed: () => setState(() => recording = false),
          icon: const Icon(Icons.delete_outline_rounded, color: SyncColors.danger),
        ),
        const Icon(Icons.mic_rounded, color: SyncColors.danger),
        const SizedBox(width: 6),
        const Text('00:14', style: TextStyle(fontWeight: FontWeight.w800)),
        const SizedBox(width: 8),
        Expanded(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: List.generate(
              18,
              (index) => Expanded(
                child: Container(
                  margin: const EdgeInsets.symmetric(horizontal: 1),
                  height: 4 + ((index * 7) % 18).toDouble(),
                  decoration: BoxDecoration(
                    color: SyncColors.sky.withOpacity(.65),
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),
              ),
            ),
          ),
        ),
        IconButton(onPressed: () {}, icon: const Icon(Icons.pause_rounded)),
        CircleAvatar(
          backgroundColor: SyncColors.sky600,
          child: IconButton(
            onPressed: () => setState(() => recording = false),
            icon: const Icon(Icons.send_rounded, color: Colors.white, size: 19),
          ),
        ),
      ],
    );
  }

  Widget _textComposer(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        IconButton(
          onPressed: () => showSyncSheet(
            context,
            title: 'Emoji & stickers',
            actions: const [
              SyncSheetAction(label: 'Emoji', icon: Icons.emoji_emotions_outlined),
              SyncSheetAction(label: 'Recent', icon: Icons.history_rounded),
              SyncSheetAction(label: 'Stickers', icon: Icons.sticky_note_2_outlined),
            ],
          ),
          icon: const Icon(Icons.emoji_emotions_outlined),
        ),
        Expanded(
          child: TextField(
            controller: controller,
            minLines: 1,
            maxLines: 5,
            decoration: const InputDecoration(hintText: 'Message', isDense: true),
          ),
        ),
        IconButton(
          onPressed: () => showAttachmentSheet(context),
          icon: const Icon(Icons.attach_file_rounded),
        ),
        IconButton(
          onPressed: () => setState(() => recording = true),
          icon: const Icon(Icons.mic_none_rounded),
        ),
        CircleAvatar(
          backgroundColor: SyncColors.sky600,
          child: IconButton(
            onPressed: () => controller.clear(),
            icon: const Icon(Icons.send_rounded, color: Colors.white, size: 19),
          ),
        ),
      ],
    );
  }

  void _showMessageActions(BuildContext context) {
    showSyncSheet(
      context,
      title: 'Message actions',
      actions: [
        SyncSheetAction(
          label: 'Reply',
          icon: Icons.reply_rounded,
          onTap: () => setState(() => replyVisible = true),
        ),
        const SyncSheetAction(label: 'Forward', icon: Icons.forward_rounded),
        const SyncSheetAction(label: 'React', icon: Icons.add_reaction_outlined),
        const SyncSheetAction(label: 'Star', icon: Icons.star_border_rounded),
        const SyncSheetAction(label: 'Pin', icon: Icons.push_pin_outlined),
        const SyncSheetAction(label: 'Copy', icon: Icons.copy_rounded),
        const SyncSheetAction(label: 'Edit', icon: Icons.edit_outlined),
        const SyncSheetAction(
          label: 'Delete',
          icon: Icons.delete_outline_rounded,
          danger: true,
        ),
      ],
    );
  }

  void _openCall(BuildContext context, {required bool video}) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => CallPanelScreen(name: widget.name, video: video),
      ),
    );
  }
}

class _WallpaperPainter extends CustomPainter {
  const _WallpaperPainter({required this.dark});

  final bool dark;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(
      Offset.zero & size,
      Paint()..color = dark ? SyncColors.spill900 : SyncColors.slate200,
    );
    final dot = Paint()
      ..color = (dark ? const Color(0xFF94A3B8) : SyncColors.slate700).withOpacity(.08);
    final accent = Paint()..color = SyncColors.sky.withOpacity(.05);
    for (double x = 26; x < size.width; x += 52) {
      for (double y = 26; y < size.height; y += 52) {
        canvas.drawCircle(Offset(x, y), 1.7, dot);
      }
    }
    for (double x = 52; x < size.width; x += 100) {
      for (double y = 70; y < size.height; y += 100) {
        canvas.drawCircle(Offset(x, y), 2, accent);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _WallpaperPainter oldDelegate) => oldDelegate.dark != dark;
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({
    required this.mine,
    required this.text,
    required this.time,
    required this.onLongPress,
  });

  final bool mine;
  final String text;
  final String time;
  final VoidCallback onLongPress;

  @override
  Widget build(BuildContext context) {
    final background = mine
        ? (context.isDark ? const Color(0xFF164E63) : SyncColors.sentBubble)
        : (context.isDark ? SyncColors.spill800 : SyncColors.receivedBubble);

    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: GestureDetector(
        onLongPress: onLongPress,
        child: Container(
          constraints: const BoxConstraints(maxWidth: 310),
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.fromLTRB(12, 9, 10, 7),
          decoration: BoxDecoration(
            color: background,
            borderRadius: BorderRadius.only(
              topLeft: const Radius.circular(18),
              topRight: const Radius.circular(18),
              bottomLeft: Radius.circular(mine ? 18 : 5),
              bottomRight: Radius.circular(mine ? 5 : 18),
            ),
            boxShadow: const [
              BoxShadow(
                color: Color(0x160F172A),
                blurRadius: 6,
                offset: Offset(0, 2),
              ),
            ],
          ),
          child: Wrap(
            alignment: WrapAlignment.end,
            crossAxisAlignment: WrapCrossAlignment.end,
            spacing: 9,
            runSpacing: 3,
            children: [
              Text(text, style: const TextStyle(height: 1.35)),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(time, style: TextStyle(fontSize: 10, color: context.muted)),
                  if (mine) ...[
                    const SizedBox(width: 3),
                    const Icon(Icons.done_all_rounded, size: 14, color: SyncColors.sky),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DayChip extends StatelessWidget {
  const _DayChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: context.panel.withOpacity(.9),
          borderRadius: BorderRadius.circular(99),
        ),
        child: Text(label, style: TextStyle(fontSize: 11, color: context.muted)),
      ),
    );
  }
}

class _SystemChip extends StatelessWidget {
  const _SystemChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 5),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: const Color(0xFFFFF7ED).withOpacity(context.isDark ? .12 : 1),
          borderRadius: BorderRadius.circular(9),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.lock_outline_rounded, size: 13, color: SyncColors.warning),
            const SizedBox(width: 5),
            Text(label, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }
}
