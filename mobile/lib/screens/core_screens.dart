import 'package:flutter/material.dart';

import '../parity_catalog.dart';
import '../sheets.dart';
import '../theme.dart';
import '../widgets.dart';
import 'chat_room_screen.dart';
import 'parity_surface_screen.dart';

class StatusScreen extends StatefulWidget {
  const StatusScreen({super.key});

  @override
  State<StatusScreen> createState() => _StatusScreenState();
}

class _StatusScreenState extends State<StatusScreen> {
  String type = 'Text';
  int colorIndex = 0;
  final controller = TextEditingController();

  static const colors = <Color>[
    SyncColors.sky,
    SyncColors.cyan,
    SyncColors.teal,
    SyncColors.success,
    SyncColors.warning,
    SyncColors.danger,
    Color(0xFFEC4899),
    Color(0xFF8B5CF6),
    SyncColors.slate700,
  ];

  static const people = <(String, String, int)>[
    ('Atia Rahman', '18 min', 3),
    ('Nadia Karim', '42 min', 2),
    ('Mahin Hasan', '1 h', 1),
    ('Product Team', '2 h', 4),
    ('Rafi Ahmed', '4 h', 2),
  ];

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SyncDockPage(
      title: 'Status',
      trailing: IconButton(
        onPressed: () {},
        icon: const Icon(Icons.refresh_rounded),
      ),
      child: ListView(
        padding: EdgeInsets.fromLTRB(
          14,
          12,
          14,
          118 + MediaQuery.paddingOf(context).bottom,
        ),
        children: [
          SyncFeatureCard(
            icon: Icons.auto_awesome_rounded,
            title: 'Share a status',
            body: 'Post text, photo or video updates for your contacts. Statuses disappear after 24 hours.',
            actionLabel: 'Status activity',
            onAction: () => _openActivity(context),
          ),
          const SizedBox(height: 14),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'Text', label: Text('Text'), icon: Icon(Icons.text_fields_rounded)),
              ButtonSegment(value: 'Photo', label: Text('Photo'), icon: Icon(Icons.photo_outlined)),
              ButtonSegment(value: 'Video', label: Text('Video'), icon: Icon(Icons.videocam_outlined)),
            ],
            selected: {type},
            onSelectionChanged: (value) => setState(() => type = value.first),
          ),
          const SizedBox(height: 12),
          if (type == 'Text') _textComposer(context) else _mediaComposer(context),
          const SizedBox(height: 18),
          const SyncSectionLabel('Your status'),
          const SizedBox(height: 8),
          SyncSoftCard(
            padding: const EdgeInsets.all(10),
            child: ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 4),
              leading: const SyncStatusAvatar(name: 'You', add: true),
              title: const Text('My status', style: TextStyle(fontWeight: FontWeight.w900)),
              subtitle: const Text('Tap to add an update'),
              trailing: PopupMenuButton<String>(
                onSelected: (_) {},
                itemBuilder: (_) => const [
                  PopupMenuItem(value: 'privacy', child: Text('Status privacy')),
                  PopupMenuItem(value: 'activity', child: Text('Activity')),
                  PopupMenuItem(value: 'delete', child: Text('Delete status')),
                ],
              ),
              onTap: () => _openViewer(context, 'My status'),
            ),
          ),
          const SizedBox(height: 18),
          const SyncSectionLabel('Recent updates'),
          const SizedBox(height: 8),
          ...people.map(
            (person) => Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                leading: Container(
                  padding: const EdgeInsets.all(2),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: SyncColors.sky, width: 2),
                  ),
                  child: SyncAvatar(name: person.$1, radius: 22),
                ),
                title: Text(person.$1, style: const TextStyle(fontWeight: FontWeight.w900)),
                subtitle: Text('${person.$2} · ${person.$3} update${person.$3 == 1 ? '' : 's'}'),
                onTap: () => _openViewer(context, person.$1),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _textComposer(BuildContext context) {
    return Column(
      children: [
        Container(
          height: 174,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: colors[colorIndex],
            borderRadius: BorderRadius.circular(22),
          ),
          child: TextField(
            controller: controller,
            maxLines: null,
            expands: true,
            textAlign: TextAlign.center,
            textAlignVertical: TextAlignVertical.center,
            style: const TextStyle(color: Colors.white, fontSize: 21, fontWeight: FontWeight.w800),
            decoration: const InputDecoration(
              hintText: 'Write a status…',
              hintStyle: TextStyle(color: Colors.white70),
              fillColor: Colors.transparent,
              border: InputBorder.none,
              enabledBorder: InputBorder.none,
              focusedBorder: InputBorder.none,
            ),
          ),
        ),
        const SizedBox(height: 10),
        SizedBox(
          height: 34,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: colors.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (_, index) => InkWell(
              customBorder: const CircleBorder(),
              onTap: () => setState(() => colorIndex = index),
              child: Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: colors[index],
                  border: Border.all(
                    color: colorIndex == index ? context.ink : Colors.transparent,
                    width: 2,
                  ),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () => showSyncSheet(
                  context,
                  title: 'Mention contacts',
                  actions: const [
                    SyncSheetAction(label: '@atia', subtitle: 'Atia Rahman', icon: Icons.alternate_email_rounded),
                    SyncSheetAction(label: '@nadia', subtitle: 'Nadia Karim', icon: Icons.alternate_email_rounded),
                    SyncSheetAction(label: '@mahin', subtitle: 'Mahin Hasan', icon: Icons.alternate_email_rounded),
                  ],
                ),
                icon: const Icon(Icons.alternate_email_rounded),
                label: const Text('Mention'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: FilledButton.icon(
                onPressed: () => controller.clear(),
                icon: const Icon(Icons.send_rounded),
                label: const Text('Post status'),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _mediaComposer(BuildContext context) {
    return SyncSoftCard(
      child: Column(
        children: [
          Container(
            height: 150,
            width: double.infinity,
            decoration: BoxDecoration(
              color: context.softPanel,
              borderRadius: BorderRadius.circular(18),
            ),
            child: Icon(
              type == 'Photo' ? Icons.add_photo_alternate_outlined : Icons.video_library_outlined,
              size: 52,
              color: context.muted,
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: controller,
            decoration: const InputDecoration(
              hintText: 'Add a caption and @mentions…',
              prefixIcon: Icon(Icons.edit_outlined),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () {},
                  icon: const Icon(Icons.folder_open_rounded),
                  label: Text('Choose $type'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: FilledButton.icon(
                  onPressed: () {},
                  icon: const Icon(Icons.send_rounded),
                  label: const Text('Post status'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _openViewer(BuildContext context, String name) {
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => _StatusViewer(name: name)));
  }

  void _openActivity(BuildContext context) {
    showSyncSheet(
      context,
      title: 'Status activity',
      actions: const [
        SyncSheetAction(label: '34 views', subtitle: 'People who viewed your latest status', icon: Icons.visibility_outlined),
        SyncSheetAction(label: '8 reactions', subtitle: 'Emoji reactions', icon: Icons.add_reaction_outlined),
        SyncSheetAction(label: '5 replies', subtitle: 'Private status replies', icon: Icons.reply_rounded),
        SyncSheetAction(label: '2 mentions', subtitle: 'Mentions in status activity', icon: Icons.alternate_email_rounded),
      ],
    );
  }
}

class _StatusViewer extends StatelessWidget {
  const _StatusViewer({required this.name});

  final String name;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: SyncColors.slate950,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 4),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
                  ),
                  SyncAvatar(name: name, radius: 18),
                  const SizedBox(width: 9),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
                        const Text('18 min', style: TextStyle(color: Colors.white60, fontSize: 12)),
                      ],
                    ),
                  ),
                  IconButton(onPressed: () {}, icon: const Icon(Icons.more_vert_rounded, color: Colors.white)),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                children: List.generate(
                  3,
                  (index) => Expanded(
                    child: Container(
                      height: 3,
                      margin: const EdgeInsets.symmetric(horizontal: 2),
                      color: index == 0 ? Colors.white : Colors.white24,
                    ),
                  ),
                ),
              ),
            ),
            Expanded(
              child: Center(
                child: Container(
                  margin: const EdgeInsets.all(18),
                  width: double.infinity,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [SyncColors.sky700, SyncColors.cyan, SyncColors.teal],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(28),
                  ),
                  child: const Center(
                    child: Padding(
                      padding: EdgeInsets.all(28),
                      child: Text(
                        'Flutter mobile parity is moving page by page.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900, height: 1.2),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            Container(
              padding: EdgeInsets.fromLTRB(12, 8, 12, MediaQuery.paddingOf(context).bottom + 10),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      style: const TextStyle(color: Colors.white),
                      decoration: InputDecoration(
                        hintText: 'Reply to status…',
                        hintStyle: const TextStyle(color: Colors.white60),
                        fillColor: Colors.white12,
                        prefixIcon: const Icon(Icons.reply_rounded, color: Colors.white70),
                        suffixIcon: IconButton(
                          onPressed: () {},
                          icon: const Icon(Icons.send_rounded, color: Colors.white),
                        ),
                      ),
                    ),
                  ),
                  IconButton(onPressed: () {}, icon: const Icon(Icons.favorite_border_rounded, color: Colors.white)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class CommunitiesScreen extends StatefulWidget {
  const CommunitiesScreen({super.key});

  @override
  State<CommunitiesScreen> createState() => _CommunitiesScreenState();
}

class _CommunitiesScreenState extends State<CommunitiesScreen> {
  final expanded = <int>{0};

  static const communities = <(String, String, List<String>)>[
    ('Product Community', '4 groups · 38 members', ['Announcements', 'Design', 'Engineering', 'Launch Room']),
    ('Open Source Builders', '3 groups · 112 members', ['General', 'Contributors', 'Release Notes']),
    ('Friends & Family', '2 groups · 18 members', ['Family', 'Weekend Plans']),
  ];

  @override
  Widget build(BuildContext context) {
    return SyncDockPage(
      title: 'Communities',
      trailing: IconButton(onPressed: () => _createCommunity(context), icon: const Icon(Icons.add_rounded)),
      child: ListView(
        padding: EdgeInsets.fromLTRB(14, 12, 14, 118 + MediaQuery.paddingOf(context).bottom),
        children: [
          SyncFeatureCard(
            icon: Icons.groups_2_outlined,
            title: 'Your communities',
            body: 'Keep related groups together, create community groups, and jump directly into their rooms.',
            actionLabel: 'Create community',
            onAction: () => _createCommunity(context),
          ),
          const SizedBox(height: 16),
          ...communities.asMap().entries.map((entry) {
            final index = entry.key;
            final item = entry.value;
            final isExpanded = expanded.contains(index);
            final preview = isExpanded ? item.$3 : item.$3.take(2).toList();
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: SyncSoftCard(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    ListTile(
                      contentPadding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
                      leading: SyncAvatar(name: item.$1, radius: 24),
                      title: Text(item.$1, style: const TextStyle(fontWeight: FontWeight.w900)),
                      subtitle: Text(item.$2),
                      trailing: PopupMenuButton<String>(
                        onSelected: (value) {
                          if (value == 'group') _createCommunityGroup(context, item.$1);
                        },
                        itemBuilder: (_) => const [
                          PopupMenuItem(value: 'group', child: Text('Create group')),
                          PopupMenuItem(value: 'info', child: Text('Community info')),
                        ],
                      ),
                    ),
                    Divider(height: 1, color: context.border),
                    ...preview.map(
                      (group) => ListTile(
                        leading: const CircleAvatar(
                          backgroundColor: Color(0x170EA5E9),
                          child: Icon(Icons.forum_outlined, color: SyncColors.sky, size: 19),
                        ),
                        title: Text(group, style: const TextStyle(fontWeight: FontWeight.w800)),
                        subtitle: const Text('Community group'),
                        trailing: const Icon(Icons.chevron_right_rounded),
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute<void>(builder: (_) => ChatRoomScreen(name: group, group: true)),
                        ),
                      ),
                    ),
                    if (item.$3.length > 2)
                      TextButton.icon(
                        onPressed: () => setState(() {
                          if (isExpanded) {
                            expanded.remove(index);
                          } else {
                            expanded.add(index);
                          }
                        }),
                        icon: Icon(isExpanded ? Icons.expand_less_rounded : Icons.expand_more_rounded),
                        label: Text(isExpanded ? 'Show less' : 'View all groups'),
                      ),
                  ],
                ),
              ),
            );
          }),
        ],
      ),
    );
  }

  void _createCommunity(BuildContext context) {
    showSyncSheet(
      context,
      title: 'Create community',
      body: Column(
        children: [
          const CircleAvatar(
            radius: 34,
            backgroundColor: Color(0x170EA5E9),
            child: Icon(Icons.add_photo_alternate_outlined, color: SyncColors.sky, size: 29),
          ),
          const SizedBox(height: 12),
          const TextField(decoration: InputDecoration(labelText: 'Community name')),
          const SizedBox(height: 10),
          Text('Avatar can be selected from camera or gallery.', style: TextStyle(color: context.muted, fontSize: 12)),
        ],
      ),
      actions: const [
        SyncSheetAction(label: 'Choose avatar', icon: Icons.photo_library_outlined),
        SyncSheetAction(label: 'Create community', icon: Icons.check_circle_outline_rounded),
      ],
    );
  }

  void _createCommunityGroup(BuildContext context, String community) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ParitySurfaceScreen(title: 'New group', subtitle: 'Create inside $community'),
      ),
    );
  }
}

class ChannelsScreen extends StatefulWidget {
  const ChannelsScreen({super.key});

  @override
  State<ChannelsScreen> createState() => _ChannelsScreenState();
}

class _ChannelsScreenState extends State<ChannelsScreen> {
  String tab = 'Joined';

  static const joined = <(String, String, bool)>[
    ('SyncChat News', 'Product announcements and updates', false),
    ('Engineering Daily', 'Build notes and technical releases', true),
    ('Design Dispatch', 'UI reviews, assets and guidelines', false),
  ];

  static const discover = <(String, String, bool)>[
    ('Startup Signals', 'Public founder and product channel', false),
    ('Private Research', 'Password-protected channel', true),
    ('Community Picks', 'Popular community updates', false),
  ];

  @override
  Widget build(BuildContext context) {
    final data = tab == 'Joined' ? joined : discover;
    return SyncDockPage(
      title: 'Channels',
      trailing: IconButton(onPressed: () => _createChannel(context), icon: const Icon(Icons.add_rounded)),
      child: ListView(
        padding: EdgeInsets.fromLTRB(14, 12, 14, 118 + MediaQuery.paddingOf(context).bottom),
        children: [
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'Joined', label: Text('Joined'), icon: Icon(Icons.check_circle_outline_rounded)),
              ButtonSegment(value: 'Discover', label: Text('Discover'), icon: Icon(Icons.explore_outlined)),
            ],
            selected: {tab},
            onSelectionChanged: (value) => setState(() => tab = value.first),
          ),
          const SizedBox(height: 14),
          if (tab == 'Discover')
            const Padding(
              padding: EdgeInsets.only(bottom: 12),
              child: TextField(
                decoration: InputDecoration(hintText: 'Search channels…', prefixIcon: Icon(Icons.search_rounded)),
              ),
            ),
          ...data.map(
            (channel) => SyncEntityTile(
              icon: channel.$3 ? Icons.lock_outline_rounded : Icons.podcasts_rounded,
              title: channel.$1,
              subtitle: '${channel.$2}${channel.$3 ? ' · Private' : ' · Public'}',
              trailing: tab == 'Joined'
                  ? const Icon(Icons.chevron_right_rounded)
                  : FilledButton(
                      onPressed: () => channel.$3 ? _requestPassword(context, channel.$1) : _joinChannel(context, channel.$1),
                      child: const Text('Join'),
                    ),
              onTap: () {
                if (tab == 'Joined') {
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(builder: (_) => ChatRoomScreen(name: channel.$1, group: true)),
                  );
                } else if (channel.$3) {
                  _requestPassword(context, channel.$1);
                } else {
                  _joinChannel(context, channel.$1);
                }
              },
            ),
          ),
        ],
      ),
    );
  }

  void _createChannel(BuildContext context) {
    showSyncSheet(
      context,
      title: 'Create channel',
      body: const Column(
        children: [
          TextField(decoration: InputDecoration(labelText: 'Channel name')),
          SizedBox(height: 10),
          TextField(decoration: InputDecoration(labelText: 'Description'), maxLines: 3),
          SizedBox(height: 10),
          TextField(decoration: InputDecoration(labelText: 'Private password (optional)', prefixIcon: Icon(Icons.lock_outline_rounded))),
        ],
      ),
      actions: const [
        SyncSheetAction(label: 'Choose avatar', icon: Icons.photo_library_outlined),
        SyncSheetAction(label: 'Create public channel', icon: Icons.public_rounded),
        SyncSheetAction(label: 'Create private channel', icon: Icons.lock_outline_rounded),
      ],
    );
  }

  void _requestPassword(BuildContext context, String channel) {
    showSyncSheet(
      context,
      title: 'Join $channel',
      body: const TextField(
        obscureText: true,
        decoration: InputDecoration(labelText: 'Channel password', prefixIcon: Icon(Icons.key_rounded)),
      ),
      actions: [
        SyncSheetAction(label: 'Join private channel', icon: Icons.login_rounded, onTap: () => _joinChannel(context, channel)),
      ],
    );
  }

  void _joinChannel(BuildContext context, String channel) {
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ChatRoomScreen(name: channel, group: true)));
  }
}

