import 'dart:async';

import 'package:flutter/material.dart';

import '../core/app_scope.dart';
import '../core/device_integration_service.dart';
import '../core/permission_manager.dart';
import '../core/public_app_config.dart';
import '../theme.dart';
import '../widgets/runtime_brand.dart';
import 'live_calls_screen.dart';
import 'live_channels_screen.dart';
import 'live_collection_screens.dart';
import 'live_full_profile_screen.dart';
import 'live_help_screens.dart';
import 'live_p0_contacts_screen.dart';
import 'live_p0_status_screen.dart';
import 'live_p1_communities_screen.dart';
import 'live_professional_chats_screen.dart';
import 'live_settings_hub_screen.dart';

enum LiveHomeTab { chats, status, communities, channels, calls }

class LiveMobileShell extends StatefulWidget {
  const LiveMobileShell({
    super.key,
    required this.onThemeChanged,
    required this.onLogout,
  });

  final ValueChanged<bool> onThemeChanged;
  final Future<void> Function(BuildContext context) onLogout;

  @override
  State<LiveMobileShell> createState() => _LiveMobileShellState();
}

class _LiveMobileShellState extends State<LiveMobileShell> {
  final scaffoldKey = GlobalKey<ScaffoldState>();
  LiveHomeTab selected = LiveHomeTab.chats;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_syncPreviouslyGrantedContacts());
    });
  }

  Future<void> _syncPreviouslyGrantedContacts() async {
    try {
      final granted = await AppPermissionManager.hasPermission(
        SyncPermission.contacts,
      );
      if (!mounted || !granted) return;
      unawaited(_syncAddressBookSilently());
    } on Object catch (failure) {
      debugPrint('SyncChat granted-contact bootstrap deferred: $failure');
    }
  }

  Future<void> _syncAddressBookSilently() async {
    try {
      await DeviceIntegrationService.syncAddressBook(context.services.contacts)
          .timeout(const Duration(seconds: 20));
    } on Object catch (failure) {
      debugPrint('SyncChat address-book auto-sync deferred: $failure');
    }
  }

  Future<void> _ensureContactsAndSync() async {
    final granted = await AppPermissionManager.ensureContacts(
      context,
      reason:
          'Contacts permission is needed to read your phone book and find people you know on SyncChat.',
    );
    if (!granted || !mounted) return;
    try {
      await DeviceIntegrationService.syncAddressBook(context.services.contacts)
          .timeout(const Duration(seconds: 20));
    } on Object catch (failure) {
      debugPrint('SyncChat contact sync failed: $failure');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: scaffoldKey,
      drawerScrimColor: Colors.black.withValues(alpha: .48),
      drawerEdgeDragWidth: 30,
      drawer: _FullPageDrawer(onSelected: _openTarget),
      body: Stack(
        children: [
          Positioned.fill(child: pageForTab()),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: _BottomDock(
              selected: selected,
              onSelect: (tab) => setState(() => selected = tab),
            ),
          ),
        ],
      ),
    );
  }

  Widget pageForTab() => switch (selected) {
        LiveHomeTab.chats => LiveProfessionalChatsScreen(
            onMenu: () => scaffoldKey.currentState?.openDrawer(),
            onOpenStatus: () => setState(() => selected = LiveHomeTab.status),
            onThemeChanged: widget.onThemeChanged,
            onLogout: widget.onLogout,
          ),
        LiveHomeTab.status => const LiveP0StatusScreen(),
        LiveHomeTab.communities => const LiveP1CommunitiesScreen(),
        LiveHomeTab.channels => const ChannelHubScreen(),
        LiveHomeTab.calls => const LiveCallsScreen(),
      };

  Future<void> _openTarget(String target) async {
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

    if (target == 'logout') {
      await widget.onLogout(context);
      return;
    }

    if (target == 'contacts') {
      await _ensureContactsAndSync();
      if (!mounted) return;
    }

    final Widget screen = switch (target) {
      'contacts' => const LiveP0ContactsScreen(),
      'archive' => const LiveInboxCollectionScreen(
          kind: LiveInboxCollectionKind.archive,
        ),
      'lists' => const LiveInboxCollectionScreen(
          kind: LiveInboxCollectionKind.lists,
        ),
      'media' => const LiveMediaScreen(),
      'feedback' => const LiveFeedbackScreen(),
      'settings' => LiveSettingsHubScreen(
          onThemeChanged: widget.onThemeChanged,
          onLogout: widget.onLogout,
        ),
      'profile' => const LiveFullProfileScreen(),
      _ => const LiveP0ContactsScreen(),
    };

    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => screen),
    );
  }
}

class _BottomDock extends StatelessWidget {
  const _BottomDock({required this.selected, required this.onSelect});

  final LiveHomeTab selected;
  final ValueChanged<LiveHomeTab> onSelect;

