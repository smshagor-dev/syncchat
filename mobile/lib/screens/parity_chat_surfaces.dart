import 'package:flutter/material.dart';

import '../theme.dart';
import '../widgets.dart';
import 'chat_room_screen.dart';

class ParityForegroundSurface extends StatelessWidget {
  const ParityForegroundSurface({super.key, required this.mode});

  final String mode;

  @override
  Widget build(BuildContext context) {
    if (mode == 'rail') return const _RailPreview();
    if (mode == 'contact') return const ParityOpenContactSurface();
    if (mode == 'overflow') {
      return const ParityInboxMenuSurface();
    }

    final bottom = MediaQuery.paddingOf(context).bottom;
    final showStatus = mode == 'status';
    return Scaffold(
      backgroundColor: context.isDark ? SyncColors.spill950 : SyncColors.slate100,
      body: SafeArea(
        bottom: false,
        child: Stack(
          children: [
            Column(
              children: [
                _header(context),
                _searchAndFilters(context),
                Divider(height: 1, color: context.border),
                if (showStatus) _statusRail(context),
                Expanded(
                  child: ListView.separated(
                    padding: EdgeInsets.only(bottom: 112 + bottom),
                    itemCount: 8,
                    separatorBuilder: (_, __) => Divider(
                      height: 1,
                      indent: 76,
                      color: context.border,
                    ),
                    itemBuilder: (_, index) => _chatTile(context, index),
                  ),
                ),
              ],
            ),
            if (mode == 'shell' || mode == 'chats' || mode == 'dock')
              Positioned(
                left: 12,
                right: 12,
                bottom: bottom + 8,
                child: const _DockPreview(),
              ),
          ],
        ),
      ),
    );
  }

  Widget _header(BuildContext context) {
    return Container(
      color: context.panel,
      padding: const EdgeInsets.fromLTRB(14, 10, 10, 10),
      child: Row(
        children: [
          const CircleAvatar(
            radius: 17,
            backgroundColor: Color(0x170EA5E9),
            child: Icon(Icons.sync_rounded, color: SyncColors.sky),
          ),
          const SizedBox(width: 9),
          const Expanded(
            child: Text(
              'SyncChat',
              style: TextStyle(fontSize: 21, fontWeight: FontWeight.w900),
            ),
          ),
          IconButton(onPressed: () {}, icon: const Icon(Icons.qr_code_rounded)),
          IconButton(onPressed: () {}, icon: const Icon(Icons.more_vert_rounded)),
        ],
      ),
    );
  }