class CallsScreen extends StatefulWidget {
  const CallsScreen({super.key});

  @override
  State<CallsScreen> createState() => _CallsScreenState();
}

class _CallsScreenState extends State<CallsScreen> {
  String filter = 'All';

  static const calls = <(String, String, bool, bool)>[
    ('Atia Rahman', 'Today, 9:45 PM', false, true),
    ('Nadia Karim', 'Today, 7:14 PM', true, false),
    ('Mahin Hasan', 'Yesterday, 11:02 PM', false, false),
    ('Product Team', 'Yesterday, 4:22 PM', true, true),
    ('Rafi Ahmed', 'Monday, 10:31 AM', false, true),
    ('Support', 'Sunday, 6:05 PM', true, false),
  ];

  @override
  Widget build(BuildContext context) {
    final filtered = filter == 'Missed' ? calls.where((item) => item.$3).toList() : calls;
    return SyncDockPage(
      title: 'Calls',
      trailing: IconButton(onPressed: () => _startCall(context), icon: const Icon(Icons.add_call)),
      child: ListView(
        padding: EdgeInsets.fromLTRB(14, 12, 14, 118 + MediaQuery.paddingOf(context).bottom),
        children: [
          Row(
            children: [
              Expanded(
                child: SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'All', label: Text('All')),
                    ButtonSegment(value: 'Missed', label: Text('Missed')),
                  ],
                  selected: {filter},
                  onSelectionChanged: (value) => setState(() => filter = value.first),
                ),
              ),
              const SizedBox(width: 8),
              FilledButton.icon(onPressed: () => _startCall(context), icon: const Icon(Icons.add_call), label: const Text('New')),
            ],
          ),
          const SizedBox(height: 14),
          ...filtered.map(
            (call) => ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 2, vertical: 3),
              leading: SyncAvatar(name: call.$1, radius: 23),
              title: Text(call.$1, style: TextStyle(fontWeight: FontWeight.w900, color: call.$3 ? SyncColors.danger : null)),
              subtitle: Row(
                children: [
                  Icon(
                    call.$3
                        ? Icons.call_received_rounded
                        : call.$4
                            ? Icons.call_made_rounded
                            : Icons.call_received_rounded,
                    size: 15,
                    color: call.$3 ? SyncColors.danger : SyncColors.success,
                  ),
                  const SizedBox(width: 5),
                  Text(call.$2),
                ],
              ),
              trailing: Wrap(
                spacing: 2,
                children: [
                  IconButton(
                    onPressed: () => _openCall(context, call.$1, false),
                    icon: const Icon(Icons.call_outlined, color: SyncColors.sky),
                  ),
                  IconButton(
                    onPressed: () => _openCall(context, call.$1, true),
                    icon: const Icon(Icons.videocam_outlined, color: SyncColors.sky),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _startCall(BuildContext context) {
    showSyncSheet(
      context,
      title: 'Start call',
      body: const TextField(decoration: InputDecoration(hintText: 'Search contacts…', prefixIcon: Icon(Icons.search_rounded))),
      actions: [
        SyncSheetAction(label: 'Atia Rahman', subtitle: 'online', icon: Icons.person_outline_rounded, onTap: () => _openCall(context, 'Atia Rahman', false)),
        SyncSheetAction(label: 'Nadia Karim', subtitle: 'last seen recently', icon: Icons.person_outline_rounded, onTap: () => _openCall(context, 'Nadia Karim', true)),
        SyncSheetAction(label: 'Start group call', subtitle: 'Select multiple people', icon: Icons.groups_2_outlined, onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const ParitySurfaceScreen(title: 'Group call / LiveKit')))),
      ],
    );
  }

  void _openCall(BuildContext context, String name, bool video) {
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => CallPanelScreen(name: name, video: video)));
  }
}

