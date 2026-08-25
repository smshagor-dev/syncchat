import 'package:flutter/material.dart';

import '../sheets.dart';
import '../theme.dart';
import '../widgets.dart';
import 'chat_room_screen.dart';
import 'core_screens.dart';
import 'parity_surface_screen.dart';

enum HomeTab { chats, status, communities, channels, calls }

class MobileShell extends StatefulWidget {
  const MobileShell({super.key, required this.onThemeChanged});

  final ValueChanged<bool> onThemeChanged;

  @override
  State<MobileShell> createState() => _MobileShellState();
}

class _MobileShellState extends State<MobileShell> {
  final scaffoldKey = GlobalKey<ScaffoldState>();
  HomeTab selected = HomeTab.chats;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: scaffoldKey,
      drawerScrimColor: Colors.black.withOpacity(.46),
      drawer: _MobileRail(onSelected: _openRailTarget),
      body: Stack(
        children: [
          Positioned.fill(child: _pageForTab()),
          Positioned(
            left: 12,
            right: 12,
            bottom: MediaQuery.paddingOf(context).bottom + 8,
            child: _BottomDock(
              selected: selected,
              onSelect: (tab) => setState(() => selected = tab),
            ),
          ),
        ],
      ),
    );
  }

  Widget _pageForTab() {
    return switch (selected) {
      HomeTab.chats => ChatsScreen(
          onMenu: () => scaffoldKey.currentState?.openDrawer(),
        ),
      HomeTab.status => const StatusScreen(),
      HomeTab.communities => const CommunitiesScreen(),
      HomeTab.channels => const ChannelsScreen(),
      HomeTab.calls => const CallsScreen(),
    };
  }

  void _openRailTarget(String target) {
    Navigator.pop(context);
    final tabTargets = <String, HomeTab>{
      'chats': HomeTab.chats,
      'status': HomeTab.status,
      'communities': HomeTab.communities,
      'channels': HomeTab.channels,
      'calls': HomeTab.calls,
    };
    final tab = tabTargets[target];
    if (tab != null) {
      setState(() => selected = tab);
      return;
    }

    final Widget screen = switch (target) {
      'contacts' => const ContactsScreen(),
      'archive' => const CollectionScreen(
          title: 'Archive',
          icon: Icons.archive_outlined,
          description: 'Chats archived from the main inbox.',
        ),
      'lists' => const CollectionScreen(
          title: 'Lists',
          icon: Icons.format_list_bulleted_rounded,
          description: 'Custom chat lists and grouped conversations.',
        ),
      'media' => const CollectionScreen(
          title: 'Media',
          icon: Icons.image_outlined,
          description: 'Shared photos, videos, links and files.',
        ),
      'settings' => SettingsScreen(onThemeChanged: widget.onThemeChanged),
      'profile' => const ProfileScreen(),
      _ => ParitySurfaceScreen(title: target),
    };

    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => screen),
    );
  }
}

class _BottomDock extends StatelessWidget {
  const _BottomDock({required this.selected, required this.onSelect});

  final HomeTab selected;
  final ValueChanged<HomeTab> onSelect;