  Widget _searchAndFilters(BuildContext context) {
    final labels = ['All', 'Unread 4', 'Favourite 3', 'Group 6'];
    return Container(
      color: context.panel,
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
      child: Column(
        children: [
          const TextField(
            decoration: InputDecoration(
              hintText: 'Search or start new chat',
              prefixIcon: Icon(Icons.search_rounded),
            ),
          ),
          const SizedBox(height: 9),
          SizedBox(
            height: 34,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              itemCount: labels.length,
              itemBuilder: (_, index) {
                final active = mode == 'filters' ? index == 1 : index == 0;
                return Container(
                  margin: const EdgeInsets.only(right: 7),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                  decoration: BoxDecoration(
                    color: active ? SyncColors.sky600 : context.softPanel,
                    borderRadius: BorderRadius.circular(99),
                    border: Border.all(
                      color: active ? SyncColors.sky600 : context.border,
                    ),
                  ),
                  child: Text(
                    labels[index],
                    style: TextStyle(
                      color: active ? Colors.white : context.ink,
                      fontWeight: FontWeight.w800,
                      fontSize: 12,
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _statusRail(BuildContext context) {
    return Container(
      height: 88,
      color: context.panel,
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: const SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: EdgeInsets.symmetric(horizontal: 10),
        child: Row(
          children: [
            SyncStatusAvatar(name: 'You', add: true),
            SizedBox(width: 8),
            SyncStatusAvatar(name: 'Atia'),
            SizedBox(width: 8),
            SyncStatusAvatar(name: 'Nadia'),
            SizedBox(width: 8),
            SyncStatusAvatar(name: 'Mahin'),
            SizedBox(width: 8),
            SyncStatusAvatar(name: 'Product'),
          ],
        ),
      ),
    );
  }

  Widget _chatTile(BuildContext context, int index) {
    const names = [
      'Atia Rahman',
      'Product Team',
      'Nadia Karim',
      'SyncChat News',
      'Mahin Hasan',
      'Design',
      'Support',
      'Family',
    ];
    final name = names[index];
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
      leading: SyncAvatar(
        name: name,
        online: index == 0 || index == 4,
        radius: 24,
      ),
      title: Text(name, style: const TextStyle(fontWeight: FontWeight.w900)),
      subtitle: Text(
        index == 0
            ? 'Typing…'
            : index == 1
                ? 'You: Release checklist is ready'
                : 'Latest conversation preview',
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            index < 3 ? '10:${24 + index}' : 'Yesterday',
            style: TextStyle(
              fontSize: 10,
              color: index < 3 ? SyncColors.sky : context.muted,
            ),
          ),
          const SizedBox(height: 5),
          if (index < 2)
            const CircleAvatar(
              radius: 9,
              backgroundColor: SyncColors.success,
              child: Text(
                '2',
                style: TextStyle(
                  fontSize: 9,
                  color: Colors.white,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
        ],
      ),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => ChatRoomScreen(name: name, group: index == 1),
        ),
      ),
    );
  }
}

class ParityCollectionSurface extends StatelessWidget {
  const ParityCollectionSurface({super.key, required this.mode});

  final String mode;

  @override
  Widget build(BuildContext context) {
    final title = switch (mode) {
      'archive' => 'Archive',
      'lists' => 'Lists',
      _ => 'Starred messages',
    };
    final icon = switch (mode) {
      'archive' => Icons.archive_outlined,
      'lists' => Icons.format_list_bulleted_rounded,
      _ => Icons.star_rounded,
    };

    return SyncStandardPage(
      title: title,
      actions: [
        IconButton(onPressed: () {}, icon: const Icon(Icons.search_rounded)),
      ],
      child: ListView(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 28),
        children: [
          SyncFeatureCard(
            icon: icon,
            title: title,
            body: mode == 'lists'
                ? 'Create focused chat lists without moving conversations out of your inbox.'
                : mode == 'archive'
                    ? 'Archived conversations stay quiet and remain searchable.'
                    : 'Messages starred across private, group and channel conversations.',
          ),
          const SizedBox(height: 14),
          ...List.generate(5, (index) {
            final labels = switch (mode) {
              'starred' => 'Important message ${index + 1}',
              'lists' => ['Work', 'Family', 'Unread', 'Channels', 'Projects'][index],
              _ => ['Product Team', 'Nadia Karim', 'Launch Room', 'Support', 'Family'][index],
            };
            return SyncEntityTile(
              icon: icon,
              title: labels,
              subtitle: mode == 'starred'
                  ? 'Atia Rahman · Today 10:${20 + index}'
                  : '${index + 2} conversations',
              onTap: () {},
            );
          }),
        ],
      ),
    );
  }
}

class ParityOpenContactSurface extends StatelessWidget {
  const ParityOpenContactSurface({super.key});

  @override
  Widget build(BuildContext context) {
    return SyncStandardPage(
      title: 'Contact',
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const SizedBox(height: 12),
          const Center(
            child: SyncAvatar(name: 'Atia Rahman', online: true, radius: 54),
          ),
          const SizedBox(height: 12),
          const Center(
            child: Text(
              'Atia Rahman',
              style: TextStyle(fontSize: 23, fontWeight: FontWeight.w900),
            ),
          ),
          Center(
            child: Text('@atia · online', style: TextStyle(color: context.muted)),
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: () {},
                  icon: const Icon(Icons.chat_bubble_outline_rounded),
                  label: const Text('Message'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () {},
                  icon: const Icon(Icons.call_outlined),
                  label: const Text('Call'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          const SyncSoftCard(
            child: Column(
              children: [
                ListTile(
                  leading: Icon(Icons.info_outline_rounded),
                  title: Text('About'),
                  subtitle: Text('Building secure realtime products.'),
                ),
                ListTile(
                  leading: Icon(Icons.alternate_email_rounded),
                  title: Text('Username'),
                  subtitle: Text('@atia'),
                ),
                ListTile(
                  leading: Icon(Icons.phone_outlined),
                  title: Text('Phone'),
                  subtitle: Text('+1 ••• ••• 0182'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class ParityInboxMenuSurface extends StatelessWidget {
  const ParityInboxMenuSurface({super.key});

  @override
  Widget build(BuildContext context) {
    const actions = [
      ('Mark as unread', Icons.mark_chat_unread_outlined, false),
      ('Favourite', Icons.star_border_rounded, false),
      ('Pin chat', Icons.push_pin_outlined, false),
      ('Archive', Icons.archive_outlined, false),
      ('Mute notification', Icons.notifications_off_outlined, false),
      ('Lock chat', Icons.lock_outline_rounded, false),
      ('Clear chat', Icons.cleaning_services_outlined, false),
      ('Delete chat', Icons.delete_outline_rounded, true),
    ];
    return Scaffold(
      backgroundColor: Colors.black54,
      body: SafeArea(
        child: Align(
          alignment: Alignment.bottomCenter,
          child: Container(
            margin: const EdgeInsets.fromLTRB(12, 0, 12, 82),
            constraints: BoxConstraints(
              maxHeight: MediaQuery.sizeOf(context).height * .72,
            ),
            decoration: BoxDecoration(
              color: context.panel,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: context.border),
              boxShadow: const [
                BoxShadow(color: Color(0x440F172A), blurRadius: 30),
              ],
            ),
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.all(8),
              children: actions
                  .map(
                    (action) => ListTile(
                      minTileHeight: 48,
                      leading: Icon(
                        action.$2,
                        color: action.$3 ? SyncColors.danger : SyncColors.sky,
                      ),
                      title: Text(
                        action.$1,
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          color: action.$3 ? SyncColors.danger : null,
                        ),
                      ),
                    ),
                  )
                  .toList(),
            ),
          ),
        ),
      ),
    );
  }
}

class ParityRoomSurface extends StatefulWidget {
  const ParityRoomSurface({super.key, required this.mode});

  final String mode;

  @override
  State<ParityRoomSurface> createState() => _ParityRoomSurfaceState();
}

class _ParityRoomSurfaceState extends State<ParityRoomSurface> {
  bool recording = false;

  @override
  Widget build(BuildContext context) {
    final mode = widget.mode;
    return Scaffold(
      backgroundColor: context.isDark ? SyncColors.spill950 : SyncColors.slate200,
      body: SafeArea(
        child: Column(
          children: [
            _roomHeader(context),
            if (mode == 'search') _search(context),
            if (mode == 'pinned' || mode == 'pinHistory')
              _pinned(context, history: mode == 'pinHistory'),
            Expanded(
              child: Stack(
                children: [
                  ListView(
                    padding: const EdgeInsets.fromLTRB(12, 18, 12, 110),
                    children: [
                      const Center(child: Chip(label: Text('TODAY'))),
                      const SizedBox(height: 12),
                      _bubble(
                        context,
                        'Can you review the release checklist?',
                        sent: false,
                        time: '10:21',
                      ),
                      _bubble(
                        context,
                        'Yes — I am checking the mobile flows now.',
                        sent: true,
                        time: '10:22',
                      ),
                      if (mode == 'richCards') ..._richCards(context),
                      if (mode == 'viewOnce')
                        _specialBubble(
                          context,
                          Icons.visibility_outlined,
                          'View-once text',
                          'Tap to reveal this message once',
                        ),
                      if (mode == 'scheduled')
                        _specialBubble(
                          context,
                          Icons.schedule_send_outlined,
                          'Scheduled message',
                          'Today · 11:30 PM',
                        ),
                      if (mode == 'restricted')
                        _specialBubble(
                          context,
                          Icons.timer_outlined,
                          'Slow mode active',
                          'You can send again in 00:18',
                        ),
                    ],
                  ),
                  if (mode == 'selection') _selectionBar(context),
                  if (mode == 'messageActions') _messageActions(context),
                  if (mode == 'emoji') _emojiBoard(context),
                ],
              ),
            ),
            _composer(context, mode),
          ],
        ),
      ),
    );
  }

  Widget _roomHeader(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minHeight: 64),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 7),
      color: context.panel,
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.maybePop(context),
            icon: const Icon(Icons.arrow_back_rounded),
          ),
          const SyncAvatar(name: 'Atia Rahman', online: true, radius: 20),
          const SizedBox(width: 10),
          const Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Atia Rahman', style: TextStyle(fontWeight: FontWeight.w900)),
                Text(
                  'online',
                  style: TextStyle(fontSize: 12, color: SyncColors.slate500),
                ),
              ],
            ),
          ),
          IconButton(onPressed: () {}, icon: const Icon(Icons.videocam_outlined)),
          IconButton(onPressed: () {}, icon: const Icon(Icons.call_outlined)),
          IconButton(onPressed: () {}, icon: const Icon(Icons.more_vert_rounded)),
        ],
      ),
    );
  }

  Widget _search(BuildContext context) {
    return Container(
      color: context.panel,
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
      child: const TextField(
        decoration: InputDecoration(
          hintText: 'Search in chat',
          prefixIcon: Icon(Icons.search_rounded),
          suffixIcon: Icon(Icons.close_rounded),
        ),
      ),
    );
  }

  Widget _pinned(BuildContext context, {required bool history}) {
    return Container(
      color: context.panel,
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 9),
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: context.softPanel,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: context.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.push_pin_rounded, color: SyncColors.sky, size: 18),
                const SizedBox(width: 7),
                Expanded(
                  child: Text(
                    history ? 'Pinned messages · 3' : 'Pinned message',
                    style: const TextStyle(fontWeight: FontWeight.w900),
                  ),
                ),
                const Icon(Icons.expand_more_rounded),
              ],
            ),
            if (history) ...[
              const SizedBox(height: 7),
              const Text('Release checklist is ready'),
              const Divider(),
              const Text('Design handoff at 4 PM'),
              const Divider(),
              const Text('Production deploy checklist'),
            ],
          ],
        ),
      ),
    );
  }

  Widget _bubble(
    BuildContext context,
    String text, {
    required bool sent,
    required String time,
  }) {
    final color = sent
        ? (context.isDark ? const Color(0xFF164E63) : SyncColors.sentBubble)
        : context.panel;
    return Align(
      alignment: sent ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * .78),
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.fromLTRB(12, 9, 9, 7),
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(18),
            topRight: const Radius.circular(18),
            bottomLeft: Radius.circular(sent ? 18 : 5),
            bottomRight: Radius.circular(sent ? 5 : 18),
          ),
          boxShadow: const [
            BoxShadow(color: Color(0x120F172A), blurRadius: 5, offset: Offset(0, 2)),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Flexible(child: Text(text)),
            const SizedBox(width: 8),
            Text(time, style: TextStyle(fontSize: 10, color: context.muted)),
            if (sent)
              const Padding(
                padding: EdgeInsets.only(left: 2),
                child: Icon(Icons.done_all_rounded, color: SyncColors.sky, size: 15),
              ),
          ],
        ),
      ),
    );
  }

  List<Widget> _richCards(BuildContext context) {
    return [
      _specialBubble(context, Icons.image_outlined, 'Photo', 'IMG_2048.jpg · 2.4 MB'),
      _specialBubble(context, Icons.link_rounded, 'syncchat.live', 'Secure realtime communication'),
      _specialBubble(context, Icons.location_on_outlined, 'Shared location', 'Downtown · 1.2 km away'),
      _specialBubble(context, Icons.poll_outlined, 'Release time?', '4 votes · 2 options'),
      _specialBubble(context, Icons.event_outlined, 'Launch review', 'Tomorrow · 4:00 PM'),
    ];
  }

  Widget _specialBubble(
    BuildContext context,
    IconData icon,
    String title,
    String subtitle,
  ) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        width: 260,
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: context.panel,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: context.border),
        ),
        child: Row(
          children: [
            CircleAvatar(
              backgroundColor: SyncColors.sky.withValues(alpha: .12),
              child: Icon(icon, color: SyncColors.sky),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
                  Text(
                    subtitle,
                    style: TextStyle(fontSize: 12, color: context.muted),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _selectionBar(BuildContext context) {
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: Container(
        color: context.panel,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        child: Row(
          children: [
            IconButton(onPressed: () {}, icon: const Icon(Icons.close_rounded)),
            const Expanded(
              child: Text(
                '2 messages selected',
                style: TextStyle(fontWeight: FontWeight.w900),
              ),
            ),
            IconButton(onPressed: () {}, icon: const Icon(Icons.reply_rounded)),
            IconButton(onPressed: () {}, icon: const Icon(Icons.delete_outline_rounded)),
          ],
        ),
      ),
    );
  }

  Widget _messageActions(BuildContext context) {
    const emojis = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
    return Positioned(
      left: 14,
      right: 14,
      bottom: 90,
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: context.panel,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: context.border),
          boxShadow: const [BoxShadow(color: Color(0x330F172A), blurRadius: 25)],
        ),
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: emojis
                  .map((emoji) => Text(emoji, style: const TextStyle(fontSize: 24)))
                  .toList(),
            ),
            const Divider(),
            const Wrap(
              spacing: 4,
              children: [
                ActionChip(label: Text('Reply'), avatar: Icon(Icons.reply_rounded, size: 17)),
                ActionChip(label: Text('Forward'), avatar: Icon(Icons.forward_rounded, size: 17)),
                ActionChip(label: Text('Edit'), avatar: Icon(Icons.edit_outlined, size: 17)),
                ActionChip(label: Text('Info'), avatar: Icon(Icons.info_outline_rounded, size: 17)),
                ActionChip(label: Text('Delete'), avatar: Icon(Icons.delete_outline_rounded, size: 17)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _emojiBoard(BuildContext context) {
    const emojis = [
      '😀','😁','😂','🤣','😊','😍','🥰','😘',
      '😎','🤩','🥳','😢','😭','😡','👍','👎',
      '👏','🙏','❤️','🔥','🎉','✅','💯','👀',
    ];
    return Positioned(
      left: 8,
      right: 8,
      bottom: 84,
      child: Container(
        height: 250,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: context.panel,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: context.border),
        ),
        child: Column(
          children: [
            const TextField(
              decoration: InputDecoration(
                hintText: 'Search emoji',
                prefixIcon: Icon(Icons.search_rounded),
              ),
            ),
            const SizedBox(height: 10),
            Expanded(
              child: GridView.count(
                crossAxisCount: 8,
                children: emojis
                    .map(
                      (emoji) => Center(
                        child: Text(emoji, style: const TextStyle(fontSize: 24)),
                      ),
                    )
                    .toList(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _composer(BuildContext context, String mode) {
    if (mode == 'voice') {
      return Container(
        color: context.panel,
        padding: EdgeInsets.fromLTRB(
          10,
          10,
          10,
          MediaQuery.paddingOf(context).bottom + 10,
        ),
        child: Row(
          children: [
            IconButton(
              onPressed: () => setState(() => recording = !recording),
              icon: Icon(
                recording ? Icons.stop_circle_rounded : Icons.delete_outline_rounded,
                color: recording ? SyncColors.danger : context.muted,
              ),
            ),
            const Text('0:18', style: TextStyle(fontWeight: FontWeight.w900)),
            const SizedBox(width: 10),
            const Expanded(child: _Waveform()),
            IconButton(onPressed: () {}, icon: const Icon(Icons.pause_circle_outline_rounded)),
            CircleAvatar(
              backgroundColor: SyncColors.sky,
              child: IconButton(
                onPressed: () {},
                icon: const Icon(Icons.send_rounded, color: Colors.white),
              ),
            ),
          ],
        ),
      );
    }

    return Container(
      color: context.panel,
      padding: EdgeInsets.fromLTRB(
        8,
        8,
        8,
        MediaQuery.paddingOf(context).bottom + 8,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          IconButton(onPressed: () {}, icon: const Icon(Icons.add_circle_outline_rounded)),
          IconButton(onPressed: () {}, icon: const Icon(Icons.emoji_emotions_outlined)),
          const Expanded(
            child: TextField(
              minLines: 1,
              maxLines: 5,
              decoration: InputDecoration(hintText: 'Message'),
            ),
          ),
          const SizedBox(width: 6),
          CircleAvatar(
            backgroundColor: SyncColors.sky,
            child: IconButton(
              onPressed: () {},
              icon: const Icon(Icons.send_rounded, color: Colors.white),
            ),
          ),
        ],
      ),
    );
  }
}

class _Waveform extends StatelessWidget {
  const _Waveform();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 44,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: List.generate(
          24,
          (index) => Container(
            width: 2,
            height: 8 + (index % 5) * 5,
            decoration: BoxDecoration(
              color: SyncColors.sky,
              borderRadius: BorderRadius.circular(99),
            ),
          ),
        ),
      ),
    );
  }
}

class ParityChatToolsSurface extends StatefulWidget {
  const ParityChatToolsSurface({super.key, required this.tab});

  final String tab;

  @override
  State<ParityChatToolsSurface> createState() => _ParityChatToolsSurfaceState();
}

class _ParityChatToolsSurfaceState extends State<ParityChatToolsSurface> {
  bool e2ee = true;

  @override
  Widget build(BuildContext context) {
    const tabs = [
      ('search', 'Search', Icons.search_rounded),
      ('requests', 'Requests', Icons.mark_chat_unread_outlined),
      ('mentions', 'Mentions', Icons.alternate_email_rounded),
      ('topics', 'Topics', Icons.forum_outlined),
      ('security', 'Security', Icons.shield_outlined),
      ('outbox', 'Outbox', Icons.cloud_upload_outlined),
    ];

    return Scaffold(
      backgroundColor: context.isDark ? SyncColors.spill950 : SyncColors.slate100,
      body: SafeArea(
        child: Column(
          children: [
            Container(
              color: context.panel,
              padding: const EdgeInsets.fromLTRB(16, 12, 8, 10),
              child: Row(
                children: [
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Chat Tools',
                          style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
                        ),
                        Text(
                          'Current chat · Atia Rahman',
                          style: TextStyle(fontSize: 12, color: SyncColors.slate500),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.maybePop(context),
                    icon: const Icon(Icons.close_rounded),
                  ),
                ],
              ),
            ),
            Divider(height: 1, color: context.border),
            SizedBox(
              height: 52,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
                children: tabs.map((item) {
                  final active = item.$1 == widget.tab ||
                      (widget.tab == 'receipts' && item.$1 == 'search');
                  return Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: FilledButton.tonalIcon(
                      onPressed: () {},
                      icon: Icon(item.$3, size: 17),
                      label: Text(item.$2),
                      style: FilledButton.styleFrom(
                        backgroundColor: active ? SyncColors.sky600 : context.softPanel,
                        foregroundColor: active ? Colors.white : context.ink,
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
            Divider(height: 1, color: context.border),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(14),
                children: _toolBody(context),
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _toolBody(BuildContext context) {
    switch (widget.tab) {
      case 'search':
        return [
          const TextField(
            decoration: InputDecoration(
              hintText: 'Search messages',
              prefixIcon: Icon(Icons.search_rounded),
            ),
          ),
          const SizedBox(height: 10),
          ...List.generate(
            4,
            (index) => ListTile(
              leading: const SyncAvatar(name: 'Atia Rahman', radius: 20),
              title: Text(
                'Search result ${index + 1}',
                style: const TextStyle(fontWeight: FontWeight.w900),
              ),
              subtitle: const Text('Matching message preview · Today'),
              trailing: const Icon(Icons.chevron_right_rounded),
            ),
          ),
        ];
      case 'requests':
        return [
          const SyncSectionLabel('Message requests'),
          const SizedBox(height: 8),
          ...['Nadia Karim', 'Rafi Ahmed'].map(
            (name) => SyncSoftCard(
              margin: const EdgeInsets.only(bottom: 9),
              child: Column(
                children: [
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: SyncAvatar(name: name, radius: 22),
                    title: Text(name, style: const TextStyle(fontWeight: FontWeight.w900)),
                    subtitle: const Text('Would like to start a conversation'),
                  ),
                  Row(
                    children: [
                      Expanded(child: OutlinedButton(onPressed: () {}, child: const Text('Delete'))),
                      const SizedBox(width: 8),
                      Expanded(child: FilledButton(onPressed: () {}, child: const Text('Accept'))),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ];
      case 'mentions':
        return [
          const SyncSectionLabel('Recent mentions'),
          const SizedBox(height: 8),
          ...List.generate(
            5,
            (index) => ListTile(
              leading: const CircleAvatar(
                backgroundColor: Color(0x170EA5E9),
                child: Icon(Icons.alternate_email_rounded, color: SyncColors.sky),
              ),
              title: Text(
                'Product Team · mention ${index + 1}',
                style: const TextStyle(fontWeight: FontWeight.w900),
              ),
              subtitle: const Text('@you please review the latest update'),
              trailing: const Text('10:24', style: TextStyle(fontSize: 10)),
            ),
          ),
        ];
      case 'topics':
        return [
          const TextField(
            decoration: InputDecoration(
              labelText: 'New topic',
              prefixIcon: Icon(Icons.add_comment_outlined),
              suffixIcon: Icon(Icons.send_rounded),
            ),
          ),
          const SizedBox(height: 12),
          ...['All messages', 'Release', 'Design', 'Backend', 'Mobile'].map(
            (topic) => ListTile(
              leading: Icon(
                topic == 'Release' ? Icons.radio_button_checked : Icons.radio_button_off,
                color: topic == 'Release' ? SyncColors.sky : context.muted,
              ),
              title: Text(topic, style: const TextStyle(fontWeight: FontWeight.w800)),
              subtitle: Text(topic == 'All messages' ? 'No topic filter' : 'Group topic'),
            ),
          ),
        ];
      case 'security':
        return [
          SyncSoftCard(
            padding: EdgeInsets.zero,
            child: SwitchListTile(
              value: e2ee,
              onChanged: (value) => setState(() => e2ee = value),
              secondary: const CircleAvatar(
                backgroundColor: Color(0x1722C55E),
                child: Icon(Icons.shield_outlined, color: SyncColors.success),
              ),
              title: const Text('Device E2EE', style: TextStyle(fontWeight: FontWeight.w900)),
              subtitle: const Text('Encrypt new private text messages for registered devices.'),
            ),
          ),
          const SizedBox(height: 10),
          const SyncSoftCard(
            child: Column(
              children: [
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.key_rounded, color: SyncColors.sky),
                  title: Text('Device key registered'),
                  subtitle: Text('Version 2'),
                ),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.lock_rounded, color: SyncColors.success),
                  title: Text('Current room protected'),
                  subtitle: Text('Enabled by this device'),
                ),
              ],
            ),
          ),
        ];
      case 'outbox':
        return [
          const SyncSectionLabel('Pending & failed'),
          const SizedBox(height: 8),
          ...List.generate(
            3,
            (index) => SyncSoftCard(
              margin: const EdgeInsets.only(bottom: 9),
              child: Row(
                children: [
                  const CircleAvatar(
                    backgroundColor: Color(0x17F43F5E),
                    child: Icon(Icons.cloud_off_outlined, color: SyncColors.danger),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Message failed', style: TextStyle(fontWeight: FontWeight.w900)),
                        Text(
                          'Retry ${index + 1} · client message ID preserved',
                          style: TextStyle(fontSize: 12, color: context.muted),
                        ),
                      ],
                    ),
                  ),
                  IconButton(onPressed: () {}, icon: const Icon(Icons.refresh_rounded)),
                ],
              ),
            ),
          ),
        ];
      case 'receipts':
        return [
          const SyncSectionLabel('Message details'),
          const SizedBox(height: 8),
          const SyncSoftCard(
            child: Column(
              children: [
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.done_rounded),
                  title: Text('Sent'),
                  trailing: Text('10:21 PM'),
                ),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.done_all_rounded),
                  title: Text('Delivered'),
                  trailing: Text('10:21 PM'),
                ),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.visibility_outlined),
                  title: Text('Read'),
                  trailing: Text('10:22 PM'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          const SyncSectionLabel('Read by'),
          const ListTile(
            leading: SyncAvatar(name: 'Atia Rahman', radius: 20),
            title: Text('Atia Rahman'),
            subtitle: Text('Read 10:22 PM'),
          ),
        ];
      default:
        return const [];
    }
  }
}

class _DockPreview extends StatelessWidget {
  const _DockPreview();

  @override
  Widget build(BuildContext context) {
    const items = [
      ('Chats', Icons.chat_bubble_outline_rounded),
      ('Status', Icons.donut_large_rounded),
      ('Communities', Icons.groups_2_outlined),
      ('Channels', Icons.podcasts_rounded),
      ('Calls', Icons.call_outlined),
    ];
    return Container(
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        color: context.panel.withValues(alpha: .96),
        borderRadius: BorderRadius.circular(27),
        border: Border.all(color: context.border),
        boxShadow: const [
          BoxShadow(color: Color(0x440F172A), blurRadius: 28, offset: Offset(0, 12)),
        ],
      ),
      child: Row(
        children: items.asMap().entries.map((entry) {
          final active = entry.key == 0;
          return Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 7),
              decoration: BoxDecoration(
                color: active ? SyncColors.sky.withValues(alpha: .12) : Colors.transparent,
                borderRadius: BorderRadius.circular(19),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircleAvatar(
                    radius: 14,
                    backgroundColor: active ? SyncColors.sky : context.softPanel,
                    child: Icon(
                      entry.value.$2,
                      size: 16,
                      color: active ? Colors.white : context.muted,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    entry.value.$1,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      color: active ? SyncColors.sky : context.muted,
                    ),
                  ),
                ],
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

class _RailPreview extends StatelessWidget {
  const _RailPreview();

  @override
  Widget build(BuildContext context) {
    const items = [
      ('Chats', Icons.chat_bubble_outline_rounded),
      ('Calls', Icons.call_outlined),
      ('Status', Icons.donut_large_rounded),
      ('Contacts', Icons.people_outline_rounded),
      ('Communities', Icons.groups_2_outlined),
      ('Channels', Icons.podcasts_rounded),
      ('Archive', Icons.archive_outlined),
      ('Lists', Icons.format_list_bulleted_rounded),
      ('Media', Icons.image_outlined),
      ('Settings', Icons.settings_outlined),
      ('Profile', Icons.person_outline_rounded),
    ];
    return Scaffold(
      backgroundColor: Colors.black45,
      body: SafeArea(
        child: Align(
          alignment: Alignment.centerLeft,
          child: Container(
            width: 94,
            color: SyncColors.slate900,
            child: ListView(
              padding: EdgeInsets.fromLTRB(
                5,
                10,
                5,
                MediaQuery.paddingOf(context).bottom + 16,
              ),
              children: items.map((item) {
                final active = item.$1 == 'Chats';
                return Container(
                  margin: const EdgeInsets.only(bottom: 4),
                  padding: const EdgeInsets.symmetric(vertical: 9),
                  decoration: BoxDecoration(
                    color: active
                        ? SyncColors.sky.withValues(alpha: .24)
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Column(
                    children: [
                      Icon(item.$2, color: active ? Colors.white : Colors.white70),
                      const SizedBox(height: 3),
                      Text(
                        item.$1,
                        style: const TextStyle(
                          color: Colors.white70,
                          fontSize: 9,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                );
              }).toList(),
            ),
          ),
        ),
      ),
    );
  }
}