class CallPanelScreen extends StatefulWidget {
  const CallPanelScreen({super.key, required this.name, required this.video});

  final String name;
  final bool video;

  @override
  State<CallPanelScreen> createState() => _CallPanelScreenState();
}

class _CallPanelScreenState extends State<CallPanelScreen> {
  bool muted = false;
  bool speaker = false;
  bool camera = true;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF061018),
      body: SafeArea(
        child: Stack(
          children: [
            Positioned.fill(
              child: Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    colors: [Color(0xFF102A3A), Color(0xFF071018)],
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                  ),
                ),
                child: widget.video
                    ? const Icon(Icons.person_rounded, size: 270, color: Colors.white10)
                    : const SizedBox.shrink(),
              ),
            ),
            Positioned(
              top: 12,
              left: 0,
              right: 0,
              child: Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: const Color(0xA60D1A21),
                    borderRadius: BorderRadius.circular(99),
                    border: Border.all(color: Colors.white10),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.lock_rounded, color: SyncColors.success, size: 16),
                      SizedBox(width: 7),
                      Text('Secure', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                    ],
                  ),
                ),
              ),
            ),
            Positioned(
              right: 12,
              top: 8,
              child: _CallCircle(icon: Icons.close_rounded, onTap: () => Navigator.pop(context)),
            ),
            Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (!widget.video) ...[
                    Container(
                      padding: const EdgeInsets.all(7),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(color: SyncColors.sky.withOpacity(.2), width: 3),
                        boxShadow: [BoxShadow(color: SyncColors.sky.withOpacity(.12), blurRadius: 50)],
                      ),
                      child: SyncAvatar(name: widget.name, radius: 70),
                    ),
                    const SizedBox(height: 20),
                  ],
                  Text(widget.name, style: const TextStyle(color: Colors.white, fontSize: 25, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 7),
                  Text(widget.video ? 'Video call · connected' : 'Calling securely…', style: const TextStyle(color: Colors.white60, fontWeight: FontWeight.w600)),
                ],
              ),
            ),
            if (widget.video)
              Positioned(
                right: 14,
                top: 74,
                child: Container(
                  width: 98,
                  height: 138,
                  decoration: BoxDecoration(
                    color: const Color(0xFF1D2935),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: Colors.white10),
                    boxShadow: const [BoxShadow(color: Colors.black38, blurRadius: 24, offset: Offset(0, 10))],
                  ),
                  child: const Icon(Icons.person_outline_rounded, color: Colors.white54, size: 54),
                ),
              ),
            Positioned(
              left: 12,
              right: 12,
              bottom: 18,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _CallCircle(icon: muted ? Icons.mic_off_rounded : Icons.mic_rounded, onTap: () => setState(() => muted = !muted)),
                  const SizedBox(width: 12),
                  _CallCircle(icon: speaker ? Icons.volume_up_rounded : Icons.volume_down_rounded, onTap: () => setState(() => speaker = !speaker)),
                  if (widget.video) ...[
                    const SizedBox(width: 12),
                    _CallCircle(icon: camera ? Icons.videocam_rounded : Icons.videocam_off_rounded, onTap: () => setState(() => camera = !camera)),
                  ],
                  const SizedBox(width: 14),
                  _CallCircle(icon: Icons.call_end_rounded, background: SyncColors.danger, size: 62, onTap: () => Navigator.pop(context)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CallCircle extends StatelessWidget {
  const _CallCircle({required this.icon, required this.onTap, this.background = const Color(0x22FFFFFF), this.size = 52});

  final IconData icon;
  final VoidCallback onTap;
  final Color background;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: background,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(width: size, height: size, child: Icon(icon, color: Colors.white, size: 22)),
      ),
    );
  }
}