  static const items = [
    (LiveHomeTab.chats, 'Chats',
      Icons.chat_bubble_outline_rounded,
      Icons.chat_bubble_rounded,
    ),
    (LiveHomeTab.status, 'Status',
      Icons.donut_large_outlined,
      Icons.donut_large_rounded,
    ),
    (LiveHomeTab.communities, 'Communities',
      Icons.groups_outlined,
      Icons.groups_rounded,
    ),
    (LiveHomeTab.channels, 'Channels',
      Icons.podcasts_outlined,
      Icons.podcasts_rounded,
    ),
    (LiveHomeTab.calls, 'Calls',
      Icons.call_outlined,
      Icons.call_rounded,
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        height: 64,
        decoration: BoxDecoration(
          color: context.panel,
          border: Border(
            top: BorderSide(color: context.border.withValues(alpha: .72)),
          ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final item in items)
              Expanded(child: _item(context, item)),
          ],
        ),
      ),
    );
  }

  Widget _item(
    BuildContext context,
    (LiveHomeTab, String, IconData, IconData) item,
  ) {
    final active = selected == item.$1;
    final activeColor =
        context.isDark ? const Color(0xFF7DD3FC) : SyncColors.sky700;
    final inactiveColor = context.muted;

    return InkResponse(
      containedInkWell: true,
      highlightShape: BoxShape.rectangle,
      onTap: () => onSelect(item.$1),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(2, 7, 2, 5),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              active ? item.$4 : item.$3,
              size: 22,
              color: active ? activeColor : inactiveColor,
            ),
            const SizedBox(height: 3),
            Text(
              item.$2,
              maxLines: 1,
              overflow: TextOverflow.fade,
              softWrap: false,
              style: TextStyle(
                fontSize: item.$1 == LiveHomeTab.communities ? 9.5 : 10.5,
                height: 1.1,
                fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                color: active ? activeColor : inactiveColor,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FullPageDrawer extends StatelessWidget {
  const _FullPageDrawer({required this.onSelected});

  final ValueChanged<String> onSelected;

  // Keep the user's requested full-page drawer presentation, but mirror the
  // actual Web sidebar information architecture. Feature-specific engineering
  // tools remain reachable from their normal contextual surfaces, not as
  // App-only primary navigation entries.
  static const primary = [
    ('chats', 'Chats', Icons.chat_bubble_outline_rounded),
    ('calls', 'Calls', Icons.call_outlined),
    ('status', 'Status', Icons.donut_large_rounded),
    ('contacts', 'Contacts', Icons.group_outlined),
    ('communities', 'Communities', Icons.groups_2_outlined),
    ('channels', 'Channels', Icons.podcasts_rounded),
    ('archive', 'Archive', Icons.archive_outlined),
    ('lists', 'Lists', Icons.format_list_bulleted_rounded),
  ];

  static const more = [
    ('media', 'Media', Icons.image_outlined),
    ('feedback', 'Feedback', Icons.feedback_outlined),
  ];

  static const account = [
    ('settings', 'Settings', Icons.settings_outlined),
    ('profile', 'Profile', Icons.person_outline_rounded),
  ];

  @override
  Widget build(BuildContext context) {
    final appName = context.publicAppConfig.appName;
    return Drawer(
      width: MediaQuery.sizeOf(context).width,
      shape: const RoundedRectangleBorder(),
      backgroundColor:
          context.isDark ? SyncColors.spill900 : SyncColors.slate900,
      child: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 10, 10, 12),
              child: Row(
                children: [
                  const RuntimeBrandLogo(
                    size: 45,
                    borderRadius: 14,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          appName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 21,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const Text(
                          'Menu',
                          style: TextStyle(
                            color: Colors.white60,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(
                      Icons.close_rounded,
                      color: Colors.white70,
                      size: 25,
                    ),
                  ),
                ],
              ),
            ),
            const Divider(height: 1, color: Colors.white12),
            Expanded(
              child: ListView(
                padding: EdgeInsets.fromLTRB(
                  10,
                  10,
                  10,
                  MediaQuery.paddingOf(context).bottom + 10,
                ),
                children: [
                  ...primary.map((item) => row(item)),
                  section('More'),
                  ...more.map((item) => row(item)),
                  section('Account'),
                  ...account.map((item) => row(item)),
                  const SizedBox(height: 8),
                  ListTile(
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                    leading: const Icon(
                      Icons.logout_rounded,
                      color: Color(0xFFFF7B86),
                    ),
                    title: const Text(
                      'Log out',
                      style: TextStyle(
                        color: Color(0xFFFF7B86),
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    onTap: () => onSelected('logout'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget row((String, String, IconData) item) => ListTile(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
        ),
        leading: Icon(item.$3, color: Colors.white70),
        title: Text(
          item.$2,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 15,
            fontWeight: FontWeight.w800,
          ),
        ),
        trailing:
            const Icon(Icons.chevron_right_rounded, color: Colors.white38),
        onTap: () => onSelected(item.$1),
      );

  Widget section(String label) => Padding(
        padding: const EdgeInsets.fromLTRB(14, 18, 14, 5),
        child: Text(
          label.toUpperCase(),
          style: const TextStyle(
            color: Colors.white38,
            fontSize: 10,
            fontWeight: FontWeight.w900,
            letterSpacing: .8,
          ),
        ),
      );
}
