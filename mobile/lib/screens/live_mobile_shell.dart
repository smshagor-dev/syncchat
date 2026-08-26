import 'dart:async';

import 'package:flutter/material.dart';

import '../core/app_scope.dart';
import '../core/device_integration_service.dart';
import '../core/permission_manager.dart';
import '../theme.dart';
import 'live_calls_screen.dart';
import 'live_channels_screen.dart';
import 'live_chat_tools_screen.dart';
import 'live_collection_screens.dart';
import 'live_community_group_search_screen.dart';
import 'live_device_contacts_screen.dart';
import 'live_full_profile_screen.dart';
import 'live_groups_screen.dart';
import 'live_message_requests_screen.dart';
import 'live_p0_chats_screen.dart';
import 'live_p0_contacts_screen.dart';
import 'live_p0_status_screen.dart';
import 'live_p1_communities_screen.dart';
import 'live_p1_rich_attachments_screen.dart';
import 'live_p1_room_admin_screen.dart';
import 'live_p1_room_security_screen.dart';
import 'live_profile_edit_screen.dart';
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
      unawaited(_bootstrapPermissionsAndContacts());
    });
  }

  Future<void> _bootstrapPermissionsAndContacts() async {
    try {
      final statuses = await AppPermissionManager.requestInitialPermissions();
      if (!mounted) return;
      final contactsPermission = AppPermissionManager.permissionFor(SyncPermission.contacts);
      final contactsStatus = statuses[contactsPermission];
      if (contactsStatus != null && AppPermissionManager.isUsableStatus(contactsStatus)) {
        unawaited(_syncAddressBookSilently());
      }
    } on Object catch (failure) {
      debugPrint('SyncChat permission bootstrap deferred: $failure');
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
      reason: 'Contacts permission is needed to read your phone book and find people you know on SyncChat.',
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

  Widget pageForTab() => switch (selected) {
        LiveHomeTab.chats => LiveP0ChatsScreen(onMenu: () => scaffoldKey.currentState?.openDrawer()),
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
      'device-contacts' => const LiveDeviceContactsScreen(),
      'groups' => const LiveGroupsScreen(),
      'community-group' => const LiveCommunityGroupSearchScreen(),
      'room-admin' => const LiveRoomAdminHubScreen(),
      'room-security' => const LiveRoomSecurityHubScreen(),
      'rich-attachments' => const LiveRichAttachmentsHubScreen(),
      'requests' => const LiveMessageRequestsScreen(),
      'chat-tools' => const LiveChatToolsScreen(),
      'archive' => const LiveInboxCollectionScreen(kind: LiveInboxCollectionKind.archive),
      'lists' => const LiveInboxCollectionScreen(kind: LiveInboxCollectionKind.lists),
      'media' => const LiveMediaScreen(),
      'settings' => LiveSettingsHubScreen(onThemeChanged: widget.onThemeChanged, onLogout: widget.onLogout),
      'profile' => const LiveFullProfileScreen(),
      'edit-profile' => const LiveProfileEditScreen(),
      _ => const LiveP0ContactsScreen(),
    };

    if (!mounted) return;
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen));
  }
}

class _BottomDock extends StatelessWidget {
  const _BottomDock({required this.selected, required this.onSelect});

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
        boxShadow: const [BoxShadow(color: Color(0x500F172A), blurRadius: 30, offset: Offset(0, 12))],
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
                  color: active ? SyncColors.sky.withValues(alpha: .12) : Colors.transparent,
                  borderRadius: BorderRadius.circular(19),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 29,
                      height: 29,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: active ? SyncColors.sky : context.softPanel,
                        boxShadow: active
                            ? [BoxShadow(color: SyncColors.sky.withValues(alpha: .38), blurRadius: 12, offset: const Offset(0, 5))]
                            : null,
                      ),
                      child: Icon(item.$3, size: 17, color: active ? Colors.white : context.muted),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      item.$2,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: active ? SyncColors.sky : context.muted),
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

class _FullPageDrawer extends StatelessWidget {
  const _FullPageDrawer({required this.onSelected});

  final ValueChanged<String> onSelected;

  static const primary = [
    ('chats', 'Chats', Icons.chat_bubble_outline_rounded),
    ('requests', 'Message requests', Icons.mark_unread_chat_alt_outlined),
    ('chat-tools', 'Chat tools', Icons.tune_rounded),
    ('rich-attachments', 'Rich attachments', Icons.attach_file_rounded),
    ('room-security', 'Friend & room security', Icons.shield_outlined),
    ('calls', 'Calls', Icons.call_outlined),
    ('status', 'Status', Icons.donut_large_rounded),
    ('contacts', 'Contacts', Icons.group_outlined),
    ('device-contacts', 'People on SyncChat', Icons.contacts_rounded),
    ('groups', 'Groups', Icons.groups_rounded),
    ('community-group', 'New community group', Icons.group_add_outlined),
    ('room-admin', 'Group & channel admin', Icons.admin_panel_settings_outlined),
    ('communities', 'Communities', Icons.groups_2_outlined),
    ('channels', 'Channels', Icons.podcasts_rounded),
  ];

  static const library = [
    ('archive', 'Archive', Icons.archive_outlined),
    ('lists', 'Lists', Icons.format_list_bulleted_rounded),
    ('media', 'Media', Icons.image_outlined),
  ];

  static const account = [
    ('profile', 'Profile', Icons.person_outline_rounded),
    ('edit-profile', 'Edit profile', Icons.edit_outlined),
    ('settings', 'Settings', Icons.settings_outlined),
  ];

  @override
  Widget build(BuildContext context) {
    return Drawer(
      width: MediaQuery.sizeOf(context).width,
      shape: const RoundedRectangleBorder(),
      backgroundColor: context.isDark ? SyncColors.spill900 : SyncColors.slate900,
      child: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 10, 10, 12),
              child: Row(
                children: [
                  Container(
                    width: 45,
                    height: 45,
                    decoration: BoxDecoration(color: SyncColors.sky, borderRadius: BorderRadius.circular(14)),
                    child: const Icon(Icons.forum_rounded, color: Colors.white, size: 26),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('SyncChat', style: TextStyle(color: Colors.white, fontSize: 21, fontWeight: FontWeight.w900)),
                        Text('Menu', style: TextStyle(color: Colors.white60, fontSize: 12, fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                  IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close_rounded, color: Colors.white70, size: 25)),
                ],
              ),
            ),
            const Divider(height: 1, color: Colors.white12),
            Expanded(
              child: ListView(
                padding: EdgeInsets.fromLTRB(10, 10, 10, MediaQuery.paddingOf(context).bottom + 10),
                children: [
                  ...primary.map((item) => row(item)),
                  section('Library'),
                  ...library.map((item) => row(item)),
                  section('Account'),
                  ...account.map((item) => row(item)),
                  const SizedBox(height: 8),
                  ListTile(
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    leading: const Icon(Icons.logout_rounded, color: Color(0xFFFF7B86)),
                    title: const Text('Log out', style: TextStyle(color: Color(0xFFFF7B86), fontWeight: FontWeight.w900)),
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
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        leading: Icon(item.$3, color: Colors.white70),
        title: Text(item.$2, style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w800)),
        trailing: const Icon(Icons.chevron_right_rounded, color: Colors.white38),
        onTap: () => onSelected(item.$1),
      );

  Widget section(String label) => Padding(
        padding: const EdgeInsets.fromLTRB(14, 18, 14, 5),
        child: Text(
          label.toUpperCase(),
          style: const TextStyle(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: .8),
        ),
      );
}