class ContactsScreen extends StatefulWidget {
  const ContactsScreen({super.key});

  @override
  State<ContactsScreen> createState() => _ContactsScreenState();
}

class _ContactsScreenState extends State<ContactsScreen> {
  String query = '';
  String label = 'All';
  bool sortByName = true;

  static const contacts = <(String, String, bool, List<String>)>[
    ('Atia Rahman', '@atia', true, ['Friends', 'Work']),
    ('Nadia Karim', '@nadia', false, ['Friends']),
    ('Mahin Hasan', '@mahin', true, ['Work']),
    ('Rafi Ahmed', '@rafi', false, ['Family']),
    ('Support', '@support', true, ['Recent']),
  ];

  @override
  Widget build(BuildContext context) {
    final normalized = query.trim().toLowerCase();
    final visible = contacts.where((item) {
      final matchesQuery = normalized.isEmpty || item.$1.toLowerCase().contains(normalized) || item.$2.toLowerCase().contains(normalized);
      final matchesLabel = label == 'All' || item.$4.contains(label);
      return matchesQuery && matchesLabel;
    }).toList()
      ..sort((a, b) => sortByName ? a.$1.compareTo(b.$1) : 0);

    return SyncStandardPage(
      title: 'Contacts',
      actions: [
        IconButton(onPressed: () => _syncPhone(context), icon: const Icon(Icons.contact_phone_outlined)),
        IconButton(onPressed: () => _newContact(context), icon: const Icon(Icons.person_add_alt_1_rounded)),
      ],
      child: ListView(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 24),
        children: [
          TextField(
            onChanged: (value) => setState(() => query = value),
            decoration: const InputDecoration(hintText: 'Search contacts or username…', prefixIcon: Icon(Icons.search_rounded)),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 38,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    children: ['All', 'Friends', 'Work', 'Family', 'Recent']
                        .map(
                          (item) => Padding(
                            padding: const EdgeInsets.only(right: 7),
                            child: ChoiceChip(
                              label: Text(item),
                              selected: label == item,
                              onSelected: (_) => setState(() => label = item),
                              showCheckmark: false,
                            ),
                          ),
                        )
                        .toList(),
                  ),
                ),
              ),
              IconButton(onPressed: () => setState(() => sortByName = !sortByName), icon: const Icon(Icons.sort_by_alpha_rounded)),
              IconButton(onPressed: () => _labels(context), icon: const Icon(Icons.label_outline_rounded)),
            ],
          ),
          const SizedBox(height: 8),
          ...visible.map(
            (contact) => ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 3, vertical: 3),
              leading: SyncAvatar(name: contact.$1, online: contact.$3, radius: 23),
              title: Text(contact.$1, style: const TextStyle(fontWeight: FontWeight.w900)),
              subtitle: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(contact.$2),
                  const SizedBox(height: 4),
                  Wrap(
                    spacing: 4,
                    children: contact.$4.map((item) => Text('#$item', style: const TextStyle(fontSize: 10, color: SyncColors.sky))).toList(),
                  ),
                ],
              ),
              trailing: PopupMenuButton<String>(
                itemBuilder: (_) => const [
                  PopupMenuItem(value: 'chat', child: Text('Message')),
                  PopupMenuItem(value: 'label', child: Text('Manage labels')),
                  PopupMenuItem(value: 'share', child: Text('Share contact')),
                  PopupMenuItem(value: 'delete', child: Text('Delete contact')),
                ],
                onSelected: (value) {
                  if (value == 'chat') _openChat(context, contact.$1);
                  if (value == 'label') _labels(context);
                },
              ),
              onTap: () => _openChat(context, contact.$1),
            ),
          ),
        ],
      ),
    );
  }

  void _openChat(BuildContext context, String name) {
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ChatRoomScreen(name: name)));
  }

  void _newContact(BuildContext context) {
    showSyncSheet(
      context,
      title: 'New contact',
      body: const TextField(decoration: InputDecoration(labelText: 'Username, email or phone', prefixIcon: Icon(Icons.person_search_outlined))),
      actions: const [
        SyncSheetAction(label: 'Search user', icon: Icons.search_rounded),
        SyncSheetAction(label: 'Scan QR', icon: Icons.qr_code_scanner_rounded),
        SyncSheetAction(label: 'Invite contact', icon: Icons.share_outlined),
      ],
    );
  }

  void _syncPhone(BuildContext context) {
    showSyncSheet(
      context,
      title: 'Phone contacts',
      actions: const [
        SyncSheetAction(label: 'Sync phone book', subtitle: 'Match existing SyncChat users', icon: Icons.sync_rounded),
        SyncSheetAction(label: 'Matched contacts', subtitle: '8 people use SyncChat', icon: Icons.people_outline_rounded),
        SyncSheetAction(label: 'Invite contacts', subtitle: '12 people are not on SyncChat yet', icon: Icons.person_add_alt_1_rounded),
      ],
    );
  }

  void _labels(BuildContext context) {
    showSyncSheet(
      context,
      title: 'Contact labels',
      body: const TextField(decoration: InputDecoration(labelText: 'New label name', prefixIcon: Icon(Icons.label_outline_rounded))),
      actions: const [
        SyncSheetAction(label: 'Friends', subtitle: '2 contacts', icon: Icons.label_rounded),
        SyncSheetAction(label: 'Work', subtitle: '2 contacts', icon: Icons.label_rounded),
        SyncSheetAction(label: 'Family', subtitle: '1 contact', icon: Icons.label_rounded),
        SyncSheetAction(label: 'Create label', icon: Icons.add_rounded),
      ],
    );
  }
}

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final fields = <String, String>{
    'username': '@syncchat_user',
    'full name': 'SyncChat User',
    'bio': 'Building secure realtime conversations.',
    'phone': '+1 ••• ••• 0182',
    'email': 'user@example.com',
  };

  @override
  Widget build(BuildContext context) {
    return SyncStandardPage(
      title: 'Profile',
      actions: [
        IconButton(onPressed: () => _qr(context), icon: const Icon(Icons.qr_code_rounded)),
      ],
      child: ListView(
        padding: const EdgeInsets.only(bottom: 28),
        children: [
          const SizedBox(height: 18),
          Center(
            child: Stack(
              children: [
                const SyncAvatar(name: 'SyncChat User', radius: 56, online: true),
                Positioned(
                  right: 0,
                  bottom: 0,
                  child: CircleAvatar(
                    radius: 18,
                    backgroundColor: SyncColors.sky600,
                    child: IconButton(
                      padding: EdgeInsets.zero,
                      onPressed: () => _avatar(context),
                      icon: const Icon(Icons.camera_alt_rounded, color: Colors.white, size: 18),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Center(
            child: Text(fields['full name']!, style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w900)),
          ),
          const SizedBox(height: 18),
          ...fields.entries.map(
            (entry) => ListTile(
              leading: Icon(_fieldIcon(entry.key)),
              title: Text(entry.key, style: TextStyle(fontSize: 12, color: context.muted)),
              subtitle: Padding(
                padding: const EdgeInsets.only(top: 5),
                child: Text(entry.value, style: TextStyle(fontSize: 15, color: context.ink)),
              ),
              trailing: const Icon(Icons.edit_outlined, size: 19),
              onTap: () => _editField(context, entry.key, entry.value),
            ),
          ),
          Divider(color: context.border),
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 14, 16, 8),
            child: SyncSectionLabel('Social accounts'),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: ['Facebook', 'Instagram', 'WhatsApp', 'LinkedIn', 'X', 'Buddy', 'YouTube', 'Website']
                  .map((name) => ActionChip(label: Text(name), onPressed: () => _social(context, name)))
                  .toList(),
            ),
          ),
          const SizedBox(height: 10),
          Center(child: TextButton.icon(onPressed: () => _social(context, 'New account'), icon: const Icon(Icons.add_rounded), label: const Text('Add social account'))),
        ],
      ),
    );
  }

  IconData _fieldIcon(String key) {
    return switch (key) {
      'username' => Icons.alternate_email_rounded,
      'full name' => Icons.person_outline_rounded,
      'bio' => Icons.info_outline_rounded,
      'phone' => Icons.phone_outlined,
      'email' => Icons.email_outlined,
      _ => Icons.edit_outlined,
    };
  }

  void _editField(BuildContext context, String key, String value) {
    final controller = TextEditingController(text: value);
    showSyncSheet(
      context,
      title: 'Edit $key',
      body: TextField(controller: controller, maxLines: key == 'bio' ? 4 : 1, decoration: InputDecoration(labelText: key)),
      actions: [
        SyncSheetAction(
          label: 'Save changes',
          icon: Icons.check_rounded,
          onTap: () => setState(() => fields[key] = controller.text.trim()),
        ),
      ],
    );
  }

  void _avatar(BuildContext context) {
    showSyncSheet(
      context,
      title: 'Profile photo',
      actions: const [
        SyncSheetAction(label: 'Camera', icon: Icons.camera_alt_outlined),
        SyncSheetAction(label: 'Gallery', icon: Icons.photo_library_outlined),
        SyncSheetAction(label: 'Crop photo', icon: Icons.crop_rounded),
        SyncSheetAction(label: 'Remove photo', icon: Icons.delete_outline_rounded, danger: true),
      ],
    );
  }

  void _qr(BuildContext context) {
    showSyncSheet(
      context,
      title: 'Profile QR',
      body: Container(
        height: 190,
        decoration: BoxDecoration(color: context.softPanel, borderRadius: BorderRadius.circular(20)),
        child: const Center(child: Icon(Icons.qr_code_2_rounded, size: 150)),
      ),
      actions: const [
        SyncSheetAction(label: 'Share profile QR', icon: Icons.share_outlined),
        SyncSheetAction(label: 'Scan QR', icon: Icons.qr_code_scanner_rounded),
      ],
    );
  }

  void _social(BuildContext context, String name) {
    showSyncSheet(
      context,
      title: name,
      body: const TextField(decoration: InputDecoration(labelText: 'Profile URL', prefixIcon: Icon(Icons.link_rounded))),
      actions: const [
        SyncSheetAction(label: 'Save account', icon: Icons.check_rounded),
        SyncSheetAction(label: 'Remove account', icon: Icons.delete_outline_rounded, danger: true),
      ],
    );
  }
}

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key, required this.onThemeChanged});

  final ValueChanged<bool> onThemeChanged;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool dark = false;
  bool twoFactor = false;
  bool appLock = false;

  @override
  Widget build(BuildContext context) {
    final sections = <(String, List<_SettingRow>)>[
      (
        '',
        [
          _SettingRow(
            'Dark mode',
            'Use SyncChat dark surfaces across the mobile app.',
            Icons.brightness_6_outlined,
            trailing: Switch(
              value: dark,
              onChanged: (value) {
                setState(() => dark = value);
                widget.onThemeChanged(value);
              },
            ),
          ),
        ],
      ),
      (
        'Account',
        [
          const _SettingRow('Account settings', 'Security alerts, export, backup, password and delete options.', Icons.account_circle_outlined),
          const _SettingRow('Devices', 'Active devices, remote logout, link device and suspicious login alerts.', Icons.devices_other_rounded),
        ],
      ),
      (
        'Privacy',
        [const _SettingRow('Privacy', 'Last seen, profile photo, read receipts, blocked contacts and hidden chats.', Icons.shield_outlined)],
      ),
      (
        'Chat',
        [const _SettingRow('Chats', 'Wallpaper, media quality, downloads, spell check and chat behaviour.', Icons.chat_bubble_outline_rounded)],
      ),
      (
        'Notification',
        [const _SettingRow('Notifications', 'Banner, popup, push, previews, sound and mute controls.', Icons.notifications_none_rounded)],
      ),
      (
        'Voice & Video',
        [const _SettingRow('Voice & Video', 'Camera, microphone, speaker permissions and call behaviour.', Icons.video_call_outlined)],
      ),
      (
        'Apps setting',
        [
          _SettingRow(
            'Google 2FA',
            'Use an authenticator code after login.',
            Icons.security_rounded,
            trailing: Switch(
              value: twoFactor,
              onChanged: (value) => setState(() => twoFactor = value),
            ),
          ),
          _SettingRow(
            'App lock',
            'Require an app password before opening chats.',
            Icons.lock_outline_rounded,
            trailing: Switch(
              value: appLock,
              onChanged: (value) => setState(() => appLock = value),
            ),
          ),
          if (appLock) const _SettingRow('Change app lock password', 'Update the password used by app lock.', Icons.key_rounded),
          if (twoFactor) const _SettingRow('Recovery codes', 'Generate, copy or revoke backup codes.', Icons.vpn_key_outlined),
        ],
      ),
      (
        'Help',
        [
          const _SettingRow('Keyboard shortcuts', 'Desktop shortcuts mirrored from the web client reference.', Icons.keyboard_command_key_rounded),
          const _SettingRow('Media', 'Photos, videos, links and files shared in chats.', Icons.image_outlined),
          const _SettingRow('Feedback', 'Send product feedback to the SyncChat team.', Icons.feedback_outlined),
          const _SettingRow('Terms & privacy policy', 'Read terms and privacy information.', Icons.policy_outlined),
          const _SettingRow('License', 'Open-source and third-party license information.', Icons.info_outline_rounded),
          const _SettingRow('Flutter parity index', 'Track every web-visible surface included in the mobile scope.', Icons.fact_check_outlined),
        ],
      ),
      ('', [const _SettingRow('Log out', 'Sign out from this device.', Icons.logout_rounded, danger: true)]),
    ];

    return SyncStandardPage(
      title: 'Settings',
      child: ListView(
        padding: const EdgeInsets.fromLTRB(12, 6, 12, 28),
        children: sections.expand((section) {
          return <Widget>[
            if (section.$1.isNotEmpty) ...[
              const SizedBox(height: 14),
              Padding(padding: const EdgeInsets.symmetric(horizontal: 7), child: SyncSectionLabel(section.$1)),
              const SizedBox(height: 6),
            ],
            SyncSoftCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: section.$2.asMap().entries.map((entry) {
                  final row = entry.value;
                  return Column(
                    children: [
                      ListTile(
                        leading: CircleAvatar(
                          backgroundColor: (row.danger ? SyncColors.danger : SyncColors.sky).withOpacity(.1),
                          child: Icon(row.icon, color: row.danger ? SyncColors.danger : SyncColors.sky, size: 20),
                        ),
                        title: Text(row.title, style: TextStyle(fontWeight: FontWeight.w800, color: row.danger ? SyncColors.danger : null)),
                        subtitle: row.description.isEmpty ? null : Text(row.description),
                        trailing: row.trailing ?? Icon(Icons.chevron_right_rounded, color: context.muted),
                        onTap: row.trailing != null ? null : () => _openSetting(context, row.title),
                      ),
                      if (entry.key != section.$2.length - 1) Divider(height: 1, indent: 64, color: context.border),
                    ],
                  );
                }).toList(),
              ),
            ),
          ];
        }).toList(),
      ),
    );
  }

  void _openSetting(BuildContext context, String title) {
    if (title == 'Media') {
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => const CollectionScreen(
            title: 'Media',
            icon: Icons.image_outlined,
            description: 'Shared photos, videos, links and files.',
          ),
        ),
      );
      return;
    }
    if (title == 'Flutter parity index') {
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const ParityIndexScreen()));
      return;
    }
    if (title == 'Terms & privacy policy') {
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const ParitySurfaceScreen(title: 'Policy')));
      return;
    }
    if (title == 'License') {
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const ParitySurfaceScreen(title: 'License')));
      return;
    }
    if (title == 'Feedback') {
      showSyncSheet(
        context,
        title: 'Feedback',
        body: const TextField(maxLines: 5, decoration: InputDecoration(hintText: 'Tell us what should improve…')),
        actions: const [SyncSheetAction(label: 'Send feedback', icon: Icons.send_rounded)],
      );
      return;
    }
    if (title == 'Log out') {
      showSyncSheet(
        context,
        title: 'Log out?',
        actions: const [SyncSheetAction(label: 'Log out from this device', icon: Icons.logout_rounded, danger: true)],
      );
      return;
    }
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => SettingDetailScreen(title: title)));
  }
}