  static const items = [
    (HomeTab.chats, 'Chats', Icons.chat_bubble_outline_rounded),
    (HomeTab.status, 'Status', Icons.donut_large_rounded),
    (HomeTab.communities, 'Communities', Icons.groups_2_outlined),
    (HomeTab.channels, 'Channels', Icons.podcasts_rounded),
    (HomeTab.calls, 'Calls', Icons.call_outlined),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        color: context.panel.withOpacity(.96),
        borderRadius: BorderRadius.circular(27),
        border: Border.all(color: context.border),
        boxShadow: const [
          BoxShadow(
            color: Color(0x500F172A),
            blurRadius: 30,
            offset: Offset(0, 12),
          ),
        ],
      ),
      child: Row(
        children: items.map((item) {
          final active = selected == item.$1;
          return Expanded(
            child: InkWell(
              borderRadius: BorderRadius.circular(19),
              onTap: () => onSelect(item.$1),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 7, horizontal: 2),
                decoration: BoxDecoration(
                  color: active ? SyncColors.sky.withOpacity(.12) : Colors.transparent,
                  borderRadius: BorderRadius.circular(19),
                ),
                child: Stack(
                  clipBehavior: Clip.none,
                  alignment: Alignment.topCenter,
                  children: [
                    Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 29,
                          height: 29,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: active ? SyncColors.sky : context.softPanel,
                            boxShadow: active
                                ? [
                                    BoxShadow(
                                      color: SyncColors.sky.withOpacity(.38),
                                      blurRadius: 12,
                                      offset: const Offset(0, 5),
                                    ),
                                  ]
                                : null,
                          ),
                          child: Icon(
                            item.$3,
                            size: 17,
                            color: active ? Colors.white : context.muted,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          item.$2,
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
                    if (active)
                      Positioned(
                        top: -9,
                        child: Container(
                          width: 32,
                          height: 4,
                          decoration: BoxDecoration(
                            color: SyncColors.sky,
                            borderRadius: BorderRadius.circular(99),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

class _MobileRail extends StatelessWidget {
  const _MobileRail({required this.onSelected});

  final ValueChanged<String> onSelected;

  static const items = [
    ('chats', 'Chats', Icons.chat_bubble_outline_rounded),
    ('calls', 'Calls', Icons.call_outlined),
    ('status', 'Status', Icons.donut_large_rounded),
    ('contacts', 'Contacts', Icons.group_outlined),
    ('communities', 'Communities', Icons.groups_2_outlined),
    ('channels', 'Channels', Icons.podcasts_rounded),
    ('archive', 'Archive', Icons.archive_outlined),
    ('lists', 'Lists', Icons.format_list_bulleted_rounded),
    ('media', 'Media', Icons.image_outlined),
    ('settings', 'Settings', Icons.settings_outlined),
    ('profile', 'Profile', Icons.person_outline_rounded),
  ];

  @override
  Widget build(BuildContext context) {
    return Drawer(
      width: 94,
      backgroundColor: context.isDark ? SyncColors.spill900 : SyncColors.slate900,
      shape: const RoundedRectangleBorder(),
      child: SafeArea(
        child: Column(
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: IconButton(
                onPressed: () => Navigator.pop(context),
                icon: const Icon(Icons.close_rounded, color: Colors.white70, size: 19),
              ),
            ),
            Expanded(
              child: ListView.builder(
                padding: EdgeInsets.fromLTRB(
                  5,
                  0,
                  5,
                  MediaQuery.paddingOf(context).bottom + 16,
                ),
                itemCount: items.length,
                itemBuilder: (_, index) {
                  final item = items[index];
                  return InkWell(
                    borderRadius: BorderRadius.circular(14),
                    onTap: () => onSelected(item.$1),
                    child: SizedBox(
                      height: 56,
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(item.$3, size: 21, color: Colors.white70),
                          const SizedBox(height: 4),
                          Text(
                            item.$2,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Colors.white70,
                              fontSize: 9,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class ChatsScreen extends StatefulWidget {
  const ChatsScreen({super.key, required this.onMenu});

  final VoidCallback onMenu;

  @override
  State<ChatsScreen> createState() => _ChatsScreenState();
}

class _ChatsScreenState extends State<ChatsScreen> {
  String filter = 'All';

  static const chats = [
    ('Atia Rahman', 'The new build is ready to check.', '10:42 PM', 4, true),
    ('SyncChat Team', 'Pinned: release checklist', '9:18 PM', 1, true),
    ('Product Community', 'Mahin: I shared the design file', '8:05 PM', 0, false),
    ('Nadia Karim', 'Voice message · 0:24', 'Yesterday', 0, true),
    ('Engineering', 'Poll: preferred release window?', 'Yesterday', 7, false),
    ('Support', 'Your request was updated.', 'Mon', 0, true),
    ('Family', 'Photo', 'Sun', 0, false),
  ];

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: context.isDark ? SyncColors.spill950 : Colors.white,
      child: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Container(
              height: 64,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              color: context.isDark ? SyncColors.spill800 : SyncColors.slate100,
              child: Row(
                children: [
                  SyncRoundAction(icon: Icons.menu_rounded, onTap: widget.onMenu),
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: SyncColors.sky,
                      borderRadius: BorderRadius.circular(9),
                    ),
                    child: const Icon(Icons.sync_rounded, color: Colors.white, size: 20),
                  ),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      'SyncChat',
                      style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
                    ),
                  ),
                  SyncRoundAction(icon: Icons.refresh_rounded, onTap: () {}),
                  SyncRoundAction(
                    icon: Icons.add_comment_outlined,
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(builder: (_) => const ContactsScreen()),
                    ),
                  ),
                  SyncRoundAction(
                    icon: Icons.more_vert_rounded,
                    onTap: () => showSyncSheet(
                      context,
                      title: 'More',
                      actions: [
                        SyncSheetAction(
                          label: 'New group',
                          icon: Icons.group_add_outlined,
                          onTap: () => _openSurface(context, 'New group'),
                        ),
                        SyncSheetAction(
                          label: 'Starred messages',
                          icon: Icons.star_border_rounded,
                          onTap: () => Navigator.of(context).push(
                            MaterialPageRoute<void>(
                              builder: (_) => const CollectionScreen(
                                title: 'Starred messages',
                                icon: Icons.star_border_rounded,
                                description: 'Messages you starred for quick access.',
                              ),
                            ),
                          ),
                        ),
                        SyncSheetAction(
                          label: 'Settings',
                          icon: Icons.settings_outlined,
                          onTap: () => _openSurface(context, 'Settings'),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Container(
              color: context.panel,
              padding: const EdgeInsets.fromLTRB(12, 9, 12, 8),
              child: Column(
                children: [
                  const TextField(
                    decoration: InputDecoration(
                      hintText: 'Search chats...',
                      prefixIcon: Icon(Icons.search_rounded, size: 20),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    height: 34,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      children: ['All', 'Unread (12)', 'Favourite (4)', 'Group (6)']
                          .map((label) {
                        final key = label.split(' ').first;
                        final active = filter == key;
                        return Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: ChoiceChip(
                            label: Text(label),
                            selected: active,
                            showCheckmark: false,
                            selectedColor: SyncColors.sky600,
                            labelStyle: TextStyle(
                              color: active ? Colors.white : context.ink,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                            side: BorderSide(
                              color: active ? SyncColors.sky600 : context.border,
                            ),
                            onSelected: (_) => setState(() => filter = key),
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                ],
              ),
            ),
            Container(
              height: 86,
              color: context.panel,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                children: const [
                  SyncStatusAvatar(name: 'You', add: true),
                  SyncStatusAvatar(name: 'Atia'),
                  SyncStatusAvatar(name: 'Nadia'),
                  SyncStatusAvatar(name: 'Mahin'),
                  SyncStatusAvatar(name: 'Rafi'),
                  SyncStatusAvatar(name: 'Team'),
                ],
              ),
            ),
            Divider(height: 1, color: context.border),
            Expanded(
              child: ListView.separated(
                padding: EdgeInsets.only(
                  bottom: 116 + MediaQuery.paddingOf(context).bottom,
                ),
                itemCount: chats.length,
                separatorBuilder: (_, __) => Divider(
                  height: 1,
                  indent: 76,
                  color: context.border.withOpacity(.7),
                ),
                itemBuilder: (context, index) {
                  final chat = chats[index];
                  return InkWell(
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => ChatRoomScreen(
                          name: chat.$1,
                          group: index == 1 || index == 2 || index == 4 || index == 6,
                        ),
                      ),
                    ),
                    onLongPress: () => showInboxActionsSheet(context),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                      child: Row(
                        children: [
                          SyncAvatar(name: chat.$1, online: chat.$5),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        chat.$1,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(
                                          fontWeight: chat.$4 > 0
                                              ? FontWeight.w900
                                              : FontWeight.w700,
                                        ),
                                      ),
                                    ),
                                    Text(
                                      chat.$3,
                                      style: TextStyle(
                                        fontSize: 11,
                                        color: chat.$4 > 0 ? SyncColors.sky : context.muted,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 5),
                                Row(
                                  children: [
                                    if (chat.$5)
                                      const Padding(
                                        padding: EdgeInsets.only(right: 5),
                                        child: Icon(
                                          Icons.done_all_rounded,
                                          size: 16,
                                          color: SyncColors.sky,
                                        ),
                                      ),
                                    Expanded(
                                      child: Text(
                                        chat.$2,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(
                                          color: chat.$4 > 0 ? context.ink : context.muted,
                                          fontWeight: chat.$4 > 0
                                              ? FontWeight.w700
                                              : FontWeight.w400,
                                        ),
                                      ),
                                    ),
                                    if (chat.$4 > 0)
                                      Container(
                                        margin: const EdgeInsets.only(left: 8),
                                        constraints: const BoxConstraints(minWidth: 22),
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 6,
                                          vertical: 3,
                                        ),
                                        decoration: BoxDecoration(
                                          color: SyncColors.success,
                                          borderRadius: BorderRadius.circular(99),
                                        ),
                                        child: Text(
                                          '${chat.$4}',
                                          textAlign: TextAlign.center,
                                          style: const TextStyle(
                                            color: Colors.white,
                                            fontSize: 11,
                                            fontWeight: FontWeight.w900,
                                          ),
                                        ),
                                      ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _openSurface(BuildContext context, String title) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => ParitySurfaceScreen(title: title)),
    );
  }
}
