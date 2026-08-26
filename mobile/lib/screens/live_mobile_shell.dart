import 'package:flutter/material.dart';

import '../theme.dart';
import 'core_screens.dart';
import 'live_calls_screen.dart';
import 'live_home_screens.dart';

enum LiveHomeTab { chats, status, communities, channels, calls }

class LiveMobileShell extends StatefulWidget {
  const LiveMobileShell({super.key, required this.onThemeChanged});

  final ValueChanged<bool> onThemeChanged;

  @override
  State<LiveMobileShell> createState() => _LiveMobileShellState();
}

class _LiveMobileShellState extends State<LiveMobileShell> {
  final scaffoldKey = GlobalKey<ScaffoldState>();
  LiveHomeTab selected = LiveHomeTab.chats;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: scaffoldKey,
      drawerScrimColor: Colors.black.withValues(alpha: .46),
      drawer: _LiveMobileRail(onSelected: _openRailTarget),
      body: Stack(
        children: [
          Positioned.fill(child: _pageForTab()),
          Positioned(
            left: 12,
            right: 12,
            bottom: MediaQuery.paddingOf(context).bottom + 8,
            child: _LiveBottomDock(
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
      LiveHomeTab.chats => LiveChatsScreen(
        onMenu: () => scaffoldKey.currentState?.openDrawer(),
      ),
      LiveHomeTab.status => const LiveStatusScreen(),
      LiveHomeTab.communities => const LiveCommunitiesScreen(),
      LiveHomeTab.channels => const LiveChannelsScreen(),
      LiveHomeTab.calls => const LiveCallsScreen(),
    };
  }

  void _openRailTarget(String target) {
    Navigator.pop(context);
    final tabTargets = <String, LiveHomeTab>{
      'chats': LiveHomeTab.chats,
      'status': LiveHomeTab.status,
      'communities': LiveHomeTab.communities,
      'channels': LiveHomeTab.channels,
      'calls': LiveHomeTab.calls,
    };
    final tab = tabTargets[target];
    if (tab != null) {
      setState(() => selected = tab);
      return;
    }

    final Widget screen = switch (target) {
      'contacts' => const LiveContactsScreen(),
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
      'profile' => const LiveProfileScreen(),
      _ => const LiveContactsScreen(),
    };

    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen));
  }
}

class _LiveBottomDock extends StatelessWidget {
  const _LiveBottomDock({required this.selected, required this.onSelect});

  final LiveHomeTab selected;
  final ValueChanged<LiveHomeTab> onSelect;

  static const items = [
    (LiveHomeTab.chats, 'Chats', Icons.chat_bubble_outline_rounded),
    (LiveHomeTab.status, 'Status', Icons.donut_large_rounded),
    (LiveHomeTab.communities, 'Communities', Icons.groups_2_outlined),
    (LiveHomeTab.channels, 'Channels', Icons.podcasts_rounded),
    (LiveHomeTab.calls, 'Calls', Icons.call_outlined),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        color: context.panel.withValues(alpha: .96),
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
                  color: active
                      ? SyncColors.sky.withValues(alpha: .12)
                      : Colors.transparent,
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
                                      color: SyncColors.sky.withValues(
                                        alpha: .38,
                                      ),
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

class _LiveMobileRail extends StatelessWidget {
  const _LiveMobileRail({required this.onSelected});

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
      backgroundColor: context.isDark
          ? SyncColors.spill900
          : SyncColors.slate900,
      shape: const RoundedRectangleBorder(),
      child: SafeArea(
        child: Column(
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: IconButton(
                onPressed: () => Navigator.pop(context),
                icon: const Icon(
                  Icons.close_rounded,
                  color: Colors.white70,
                  size: 19,
                ),
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