class _SettingRow {
  const _SettingRow(this.title, this.description, this.icon, {this.trailing, this.danger = false});

  final String title;
  final String description;
  final IconData icon;
  final Widget? trailing;
  final bool danger;
}

class SettingDetailScreen extends StatefulWidget {
  const SettingDetailScreen({super.key, required this.title});

  final String title;

  @override
  State<SettingDetailScreen> createState() => _SettingDetailScreenState();
}

class _SettingDetailScreenState extends State<SettingDetailScreen> {
  final enabled = <String, bool>{};

  @override
  Widget build(BuildContext context) {
    return SyncStandardPage(
      title: widget.title,
      child: ListView(
        padding: const EdgeInsets.all(14),
        children: [
          SyncFeatureCard(icon: _icon(widget.title), title: widget.title, body: _description(widget.title)),
          const SizedBox(height: 16),
          ..._items(widget.title).map((item) {
            if (item.$3) {
              final value = enabled[item.$1] ?? item.$4;
              return SyncSoftCard(
                margin: const EdgeInsets.only(bottom: 8),
                padding: EdgeInsets.zero,
                child: SwitchListTile(
                  title: Text(item.$1, style: const TextStyle(fontWeight: FontWeight.w800)),
                  subtitle: Text(item.$2),
                  value: value,
                  onChanged: (next) => setState(() => enabled[item.$1] = next),
                ),
              );
            }
            return SyncEntityTile(
              icon: Icons.chevron_right_rounded,
              title: item.$1,
              subtitle: item.$2,
              onTap: () => _detailAction(context, item.$1),
            );
          }),
        ],
      ),
    );
  }

  IconData _icon(String title) {
    return switch (title) {
      'Account settings' => Icons.account_circle_outlined,
      'Devices' => Icons.devices_other_rounded,
      'Privacy' => Icons.shield_outlined,
      'Chats' => Icons.chat_bubble_outline_rounded,
      'Notifications' => Icons.notifications_none_rounded,
      'Voice & Video' => Icons.video_call_outlined,
      'Google 2FA' => Icons.security_rounded,
      'App lock' => Icons.lock_outline_rounded,
      'Recovery codes' => Icons.vpn_key_outlined,
      'Keyboard shortcuts' => Icons.keyboard_command_key_rounded,
      _ => Icons.settings_outlined,
    };
  }

  String _description(String title) {
    return switch (title) {
      'Account settings' => 'Security notifications, account export, encrypted backup/restore, password changes, Google Drive and account deletion.',
      'Devices' => 'Review active sessions, device details, suspicious login alerts, remote logout, and link another device.',
      'Privacy' => 'Control last seen, profile photo, read receipts, groups, blocked contacts, hidden chats and calls.',
      'Chats' => 'Choose wallpaper and chat behaviour, media quality, automatic downloads, enter-to-send and spell check.',
      'Notifications' => 'Configure message and group notifications, previews, sounds, push, banners, popup and mute rules.',
      'Voice & Video' => 'Control camera, microphone and speaker permissions plus call behaviour.',
      'Google 2FA' => 'Use an authenticator app after password login.',
      'App lock' => 'Protect the local app with an additional password.',
      'Recovery codes' => 'Generate and manage backup codes for 2FA recovery.',
      'Keyboard shortcuts' => 'Reference the web keyboard shortcuts while preserving mobile gestures.',
      _ => 'SyncChat mobile settings parity.',
    };
  }

  List<(String, String, bool, bool)> _items(String title) {
    return switch (title) {
      'Account settings' => const [
          ('Security notifications', 'Alert when sensitive account settings change.', true, true),
          ('Export account info', 'Generate a portable account information export.', false, false),
          ('Encrypted backup', 'Create a password-protected backup archive.', false, false),
          ('Restore backup', 'Restore profile, settings, contacts and statuses.', false, false),
          ('Google Drive', 'Connect Drive for backup upload and restore.', false, false),
          ('Change password', 'Update your account password.', false, false),
          ('Delete account', 'Request permanent account deletion.', false, false),
        ],
      'Devices' => const [
          ('This device', 'Current mobile session · active now.', false, false),
          ('Web Chrome', 'Windows · last active 18 minutes ago.', false, false),
          ('Link a device', 'Use QR or short code to connect another device.', false, false),
          ('Suspicious login alerts', 'Notify when a new or unusual device signs in.', true, true),
        ],
      'Privacy' => const [
          ('Last seen & online', 'Who can see your activity status.', false, false),
          ('Profile photo', 'Who can see your profile image.', false, false),
          ('Read receipts', 'Send and receive blue read indicators.', true, true),
          ('Groups', 'Who can add you to groups.', false, false),
          ('Calls', 'Who can call you.', false, false),
          ('Blocked contacts', 'Review people you blocked.', false, false),
          ('Hidden chats', 'Review chats hidden from the inbox.', false, false),
        ],
      'Chats' => const [
          ('Room appearance', 'Wallpaper and bubble theme.', false, false),
          ('Enter is send', 'Send a message when pressing Enter.', true, false),
          ('Media quality', 'Choose standard or high-quality uploads.', false, false),
          ('Auto-download photos', 'Download photos on Wi-Fi.', true, true),
          ('Auto-download videos', 'Download videos on Wi-Fi.', true, false),
          ('Spell check', 'Highlight spelling issues while composing.', true, true),
        ],
      'Notifications' => const [
          ('Message notifications', 'Show alerts for private messages.', true, true),
          ('Group notifications', 'Show alerts for group messages.', true, true),
          ('Channel notifications', 'Show alerts for channels.', true, true),
          ('Message preview', 'Include message text in notification preview.', true, true),
          ('Sound', 'Play notification sounds.', true, true),
          ('Push notifications', 'Receive background push notifications.', true, true),
          ('Banner notifications', 'Show in-app notification banners.', true, true),
        ],
      'Voice & Video' => const [
          ('Camera permission', 'Allow camera automatically when joining video calls.', true, true),
          ('Microphone permission', 'Allow microphone automatically during calls.', true, true),
          ('Speaker routing', 'Prefer speaker for video calls.', true, false),
          ('Reduce call data', 'Use lower bandwidth when network quality drops.', true, true),
        ],
      'Google 2FA' => const [
          ('Authenticator setup', 'Scan QR and verify a six-digit code.', false, false),
          ('Require 2FA at login', 'Ask for authenticator code after password login.', true, true),
        ],
      'App lock' => const [
          ('Lock immediately', 'Ask for app password whenever the app opens.', true, true),
          ('Change app lock password', 'Update the local app-lock password.', false, false),
        ],
      'Recovery codes' => const [
          ('Generate codes', 'Create a new set of backup recovery codes.', false, false),
          ('Copy codes', 'Copy current recovery codes.', false, false),
          ('Revoke codes', 'Invalidate all generated recovery codes.', false, false),
        ],
      'Keyboard shortcuts' => const [
          ('Open chat search', 'Ctrl / Cmd + K', false, false),
          ('Focus composer', 'Ctrl / Cmd + L', false, false),
          ('Close active panel', 'Escape', false, false),
          ('Send message', 'Enter', false, false),
        ],
      _ => const [('Sync setting', 'This setting is included in the web-to-mobile parity scope.', false, false)],
    };
  }

  void _detailAction(BuildContext context, String title) {
    if (title == 'Room appearance') {
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const RoomAppearanceScreen()));
      return;
    }
    if (title == 'Google Drive') {
      showSyncSheet(
        context,
        title: 'Google Drive',
        actions: const [
          SyncSheetAction(label: 'Connect Google Drive', icon: Icons.cloud_outlined),
          SyncSheetAction(label: 'Upload latest backup', icon: Icons.cloud_upload_outlined),
          SyncSheetAction(label: 'Restore from Drive', icon: Icons.cloud_download_outlined),
        ],
      );
      return;
    }
    if (title == 'Delete account') {
      showSyncSheet(
        context,
        title: 'Delete account',
        body: const TextField(obscureText: true, decoration: InputDecoration(labelText: 'Current password')),
        actions: const [SyncSheetAction(label: 'Delete account permanently', icon: Icons.delete_forever_outlined, danger: true)],
      );
      return;
    }
    if (title == 'Change password' || title == 'Change app lock password') {
      showSyncSheet(
        context,
        title: title,
        body: const Column(
          children: [
            TextField(obscureText: true, decoration: InputDecoration(labelText: 'Current password')),
            SizedBox(height: 8),
            TextField(obscureText: true, decoration: InputDecoration(labelText: 'New password')),
          ],
        ),
        actions: const [SyncSheetAction(label: 'Save password', icon: Icons.check_rounded)],
      );
      return;
    }
    if (title == 'Link a device' || title == 'Authenticator setup') {
      showSyncSheet(
        context,
        title: title,
        body: Container(
          height: 180,
          decoration: BoxDecoration(color: context.softPanel, borderRadius: BorderRadius.circular(20)),
          child: const Center(child: Icon(Icons.qr_code_2_rounded, size: 140)),
        ),
        actions: const [
          SyncSheetAction(label: 'Scan QR', icon: Icons.qr_code_scanner_rounded),
          SyncSheetAction(label: 'Use short code', icon: Icons.pin_outlined),
        ],
      );
      return;
    }
    showSyncSheet(
      context,
      title: title,
      actions: const [SyncSheetAction(label: 'Open settings', icon: Icons.tune_rounded)],
    );
  }
}

class CollectionScreen extends StatelessWidget {
  const CollectionScreen({super.key, required this.title, required this.icon, required this.description});

  final String title;
  final IconData icon;
  final String description;

  @override
  Widget build(BuildContext context) {
    return SyncStandardPage(
      title: title,
      child: ListView(
        padding: const EdgeInsets.all(14),
        children: [
          SyncFeatureCard(icon: icon, title: title, body: description),
          const SizedBox(height: 18),
          if (title == 'Media') ...[
            Wrap(spacing: 8, children: ['Media', 'Links', 'Files'].map((item) => Chip(label: Text(item))).toList()),
            const SizedBox(height: 12),
            GridView.builder(
              physics: const NeverScrollableScrollPhysics(),
              shrinkWrap: true,
              itemCount: 12,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 3, mainAxisSpacing: 4, crossAxisSpacing: 4),
              itemBuilder: (_, index) => Container(
                decoration: BoxDecoration(
                  color: index.isEven ? SyncColors.sky.withOpacity(.16) : context.softPanel,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(index.isEven ? Icons.image_outlined : Icons.play_circle_outline_rounded),
              ),
            ),
          ] else
            ...List.generate(
              6,
              (index) => ListTile(
                leading: CircleAvatar(backgroundColor: SyncColors.sky.withOpacity(.12), child: Icon(icon, color: SyncColors.sky, size: 19)),
                title: Text('$title item ${index + 1}', style: const TextStyle(fontWeight: FontWeight.w800)),
                subtitle: const Text('Synced with the web client state'),
                trailing: const Icon(Icons.chevron_right_rounded),
              ),
            ),
        ],
      ),
    );
  }
}

class ChatToolsScreen extends StatefulWidget {
  const ChatToolsScreen({super.key});

  @override
  State<ChatToolsScreen> createState() => _ChatToolsScreenState();
}

class _ChatToolsScreenState extends State<ChatToolsScreen> {
  int index = 0;
  static const tabs = <(String, IconData)>[
    ('Search', Icons.search_rounded),
    ('Requests', Icons.mark_chat_unread_outlined),
    ('Mentions', Icons.alternate_email_rounded),
    ('Topics', Icons.forum_outlined),
    ('Security', Icons.shield_outlined),
    ('Outbox', Icons.cloud_upload_outlined),
  ];

  @override
  Widget build(BuildContext context) {
    final current = tabs[index];
    return SyncStandardPage(
      title: 'Chat tools',
      child: Column(
        children: [
          SizedBox(
            height: 58,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              itemCount: tabs.length,
              itemBuilder: (_, itemIndex) => Padding(
                padding: const EdgeInsets.only(right: 7),
                child: ChoiceChip(
                  selected: index == itemIndex,
                  showCheckmark: false,
                  avatar: Icon(tabs[itemIndex].$2, size: 17),
                  label: Text(tabs[itemIndex].$1),
                  onSelected: (_) => setState(() => index = itemIndex),
                ),
              ),
            ),
          ),
          Divider(height: 1, color: context.border),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(14),
              children: [
                SyncFeatureCard(icon: current.$2, title: current.$1, body: _toolDescription(current.$1)),
                const SizedBox(height: 14),
                if (current.$1 == 'Search')
                  const TextField(decoration: InputDecoration(hintText: 'Search messages, media or links…', prefixIcon: Icon(Icons.search_rounded))),
                if (current.$1 == 'Security')
                  SyncSoftCard(
                    child: SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Device E2EE', style: TextStyle(fontWeight: FontWeight.w800)),
                      subtitle: const Text('Enable for new private text messages.'),
                      value: true,
                      onChanged: (_) {},
                    ),
                  ),
                if (current.$1 == 'Topics')
                  SyncSoftCard(
                    child: Column(
                      children: [
                        const TextField(decoration: InputDecoration(hintText: 'New topic name')),
                        const SizedBox(height: 8),
                        Align(alignment: Alignment.centerRight, child: FilledButton.icon(onPressed: () {}, icon: const Icon(Icons.add_rounded), label: const Text('Create topic'))),
                      ],
                    ),
                  ),
                const SizedBox(height: 8),
                ...List.generate(
                  5,
                  (itemIndex) => ListTile(
                    leading: CircleAvatar(backgroundColor: SyncColors.sky.withOpacity(.1), child: Icon(current.$2, color: SyncColors.sky, size: 18)),
                    title: Text('${current.$1} item ${itemIndex + 1}', style: const TextStyle(fontWeight: FontWeight.w800)),
                    subtitle: Text(itemIndex == 0 ? 'Latest synced result' : 'Web-equivalent state'),
                    trailing: const Icon(Icons.chevron_right_rounded),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _toolDescription(String name) {
    return switch (name) {
      'Search' => 'Search the current room or all chats by text and content type.',
      'Requests' => 'Accept, delete or block incoming message requests.',
      'Mentions' => 'See messages where your username was mentioned.',
      'Topics' => 'Filter a group room and send new messages inside a topic.',
      'Security' => 'Inspect private-room E2EE state and message receipt details.',
      'Outbox' => 'Review pending or failed messages and retry delivery.',
      _ => '',
    };
  }
}

class RoomAppearanceScreen extends StatefulWidget {
  const RoomAppearanceScreen({super.key});

  @override
  State<RoomAppearanceScreen> createState() => _RoomAppearanceScreenState();
}

class _RoomAppearanceScreenState extends State<RoomAppearanceScreen> {
  String wallpaper = 'Pattern';
  String bubble = 'Default';

  @override
  Widget build(BuildContext context) {
    const wallpapers = ['Pattern', 'Plain', 'Sunset', 'Ocean', 'Forest', 'Custom Image'];
    const bubbles = ['Default', 'Mint', 'Amber', 'Violet'];
    return SyncStandardPage(
      title: 'Room Appearance',
      child: ListView(
        padding: const EdgeInsets.all(14),
        children: [
          const SyncSectionLabel('Wallpaper'),
          const SizedBox(height: 8),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 8,
            crossAxisSpacing: 8,
            childAspectRatio: 1.55,
            children: wallpapers.map((name) {
              final selected = name == wallpaper;
              return InkWell(
                onTap: () => setState(() => wallpaper = name),
                borderRadius: BorderRadius.circular(16),
                child: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: context.softPanel,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: selected ? SyncColors.sky : context.border, width: selected ? 2 : 1),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Container(
                          width: double.infinity,
                          decoration: BoxDecoration(
                            gradient: _wallpaperGradient(name),
                            borderRadius: BorderRadius.circular(11),
                          ),
                          child: name == 'Custom Image' ? const Icon(Icons.add_photo_alternate_outlined) : null,
                        ),
                      ),
                      const SizedBox(height: 5),
                      Text(name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12)),
                    ],
                  ),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 20),
          const SyncSectionLabel('Bubble theme'),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: bubbles.map((name) => ChoiceChip(label: Text(name), selected: bubble == name, onSelected: (_) => setState(() => bubble = name))).toList(),
          ),
          const SizedBox(height: 20),
          SyncSoftCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text('Live preview', style: TextStyle(fontWeight: FontWeight.w900)),
                const SizedBox(height: 12),
                Container(
                  height: 280,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(gradient: _wallpaperGradient(wallpaper), borderRadius: BorderRadius.circular(20)),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Container(
                          constraints: const BoxConstraints(maxWidth: 250),
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(color: context.panel, borderRadius: BorderRadius.circular(16)),
                          child: const Text('This looks much better now.'),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Align(
                        alignment: Alignment.centerRight,
                        child: Container(
                          constraints: const BoxConstraints(maxWidth: 250),
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(color: SyncColors.sentBubble, borderRadius: BorderRadius.circular(16)),
                          child: const Text('Same SyncChat style, adapted for mobile.', style: TextStyle(color: SyncColors.slate900)),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Align(alignment: Alignment.centerRight, child: FilledButton.icon(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.check_rounded), label: const Text('Save appearance'))),
        ],
      ),
    );
  }

  LinearGradient _wallpaperGradient(String name) {
    return switch (name) {
      'Sunset' => const LinearGradient(colors: [Color(0xFFF59E0B), Color(0xFFEC4899)]),
      'Ocean' => const LinearGradient(colors: [Color(0xFF0284C7), Color(0xFF06B6D4)]),
      'Forest' => const LinearGradient(colors: [Color(0xFF15803D), Color(0xFF14B8A6)]),
      'Plain' => const LinearGradient(colors: [SyncColors.slate200, SyncColors.slate200]),
      'Custom Image' => const LinearGradient(colors: [SyncColors.slate100, SyncColors.slate300]),
      _ => const LinearGradient(colors: [Color(0xFFE0F2FE), Color(0xFFECFEFF)]),
    };
  }
}

class ParityIndexScreen extends StatelessWidget {
  const ParityIndexScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final groups = <String, List<ParitySurface>>{};
    for (final surface in parityCatalog) {
      groups.putIfAbsent(surface.group, () => <ParitySurface>[]).add(surface);
    }
    return SyncStandardPage(
      title: 'Flutter parity index',
      child: ListView(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 28),
        children: groups.entries.expand((entry) {
          return <Widget>[
            Padding(padding: const EdgeInsets.fromLTRB(4, 12, 4, 7), child: SyncSectionLabel('${entry.key} · ${entry.value.length}')),
            ...entry.value.map(
              (surface) => ListTile(
                dense: true,
                leading: Icon(surface.kind == 'sheet' ? Icons.vertical_align_bottom_rounded : Icons.phone_android_rounded, color: SyncColors.sky, size: 19),
                title: Text(surface.name, style: const TextStyle(fontWeight: FontWeight.w800)),
                subtitle: Text(surface.webSource, maxLines: 1, overflow: TextOverflow.ellipsis),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ParitySurfaceScreen(title: surface.name))),
              ),
            ),
          ];
        }).toList(),
      ),
    );
  }
}
