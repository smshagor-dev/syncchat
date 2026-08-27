import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../core/public_app_config.dart';
import '../core/realtime_client.dart';
import '../theme.dart';
import '../widgets.dart';
import '../widgets/runtime_brand.dart';
import 'live_chat_room_screen.dart';
import 'live_groups_screen.dart';
import 'live_p0_contacts_screen.dart';
import 'live_settings_hub_screen.dart';
import 'live_starred_messages_screen.dart';

const _eventPrefix = '__event__::';
const _pollPrefix = '__poll__::';

class LiveP0ChatsScreen extends StatefulWidget {
  const LiveP0ChatsScreen({
    super.key,
    required this.onMenu,
    required this.onOpenStatus,
    required this.onThemeChanged,
    required this.onLogout,
  });

  final VoidCallback onMenu;
  final VoidCallback onOpenStatus;
  final ValueChanged<bool> onThemeChanged;
  final Future<void> Function(BuildContext context) onLogout;

  @override
  State<LiveP0ChatsScreen> createState() => _LiveP0ChatsScreenState();
}

class _LiveP0ChatsScreenState extends State<LiveP0ChatsScreen> {
  final search = TextEditingController();
  final searchFocus = FocusNode();

  List<Map<String, dynamic>> inboxes = const [];
  List<Map<String, dynamic>> statuses = const [];
  List<Map<String, dynamic>> contactLabels = const [];
  Map<String, List<String>> contactLabelsByRoom = const {};
  Map<String, dynamic> settings = const {};
  Map<String, dynamic>? currentUser;

  StreamSubscription<RealtimeConnectionState>? connectionSubscription;
  Timer? apiFallbackTimer;

  bool loading = true;
  bool statusLoaded = false;
  String? error;
  String filter = 'all';
  String labelFilter = '';
  String? busyRoomId;
  Set<String>? selectedRoomIds;

  String get currentUserId => currentUser?['_id']?.toString() ?? '';
  bool get selectModeActive => selectedRoomIds != null;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _start());
  }

  @override
  void dispose() {
    final realtime = context.maybeServices?.realtime;
    realtime?.off('inbox/find', _onInboxUpdate);
    realtime?.off('inbox/preferences', _onInboxUpdate);
    realtime?.off('inbox/delete', _onInboxDelete);
    realtime?.off('inbox/chat-lock', _onLockUpdate);
    realtime?.off('status/new', _onStatusNew);
    realtime?.off('status/update', _onStatusUpdate);
    connectionSubscription?.cancel();
    apiFallbackTimer?.cancel();
    search.dispose();
    searchFocus.dispose();
    super.dispose();
  }

  Future<void> _start() async {
    final services = context.services;
    final realtime = services.realtime;

    realtime.on('inbox/find', _onInboxUpdate);
    realtime.on('inbox/preferences', _onInboxUpdate);
    realtime.on('inbox/delete', _onInboxDelete);
    realtime.on('inbox/chat-lock', _onLockUpdate);
    realtime.on('status/new', _onStatusNew);
    realtime.on('status/update', _onStatusUpdate);

    final cachedUser = await services.chatCache.readCurrentUser();
    final cachedInboxes = await services.chatCache.readInboxes();
    if (mounted) {
      setState(() {
        if (cachedUser.isNotEmpty) currentUser = cachedUser;
        if (cachedInboxes.isNotEmpty) inboxes = cachedInboxes;
        if (cachedInboxes.isNotEmpty) loading = false;
      });
    }

    connectionSubscription = realtime.states.listen((state) {
      if (state == RealtimeConnectionState.connected) {
        apiFallbackTimer?.cancel();
        unawaited(_load());
      } else if (state == RealtimeConnectionState.disconnected) {
        _scheduleApiFallback();
      }
    });

    if (realtime.state == RealtimeConnectionState.disconnected) {
      unawaited(realtime.connect());
      _scheduleApiFallback();
    }

    unawaited(_load());
  }

  void _scheduleApiFallback() {
    apiFallbackTimer?.cancel();
    apiFallbackTimer = Timer(const Duration(milliseconds: 500), () {
      if (!mounted) return;
      if (!context.services.realtime.isConnected) unawaited(_load());
    });
  }

  Future<void> _load() async {
    if (mounted) setState(() => error = null);

    try {
      final result = await Future.wait<dynamic>([
        context.services.chat.currentUser(refresh: true),
        context.services.inbox.list(),
      ]);

      if (!mounted) return;
      setState(() {
        currentUser = Map<String, dynamic>.from(result[0] as Map);
        inboxes = (result[1] as List)
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList(growable: false);
        loading = false;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        loading = false;
        error = _errorText(failure);
      });
    }

    unawaited(_loadPageMeta());
  }

  Future<void> _loadPageMeta() async {
    try {
      final result = await Future.wait<dynamic>([
        context.services.statuses.list(),
        context.services.contacts.labels(),
        context.services.contacts.list(),
        context.services.settings.get(),
      ]);

      if (!mounted) return;

      final contacts = (result[2] as List)
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList(growable: false);
      final labelsByRoom = <String, List<String>>{};

      for (final contact in contacts) {
        final roomId = contact['roomId']?.toString() ?? '';
        if (roomId.isEmpty) continue;
        final labels = contact['labels'];
        labelsByRoom[roomId] = labels is List
            ? labels.map((item) => item.toString()).toList(growable: false)
            : const [];
      }

      setState(() {
        statuses = (result[0] as List)
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList(growable: false);
        contactLabels = (result[1] as List)
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList(growable: false);
        contactLabelsByRoom = labelsByRoom;
        settings = result[3] is Map
            ? Map<String, dynamic>.from(result[3] as Map)
            : const {};
        statusLoaded = true;
      });
    } on Object {
      if (!mounted) return;
      setState(() => statusLoaded = true);
    }
  }

  void _onInboxUpdate(dynamic data) {
    if (!mounted || data is! Map) return;
    final next = Map<String, dynamic>.from(data);
    final roomId = next['roomId']?.toString() ?? '';
    if (roomId.isEmpty) return;

    setState(() {
      final copy = [...inboxes];
      final index = copy.indexWhere(
        (item) => item['roomId']?.toString() == roomId,
      );
      if (index >= 0) {
        copy[index] = {...copy[index], ...next};
      } else {
        copy.insert(0, next);
      }
      inboxes = copy;
    });
  }

  void _onInboxDelete(dynamic data) {
    if (!mounted) return;
    final ids = data is List
        ? data.map((item) => item.toString()).toSet()
        : <String>{data?.toString() ?? ''};
    ids.remove('');
    if (ids.isEmpty) return;

    setState(() {
      inboxes = inboxes
          .where((item) => !ids.contains(item['roomId']?.toString() ?? ''))
          .toList(growable: false);
      selectedRoomIds?.removeAll(ids);
    });
  }

  void _onLockUpdate(dynamic data) {
    if (!mounted || data is! Map) return;
    final patch = Map<String, dynamic>.from(data);
    final roomId = patch['roomId']?.toString() ?? '';
    if (roomId.isEmpty) return;

    setState(() {
      inboxes = inboxes
          .map((item) => item['roomId']?.toString() == roomId
              ? <String, dynamic>{...item, ...patch}
              : item)
          .toList(growable: false);
    });
  }

  void _onStatusNew(dynamic data) {
    if (!mounted || data is! Map) return;
    final next = Map<String, dynamic>.from(data);
    final id = next['_id']?.toString() ?? '';
    if (id.isEmpty) return;

    setState(() {
      if (statuses.any((item) => item['_id']?.toString() == id)) return;
      statuses = [next, ...statuses];
      statusLoaded = true;
    });
  }

  void _onStatusUpdate(dynamic data) {
    if (!mounted || data is! Map) return;
    final payload = Map<String, dynamic>.from(data);
    final id = payload['statusId']?.toString() ?? payload['_id']?.toString() ?? '';
    if (id.isEmpty) return;

    setState(() {
      if (payload['type']?.toString() == 'delete') {
        statuses = statuses
            .where((item) => item['_id']?.toString() != id)
            .toList(growable: false);
        return;
      }
      statuses = statuses
          .map((item) => item['_id']?.toString() == id
              ? <String, dynamic>{...item, ...payload}
              : item)
          .toList(growable: false);
    });
  }

  List<Map<String, dynamic>> get visibleInboxes {
    final query = search.text.trim().toLowerCase();
    final rows = inboxes.where((inbox) {
      if (_isDeletedForMe(inbox)) return false;
      if (_isHidden(inbox)) return false;
      if (_isArchived(inbox)) return false;

      final matchesFilter = switch (filter) {
        'unread' => _hasUnreadForMe(inbox),
        'favourite' => _isFavourite(inbox),
        'group' => inbox['roomType']?.toString() == 'group',
        _ => true,
      };
      if (!matchesFilter) return false;

      if (labelFilter.isNotEmpty) {
        if (inbox['roomType']?.toString() != 'private') return false;
        final labels = contactLabelsByRoom[inbox['roomId']?.toString() ?? ''] ?? const [];
        if (!labels.contains(labelFilter)) return false;
      }

      if (query.isEmpty) return true;
      return _searchBlob(inbox).contains(query);
    }).toList(growable: false);

    rows.sort((left, right) {
      final leftPinned = _isPinned(left);
      final rightPinned = _isPinned(right);
      if (leftPinned != rightPinned) return leftPinned ? -1 : 1;
      return _contentTime(right).compareTo(_contentTime(left));
    });

    return rows;
  }

  Iterable<Map<String, dynamic>> get _countBase =>
      inboxes.where((inbox) => !_isDeletedForMe(inbox));

  int get unreadCount => _countBase.where(_hasUnreadForMe).length;

  int get favouriteUnreadCount =>
      _countBase.where((inbox) => _isFavourite(inbox) && _hasUnreadForMe(inbox)).length;

  int get groupUnreadCount => _countBase
      .where((inbox) => inbox['roomType']?.toString() == 'group' && _hasUnreadForMe(inbox))
      .length;

  List<_StatusGroup> get statusGroups {
    final map = <String, _StatusGroup>{};

    for (final status in statuses) {
      final profile = _asMap(status['profile']);
      final userId = status['userId']?.toString() ?? '';
      if (profile.isEmpty || userId.isEmpty) continue;
      final current = map[userId];
      if (current == null) {
        map[userId] = _StatusGroup(
          userId: userId,
          profile: profile,
          items: [status],
        );
      } else {
        current.items.add(status);
      }
    }

    final groups = map.values.toList();
    for (final group in groups) {
      group.items.sort((a, b) => _statusTime(b).compareTo(_statusTime(a)));
    }
    groups.sort((a, b) {
      final aTime = a.items.isEmpty ? DateTime.fromMillisecondsSinceEpoch(0) : _statusTime(a.items.first);
      final bTime = b.items.isEmpty ? DateTime.fromMillisecondsSinceEpoch(0) : _statusTime(b.items.first);
      return bTime.compareTo(aTime);
    });
    return groups;
  }

  @override
  Widget build(BuildContext context) {
    final headerBackground = context.isDark ? SyncColors.spill800 : SyncColors.slate100;

    return Scaffold(
      backgroundColor: context.isDark ? SyncColors.spill950 : Colors.white,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Container(
              height: 64,
              padding: const EdgeInsets.only(left: 8, right: 4),
              color: headerBackground,
              child: selectModeActive ? _buildSelectionHeader() : _buildNormalHeader(),
            ),
            if (!selectModeActive) _buildSearchAndFilters(),
            Divider(height: 1, color: context.border),
            Expanded(child: _buildBody()),
          ],
        ),
      ),
    );
  }

  Widget _buildNormalHeader() {
    return Row(
      children: [
        IconButton(
          tooltip: 'Menu',
          onPressed: widget.onMenu,
          icon: Icon(Icons.menu_rounded, size: 22, color: context.muted),
        ),
        const SizedBox(width: 1),
        const RuntimeBrandLogo(
          size: 32,
          borderRadius: 8,
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            context.publicAppConfig.appName,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
          ),
        ),
        IconButton(
          tooltip: 'Refresh',
          onPressed: _load,
          icon: Icon(Icons.refresh_rounded, size: 21, color: context.muted),
        ),
        IconButton(
          tooltip: 'Contacts',
          onPressed: () => _openUtility(const LiveP0ContactsScreen()),
          icon: Icon(Icons.maps_ugc_outlined, size: 21, color: context.muted),
        ),
        PopupMenuButton<String>(
          tooltip: 'More',
          icon: Icon(Icons.more_vert_rounded, size: 21, color: context.muted),
          onSelected: (value) => unawaited(_handleTopMenu(value)),
          itemBuilder: (_) => const <PopupMenuEntry<String>>[
            PopupMenuItem(
              value: 'new-group',
              child: _MenuRow(icon: Icons.group_outlined, label: 'New group'),
            ),
            PopupMenuItem(
              value: 'starred',
              child: _MenuRow(icon: Icons.star_border_rounded, label: 'Starred messages'),
            ),
            PopupMenuItem(
              value: 'select-chats',
              child: _MenuRow(icon: Icons.check_box_outlined, label: 'Select chats'),
            ),
            PopupMenuItem(
              value: 'mark-read',
              child: _MenuRow(icon: Icons.description_outlined, label: 'Mark all as read'),
            ),
            PopupMenuDivider(),
            PopupMenuItem(
              value: 'app-lock',
              child: _MenuRow(icon: Icons.lock_outline_rounded, label: 'App lock'),
            ),
            PopupMenuItem(
              value: 'logout',
              child: _MenuRow(icon: Icons.logout_rounded, label: 'Log out'),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildSelectionHeader() {
    final count = selectedRoomIds?.length ?? 0;
    return Row(
      children: [
        IconButton(
          tooltip: 'Back',
          onPressed: () => setState(() => selectedRoomIds = null),
          icon: Icon(Icons.arrow_back_rounded, size: 20, color: context.muted),
        ),
        const SizedBox(width: 3),
        Expanded(
          child: Text(
            '$count chat${count > 1 ? 's' : ''} selected',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
          ),
        ),
        PopupMenuButton<String>(
          tooltip: 'Selected chat actions',
          icon: Icon(Icons.more_vert_rounded, size: 20, color: context.muted),
          onSelected: (value) => unawaited(_runBulkAction(value)),
          itemBuilder: (_) => const [
            PopupMenuItem(
              value: 'mark-unread',
              child: _MenuRow(icon: Icons.mark_chat_unread_outlined, label: 'Mark as unread'),
            ),
            PopupMenuItem(
              value: 'mute',
              child: _MenuRow(icon: Icons.notifications_off_outlined, label: 'Mute notification'),
            ),
            PopupMenuItem(
              value: 'clear',
              child: _MenuRow(icon: Icons.cleaning_services_outlined, label: 'Clear selected chat'),
            ),
            PopupMenuItem(
              value: 'delete',
              child: _MenuRow(
                icon: Icons.delete_outline_rounded,
                label: 'Delete selected chat',
                danger: true,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildSearchAndFilters() {
    final inactiveText = context.isDark ? const Color(0xFFE2E8F0) : SyncColors.slate700;
    final inactiveBackground = context.isDark ? SyncColors.spill800 : SyncColors.slate100;

    final filters = <(String, String)>[
      ('all', 'All'),
      ('unread', 'Unread ($unreadCount)'),
      ('favourite', 'Favourite ($favouriteUnreadCount)'),
      ('group', 'Group ($groupUnreadCount)'),
    ];

    return Container(
      width: double.infinity,
      color: context.isDark ? SyncColors.spill900 : Colors.white,
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      child: Column(
        children: [
          SizedBox(
            height: 40,
            child: TextField(
              controller: search,
              focusNode: searchFocus,
              onChanged: (_) => setState(() {}),
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: 'Search chats...',
                hintStyle: TextStyle(
                  color: context.isDark ? SyncColors.spill300 : const Color(0xFF94A3B8),
                  fontSize: 14,
                ),
                prefixIcon: Icon(Icons.search_rounded, size: 18, color: context.muted),
                prefixIconConstraints: const BoxConstraints(minWidth: 42),
                suffixIcon: search.text.isEmpty
                    ? null
                    : IconButton(
                        tooltip: 'Clear search',
                        onPressed: () {
                          search.clear();
                          setState(() {
                            filter = 'all';
                            labelFilter = '';
                          });
                        },
                        icon: const Icon(Icons.close_rounded, size: 16),
                      ),
                filled: true,
                fillColor: inactiveBackground,
                contentPadding: const EdgeInsets.symmetric(horizontal: 12),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: BorderSide(color: context.border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: BorderSide(color: context.border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: BorderSide(color: context.border),
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 31,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: filters.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (_, index) {
                final item = filters[index];
                final active = filter == item.$1;
                return InkWell(
                  borderRadius: BorderRadius.circular(18),
                  onTap: () => setState(() => filter = item.$1),
                  child: Container(
                    alignment: Alignment.center,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    decoration: BoxDecoration(
                      color: active ? SyncColors.sky600 : inactiveBackground,
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(
                        color: active ? SyncColors.sky600 : context.border,
                      ),
                    ),
                    child: Text(
                      item.$2,
                      style: TextStyle(
                        color: active ? Colors.white : inactiveText,
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
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

  Widget _buildBody() {
    if (loading && inboxes.isEmpty) {
      return ColoredBox(
        color: context.isDark ? SyncColors.spill950 : Colors.white,
        child: Center(
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
              const SizedBox(width: 8),
              Text('Loading', style: TextStyle(color: context.muted)),
            ],
          ),
        ),
      );
    }

    if (error != null && inboxes.isEmpty) {
      return _ErrorState(message: error!, onRetry: _load);
    }

    final items = visibleInboxes;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.only(bottom: 116 + MediaQuery.paddingOf(context).bottom),
        children: [
          _buildStatusRail(),
          _buildLabels(),
          ...items.map(_buildTile),
        ],
      ),
    );
  }

  Widget _buildStatusRail() {
    final groups = statusGroups;
    _StatusGroup? mine;
    final friends = <_StatusGroup>[];

    for (final group in groups) {
      if (group.userId == currentUserId) {
        mine = group;
      } else {
        friends.add(group);
      }
    }

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      decoration: BoxDecoration(
        color: context.isDark ? SyncColors.spill950 : Colors.white,
        border: Border(bottom: BorderSide(color: context.border)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Status',
                  style: TextStyle(
                    color: context.isDark ? const Color(0xFFF1F5F9) : SyncColors.slate700,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              TextButton(
                onPressed: widget.onOpenStatus,
                style: TextButton.styleFrom(
                  padding: EdgeInsets.zero,
                  minimumSize: const Size(0, 28),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: const Text(
                  'Open status',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          SizedBox(
            height: 79,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                _statusItem(
                  name: 'Create',
                  imageUrl: currentUser?['avatar']?.toString(),
                  create: true,
                  onTap: widget.onOpenStatus,
                ),
                if (mine != null) ...[
                  const SizedBox(width: 3),
                  _statusItem(
                    name: 'My status',
                    imageUrl: mine.profile['avatar']?.toString(),
                    onTap: widget.onOpenStatus,
                  ),
                ],
                ...friends.expand(
                  (group) => [
                    const SizedBox(width: 3),
                    _statusItem(
                      name: _statusName(group.profile),
                      imageUrl: group.profile['avatar']?.toString(),
                      onTap: widget.onOpenStatus,
                    ),
                  ],
                ),
                if (!statusLoaded)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(7, 4, 0, 0),
                    child: SizedBox(
                      width: 56,
                      height: 56,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          color: context.softPanel,
                          shape: BoxShape.circle,
                        ),
                        child: const Padding(
                          padding: EdgeInsets.all(18),
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _statusItem({
    required String name,
    String? imageUrl,
    required VoidCallback onTap,
    bool create = false,
  }) {
    return SizedBox(
      width: 74,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  padding: const EdgeInsets.all(2),
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(
                      begin: Alignment.bottomLeft,
                      end: Alignment.topRight,
                      colors: [
                        Color(0xFF0EA5E9),
                        Color(0xFF22D3EE),
                        Color(0xFF34D399),
                      ],
                    ),
                  ),
                  child: Container(
                    padding: const EdgeInsets.all(2),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: context.isDark ? SyncColors.spill900 : Colors.white,
                    ),
                    child: SyncAvatar(
                      name: name,
                      imageUrl: imageUrl,
                      radius: 25,
                    ),
                  ),
                ),
                if (create)
                  Positioned(
                    right: -1,
                    bottom: -1,
                    child: Container(
                      width: 20,
                      height: 20,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: SyncColors.sky600,
                        border: Border.all(
                          width: 2,
                          color: context.isDark ? SyncColors.spill900 : Colors.white,
                        ),
                      ),
                      child: const Icon(Icons.add_rounded, color: Colors.white, size: 13),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLabels() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      decoration: BoxDecoration(
        color: context.isDark ? SyncColors.spill950 : Colors.white,
        border: Border(bottom: BorderSide(color: context.border)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Labels',
                  style: TextStyle(
                    color: context.isDark ? const Color(0xFFF1F5F9) : SyncColors.slate700,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              if (labelFilter.isNotEmpty)
                TextButton(
                  onPressed: () => setState(() => labelFilter = ''),
                  style: TextButton.styleFrom(
                    padding: EdgeInsets.zero,
                    minimumSize: const Size(0, 28),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: const Text(
                    'Clear',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 6),
          if (contactLabels.isEmpty)
            Text(
              'No labels yet',
              style: TextStyle(fontSize: 12, color: context.muted),
            )
          else
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: contactLabels.map((label) {
                final id = label['_id']?.toString() ?? '';
                final active = labelFilter == id;
                final tone = _hexColor(label['color']?.toString() ?? '') ?? SyncColors.sky;
                return InkWell(
                  borderRadius: BorderRadius.circular(18),
                  onTap: id.isEmpty
                      ? null
                      : () => setState(() => labelFilter = active ? '' : id),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                    decoration: BoxDecoration(
                      color: active ? SyncColors.sky600 : Colors.transparent,
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: active ? SyncColors.sky600 : tone),
                    ),
                    child: Text(
                      label['name']?.toString() ?? '',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: active ? Colors.white : tone,
                      ),
                    ),
                  ),
                );
              }).toList(growable: false),
            ),
        ],
      ),
    );
  }

  Widget _buildTile(Map<String, dynamic> inbox) {
    final roomId = inbox['roomId']?.toString() ?? '';
    final name = _inboxName(inbox);
    final profile = _privateProfile(inbox);
    final hasUnread = _showUnreadBadge(inbox);
    final unreadCount = (inbox['unreadMessage'] as num?)?.toInt() ?? 0;
    final unreadBadgeCount = unreadCount > 0 ? unreadCount : 1;
    final selected = selectedRoomIds?.contains(roomId) == true;
    final lockedChat = _isChatLocked(inbox);
    final lockedPrivateGroup = _isPrivateLockedGroup(inbox);
    final lockedPreview = lockedChat || lockedPrivateGroup;
    final callMeta = _callMeta(_contentText(inbox));
    final channel = _hasChannel(inbox);
    final groupPrivate = _isGroupPrivate(inbox);
    final busy = busyRoomId == roomId;

    return Material(
      color: selected
          ? (context.isDark ? SyncColors.spill700 : SyncColors.slate200)
          : (context.isDark ? SyncColors.spill950 : Colors.white),
      child: InkWell(
        onTap: busy
            ? null
            : () {
                if (selectModeActive) {
                  _toggleSelection(roomId);
                  return;
                }
                unawaited(_openInbox(inbox));
              },
        onLongPress: busy || selectModeActive ? null : () => _showActions(inbox),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: context.border)),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              SyncAvatar(
                name: name,
                imageUrl: _inboxAvatar(inbox),
                radius: 28,
                online: inbox['roomType']?.toString() == 'private' && _isOnline(profile),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Row(
                            children: [
                              if (channel)
                                const Padding(
                                  padding: EdgeInsets.only(right: 4),
                                  child: Icon(
                                    Icons.podcasts_rounded,
                                    size: 14,
                                    color: SyncColors.sky600,
                                  ),
                                ),
                              if (inbox['roomType']?.toString() == 'group' && groupPrivate)
                                const Padding(
                                  padding: EdgeInsets.only(right: 4),
                                  child: Icon(
                                    Icons.lock_outline_rounded,
                                    size: 14,
                                    color: Color(0xFFD97706),
                                  ),
                                ),
                              if (lockedChat)
                                const Padding(
                                  padding: EdgeInsets.only(right: 4),
                                  child: Icon(
                                    Icons.lock_outline_rounded,
                                    size: 14,
                                    color: Color(0xFFD97706),
                                  ),
                                ),
                              Expanded(
                                child: Text(
                                  name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontSize: 17,
                                    fontWeight: hasUnread ? FontWeight.w600 : FontWeight.w500,
                                    color: context.isDark ? const Color(0xFFF1F5F9) : SyncColors.slate900,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        _buildTileMeta(
                          inbox,
                          callMeta: callMeta,
                          selected: selected,
                          busy: busy,
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Expanded(
                          child: Row(
                            children: [
                              if (channel && !lockedPreview)
                                const Padding(
                                  padding: EdgeInsets.only(right: 5),
                                  child: Text(
                                    'CHANNEL',
                                    style: TextStyle(
                                      color: SyncColors.sky600,
                                      fontSize: 11,
                                      fontWeight: FontWeight.w600,
                                      letterSpacing: 1.7,
                                    ),
                                  ),
                                ),
                              if (_isOutgoing(inbox)) ...[
                                _deliveryIcon(inbox),
                                const SizedBox(width: 3),
                              ],
                              if (inbox['roomType']?.toString() == 'group' && !lockedPreview) ...[
                                Flexible(
                                  flex: 0,
                                  child: Text(
                                    '${_senderName(inbox)}: ',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      color: context.isDark ? SyncColors.spill300 : SyncColors.slate600,
                                      fontSize: 14,
                                    ),
                                  ),
                                ),
                              ],
                              if (inbox['roomType']?.toString() == 'group' && groupPrivate)
                                const Padding(
                                  padding: EdgeInsets.only(right: 4),
                                  child: Icon(
                                    Icons.lock_outline_rounded,
                                    size: 14,
                                    color: Color(0xFFD97706),
                                  ),
                                ),
                              ..._filePreviewWidgets(inbox),
                              Expanded(child: _previewWidget(inbox)),
                            ],
                          ),
                        ),
                        if (hasUnread) ...[
                          const SizedBox(width: 8),
                          Container(
                            constraints: const BoxConstraints(minWidth: 20, minHeight: 20),
                            padding: const EdgeInsets.symmetric(horizontal: 5),
                            alignment: Alignment.center,
                            decoration: const BoxDecoration(
                              borderRadius: BorderRadius.all(Radius.circular(12)),
                              gradient: LinearGradient(
                                colors: [SyncColors.sky, SyncColors.cyan, SyncColors.teal],
                              ),
                            ),
                            child: Text(
                              '$unreadBadgeCount',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTileMeta(
    Map<String, dynamic> inbox, {
    required _CallMeta? callMeta,
    required bool selected,
    required bool busy,
  }) {
    final hasUnread = _showUnreadBadge(inbox);

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (callMeta != null)
          Padding(
            padding: const EdgeInsets.only(right: 3),
            child: Icon(callMeta.icon, size: 14, color: callMeta.color),
          ),
        if (_isPinned(inbox))
          const Padding(
            padding: EdgeInsets.only(right: 3),
            child: Icon(Icons.push_pin_outlined, size: 14, color: SyncColors.sky600),
          ),
        if (_isMuted(inbox))
          Padding(
            padding: const EdgeInsets.only(right: 3),
            child: Icon(Icons.notifications_off_outlined, size: 14, color: context.muted),
          ),
        Text(
          _fromNow(_contentTime(inbox)),
          style: TextStyle(
            color: context.muted,
            fontSize: 12,
            fontWeight: hasUnread ? FontWeight.w600 : FontWeight.w400,
          ),
        ),
        if (busy)
          const Padding(
            padding: EdgeInsets.only(left: 5),
            child: SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          )
        else if (selectModeActive)
          Padding(
            padding: const EdgeInsets.only(left: 5),
            child: Container(
              width: 20,
              height: 20,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: selected ? SyncColors.sky600 : Colors.transparent,
                border: Border.all(
                  color: selected ? SyncColors.sky600 : context.muted,
                ),
              ),
              child: selected
                  ? const Icon(Icons.check_rounded, size: 12, color: Colors.white)
                  : null,
            ),
          )
        else
          SizedBox(
            width: 28,
            height: 28,
            child: PopupMenuButton<String>(
              tooltip: 'Chat actions',
              padding: EdgeInsets.zero,
              iconSize: 16,
              icon: Icon(Icons.more_vert_rounded, size: 16, color: context.muted),
              onSelected: (value) => unawaited(_runRowMenuAction(inbox, value)),
              itemBuilder: (_) => _rowMenuItems(inbox),
            ),
          ),
      ],
    );
  }

  List<PopupMenuEntry<String>> _rowMenuItems(Map<String, dynamic> inbox) {
    final isPrivate = inbox['roomType']?.toString() == 'private';
    final friendId = isPrivate ? _friendId(inbox) : '';
    final archived = _isArchived(inbox);
    final muted = _isMuted(inbox);
    final pinned = _isPinned(inbox);
    final unread = _isManuallyUnread(inbox);
    final favourite = _isFavourite(inbox);
    final listed = _isListed(inbox);
    final hidden = _isHidden(inbox);
    final locked = _isChatLocked(inbox);
    final shared = locked && inbox['chatLockScope']?.toString() == 'both';
    final sharedOwner = shared && inbox['chatLockOwnerId']?.toString() == currentUserId;
    final blocked = friendId.isNotEmpty && _isBlocked(friendId);

    PopupMenuItem<String> item(
      String value,
      IconData icon,
      String label, {
      bool danger = false,
      bool enabled = true,
    }) {
      return PopupMenuItem<String>(
        value: value,
        enabled: enabled,
        child: _MenuRow(icon: icon, label: label, danger: danger),
      );
    }

    return [
      item('archive', archived ? Icons.unarchive_outlined : Icons.archive_outlined,
          archived ? 'Unarchive chat' : 'Archive chat'),
      item('mute', muted ? Icons.notifications_outlined : Icons.notifications_off_outlined,
          muted ? 'Unmute notification' : 'Mute notification'),
      item('pin', Icons.push_pin_outlined, pinned ? 'Unpin chat' : 'Pin chat'),
      item('unread', Icons.mark_chat_unread_outlined,
          unread ? 'Mark as read' : 'Mark as unread'),
      item('favourite', Icons.star_border_rounded,
          favourite ? 'Remove from favourite' : 'Add to favourite'),
      item('list', Icons.format_list_bulleted_rounded,
          listed ? 'Remove from list' : 'Add to list'),
      item('hide', hidden ? Icons.visibility_outlined : Icons.visibility_off_outlined,
          hidden ? 'Unhide chat' : 'Hide chat'),
      if (isPrivate && friendId.isNotEmpty)
        item('block', Icons.block_rounded, blocked ? 'Unblock' : 'Block', danger: true),
      if (isPrivate)
        item(
          'chat-lock',
          Icons.lock_outline_rounded,
          !locked
              ? 'Lock chat'
              : shared
                  ? sharedOwner
                      ? 'Remove shared lock'
                      : 'Shared lock active'
                  : 'Remove lock',
          enabled: !(shared && !sharedOwner),
        ),
      if (isPrivate && locked && (!shared || sharedOwner))
        item(
          'change-lock',
          Icons.key_rounded,
          shared ? 'Change shared lock password' : 'Change lock password',
        ),
      item('clear', Icons.cleaning_services_outlined, 'Clear chat', danger: true),
      item('delete', Icons.delete_outline_rounded, 'Delete chat', danger: true),
    ];
  }

  Future<void> _handleTopMenu(String value) async {
    switch (value) {
      case 'new-group':
        await _openUtility(const LiveCreateGroupScreen());
        break;
      case 'starred':
        await _openUtility(const LiveStarredMessagesScreen());
        break;
      case 'select-chats':
        if (mounted) setState(() => selectedRoomIds = <String>{});
        break;
      case 'mark-read':
        await _markAllRead();
        break;
      case 'app-lock':
        await _openUtility(
          LiveSettingsHubScreen(
            onThemeChanged: widget.onThemeChanged,
            onLogout: widget.onLogout,
          ),
        );
        break;
      case 'logout':
        await widget.onLogout(context);
        break;
    }
  }

  Future<void> _runBulkAction(String action) async {
    final selected = selectedRoomIds?.toList(growable: false) ?? const [];
    if (selected.isEmpty) return;

    final rows = inboxes
        .where((inbox) => selected.contains(inbox['roomId']?.toString() ?? ''))
        .toList(growable: false);

    for (final inbox in rows) {
      final roomId = inbox['roomId']?.toString() ?? '';
      if (roomId.isEmpty) continue;
      try {
        switch (action) {
          case 'mark-unread':
            await context.services.inbox.setPreference(roomId, 'markUnread', true);
            break;
          case 'mute':
            await context.services.inbox.setPreference(roomId, 'mute', true);
            break;
          case 'clear':
            await context.services.inbox.clearRoom(roomId);
            break;
          case 'delete':
            await context.services.inbox.deleteRoom(roomId);
            break;
        }
      } on Object {
        // Web bulk actions are all-settled; one failure does not stop the rest.
      }
    }

    if (!mounted) return;
    setState(() => selectedRoomIds = null);
    await _load();
  }

  void _toggleSelection(String roomId) {
    if (selectedRoomIds == null || roomId.isEmpty) return;
    setState(() {
      final next = <String>{...selectedRoomIds!};
      if (!next.add(roomId)) next.remove(roomId);
      selectedRoomIds = next;
    });
  }

  Future<void> _runRowMenuAction(Map<String, dynamic> inbox, String action) async {
    final roomId = inbox['roomId']?.toString() ?? '';
    if (roomId.isEmpty) return;

    switch (action) {
      case 'archive':
        await _preference(inbox, 'archive', !_isArchived(inbox));
        break;
      case 'mute':
        await _preference(inbox, 'mute', !_isMuted(inbox));
        break;
      case 'pin':
        await _preference(inbox, 'pin', !_isPinned(inbox));
        break;
      case 'unread':
        await _preference(inbox, 'markUnread', !_isManuallyUnread(inbox));
        break;
      case 'favourite':
        await _preference(inbox, 'favourite', !_isFavourite(inbox));
        break;
      case 'list':
        await _preference(inbox, 'list', !_isListed(inbox));
        break;
      case 'hide':
        await _preference(inbox, 'hide', !_isHidden(inbox));
        break;
      case 'block':
        final friendId = _friendId(inbox);
        if (friendId.isNotEmpty) await _toggleBlock(friendId, _isBlocked(friendId));
        break;
      case 'chat-lock':
        final locked = _isChatLocked(inbox);
        final shared = locked && inbox['chatLockScope']?.toString() == 'both';
        final sharedOwner = shared && inbox['chatLockOwnerId']?.toString() == currentUserId;
        if (!locked) {
          await _createLock(inbox);
        } else if (!shared || sharedOwner) {
          await _removeLock(inbox);
        }
        break;
      case 'change-lock':
        await _changeLock(inbox);
        break;
      case 'clear':
        await _clearChat(inbox);
        break;
      case 'delete':
        await _deleteChat(inbox);
        break;
    }
  }

  Future<void> _openUtility(Widget screen) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => screen),
    );
    if (mounted) await _load();
  }

  Future<void> _openInbox(Map<String, dynamic> inbox) async {
    if (_isChatLocked(inbox)) {
      final password = await _askPassword(
        title: 'Enter Chat Password',
        message: 'This chat is locked for your account.',
        confirmLabel: 'Unlock',
      );
      if (password == null || !mounted) return;
      try {
        final result = await context.services.inbox.verifyChatLock(
          inbox['roomId']?.toString() ?? '',
          password,
        );
        if (result['verified'] != true) {
          _message('Invalid password');
          return;
        }
      } on Object catch (failure) {
        if (!mounted) return;
        _message(_errorText(failure));
        return;
      }
    }

    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => LiveChatRoomScreen(
          inbox: inbox,
          name: _inboxName(inbox),
        ),
      ),
    );
    if (mounted) await _load();
  }

  Future<void> _showActions(Map<String, dynamic> inbox) async {
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheetContext) {
        final entries = _rowMenuItems(inbox)
            .whereType<PopupMenuItem<String>>()
            .toList(growable: false);

        return SafeArea(
          child: SizedBox(
            height: MediaQuery.sizeOf(context).height * .78,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(8, 0, 8, 20),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 4, 12, 10),
                  child: Text(
                    _inboxName(inbox),
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
                  ),
                ),
                ...entries.map((entry) {
                  final row = entry.child;
                  return ListTile(
                    enabled: entry.enabled,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12),
                    title: row,
                    onTap: !entry.enabled
                        ? null
                        : () {
                            Navigator.pop(sheetContext);
                            if (entry.value != null) {
                              unawaited(_runRowMenuAction(inbox, entry.value!));
                            }
                          },
                  );
                }),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _preference(
    Map<String, dynamic> inbox,
    String action,
    bool value,
  ) async {
    final roomId = inbox['roomId']?.toString() ?? '';
    if (roomId.isEmpty) return;
    _setBusy(roomId);

    try {
      final updated = await context.services.inbox.setPreference(
        roomId,
        action,
        value,
      );
      if (!mounted) return;
      if (updated.isNotEmpty) {
        _onInboxUpdate(updated);
      } else {
        await _load();
      }
    } on Object catch (failure) {
      if (!mounted) return;
      _message(_errorText(failure));
    } finally {
      _clearBusy(roomId);
    }
  }

  Future<void> _toggleBlock(String friendId, bool blocked) async {
    if (friendId.isEmpty) return;
    try {
      if (blocked) {
        await context.services.contacts.unblock(friendId);
      } else {
        await context.services.contacts.block(friendId);
      }
      await _loadPageMeta();
    } on Object catch (failure) {
      if (!mounted) return;
      _message(_errorText(failure));
    }
  }

  Future<void> _createLock(Map<String, dynamic> inbox) async {
    final result = await showDialog<_LockCreateResult>(
      context: context,
      builder: (_) => const _CreateLockDialog(),
    );
    if (result == null || !mounted) return;

    final roomId = inbox['roomId']?.toString() ?? '';
    _setBusy(roomId);
    try {
      await context.services.inbox.enableChatLock(
        roomId,
        result.password,
        scope: result.scope,
      );
      await _refreshRoom(roomId);
    } on Object catch (failure) {
      if (!mounted) return;
      _message(_errorText(failure));
    } finally {
      _clearBusy(roomId);
    }
  }

  Future<void> _changeLock(Map<String, dynamic> inbox) async {
    final result = await showDialog<_LockChangeResult>(
      context: context,
      builder: (_) => const _ChangeLockDialog(),
    );
    if (result == null || !mounted) return;

    final roomId = inbox['roomId']?.toString() ?? '';
    _setBusy(roomId);
    try {
      await context.services.inbox.changeChatLock(
        roomId,
        oldPassword: result.oldPassword,
        newPassword: result.newPassword,
      );
      await _refreshRoom(roomId);
    } on Object catch (failure) {
      if (!mounted) return;
      _message(_errorText(failure));
    } finally {
      _clearBusy(roomId);
    }
  }

  Future<void> _removeLock(Map<String, dynamic> inbox) async {
    final confirmed = await _confirm(
      title: 'Remove chat lock?',
      message: inbox['chatLockScope']?.toString() == 'both'
          ? 'This removes the shared lock for both participants.'
          : 'This removes the lock from your account.',
      confirmLabel: 'Remove',
    );
    if (!confirmed || !mounted) return;

    final roomId = inbox['roomId']?.toString() ?? '';
    _setBusy(roomId);
    try {
      await context.services.inbox.removeChatLock(roomId);
      await _refreshRoom(roomId);
    } on Object catch (failure) {
      if (!mounted) return;
      _message(_errorText(failure));
    } finally {
      _clearBusy(roomId);
    }
  }

  Future<void> _clearChat(Map<String, dynamic> inbox) async {
    final confirmed = await _confirm(
      title: 'Clear chat?',
      message: 'Messages in this chat will be cleared for your account.',
      confirmLabel: 'Clear',
    );
    if (!confirmed || !mounted) return;

    final roomId = inbox['roomId']?.toString() ?? '';
    _setBusy(roomId);
    try {
      await context.services.inbox.clearRoom(roomId);
      await _load();
    } on Object catch (failure) {
      if (!mounted) return;
      _message(_errorText(failure));
    } finally {
      _clearBusy(roomId);
    }
  }

  Future<void> _deleteChat(Map<String, dynamic> inbox) async {
    final privateChat = inbox['roomType']?.toString() == 'private';
    final scope = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete chat'),
        content: const Text('Choose how this chat should be deleted.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, 'self'),
            child: const Text('Delete for me'),
          ),
          if (privateChat)
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext, 'both'),
              child: const Text('Delete for both'),
            ),
        ],
      ),
    );
    if (scope == null || !mounted) return;

    final roomId = inbox['roomId']?.toString() ?? '';
    _setBusy(roomId);
    try {
      await context.services.inbox.deleteRoom(roomId, scope: scope);
      if (!mounted) return;
      _onInboxDelete([roomId]);
    } on Object catch (failure) {
      if (!mounted) return;
      _message(_errorText(failure));
    } finally {
      _clearBusy(roomId);
    }
  }

  Future<void> _markAllRead() async {
    try {
      await context.services.inbox.markAllRead();
      await _load();
    } on Object catch (failure) {
      if (!mounted) return;
      _message(_errorText(failure));
    }
  }

  Future<void> _refreshRoom(String roomId) async {
    final fresh = await context.services.inbox.findByRoom(roomId);
    if (fresh.isNotEmpty) _onInboxUpdate(fresh);
  }

  Future<String?> _askPassword({
    required String title,
    required String message,
    required String confirmLabel,
  }) async {
    final controller = TextEditingController();
    final formKey = GlobalKey<FormState>();
    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(title),
        content: Form(
          key: formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(message),
              const SizedBox(height: 14),
              TextFormField(
                controller: controller,
                autofocus: true,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'Password',
                  prefixIcon: Icon(Icons.lock_outline_rounded),
                ),
                validator: (value) =>
                    (value ?? '').isEmpty ? 'Password is required.' : null,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              if (formKey.currentState?.validate() != true) return;
              Navigator.pop(dialogContext, controller.text);
            },
            child: Text(confirmLabel),
          ),
        ],
      ),
    );
    controller.dispose();
    return result;
  }

  Future<bool> _confirm({
    required String title,
    required String message,
    required String confirmLabel,
  }) async {
    return await showDialog<bool>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: Text(title),
            content: Text(message),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext, false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(dialogContext, true),
                child: Text(confirmLabel),
              ),
            ],
          ),
        ) ??
        false;
  }

  Widget _deliveryIcon(Map<String, dynamic> inbox) {
    final content = _content(inbox);
    final read = content['readed'] == true;
    final delivered = content['delivered'] == true;

    if (read) {
      return const Icon(Icons.done_all_rounded, size: 20, color: SyncColors.sky600);
    }
    if (delivered) {
      return Icon(Icons.done_all_rounded, size: 20, color: context.muted);
    }
    return Icon(Icons.done_rounded, size: 18, color: context.muted);
  }

  List<Widget> _filePreviewWidgets(Map<String, dynamic> inbox) {
    final file = _asMap(inbox['file']);
    if (file.isEmpty || _oneTimeType(_contentText(inbox)) != null) return const [];

    final type = file['type']?.toString().toLowerCase() ?? '';
    if (type == 'image') {
      final raw = file['url']?.toString() ?? '';
      final url = context.services.config.resolveMediaUrl(raw);
      if (url.isNotEmpty) {
        return [
          ClipRRect(
            borderRadius: BorderRadius.circular(2),
            child: Image.network(
              url,
              width: 20,
              height: 20,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Icon(Icons.image_outlined, size: 18, color: context.muted),
            ),
          ),
          const SizedBox(width: 4),
        ];
      }
    }

    if (_isAudioFile(file)) {
      return [Icon(Icons.mic_rounded, size: 20, color: context.muted), const SizedBox(width: 3)];
    }
    if (type == 'video') {
      return [Icon(Icons.videocam_outlined, size: 18, color: context.muted), const SizedBox(width: 3)];
    }
    if (type.isNotEmpty && type != 'image') {
      return [Icon(Icons.description_rounded, size: 20, color: context.muted), const SizedBox(width: 3)];
    }
    return const [];
  }

  Widget _previewWidget(Map<String, dynamic> inbox) {
    final text = _contentText(inbox);
    final locked = _isChatLocked(inbox) || _isPrivateLockedGroup(inbox);
    final unread = _showUnreadBadge(inbox);
    final baseColor = unread
        ? (context.isDark ? const Color(0xFFF1F5F9) : SyncColors.slate900)
        : (context.isDark ? SyncColors.spill300 : const Color(0xFF475569));
    final weight = unread ? FontWeight.w600 : FontWeight.w400;

    if (locked) {
      return _previewLine(
        Icons.lock_outline_rounded,
        'Locked content',
        const Color(0xFFD97706),
        weight,
      );
    }

    final call = _callMeta(text);
    if (call != null) {
      return _previewLine(call.icon, call.label, call.color, weight);
    }

    if (_isEventMessage(text)) {
      return _previewLine(Icons.event_outlined, 'Event', SyncColors.sky600, weight);
    }
    if (_isPollMessage(text)) {
      return _previewLine(Icons.bar_chart_rounded, 'Poll', const Color(0xFF059669), weight);
    }
    if (_isLocationMessage(text)) {
      return _previewLine(Icons.location_on_outlined, 'Location', const Color(0xFF059669), weight);
    }

    final oneTime = _oneTimeType(text);
    if (oneTime != null) {
      final icon = oneTime == 'photo'
          ? Icons.image_outlined
          : oneTime == 'video'
              ? Icons.videocam_outlined
              : Icons.visibility_off_outlined;
      return _previewLine(icon, 'Sent a $oneTime', SyncColors.sky600, weight);
    }

    final file = _asMap(inbox['file']);
    final value = _isAudioFile(file)
        ? 'Voice'
        : file['type']?.toString() == 'video'
            ? 'Video'
            : text;

    return Text(
      value,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: TextStyle(color: baseColor, fontSize: 14, fontWeight: weight),
    );
  }

  Widget _previewLine(IconData icon, String label, Color color, FontWeight weight) {
    return Row(
      children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 4),
        Expanded(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: color, fontSize: 14, fontWeight: weight),
          ),
        ),
      ],
    );
  }

  bool _hasUnreadForMe(Map<String, dynamic> inbox) {
    if (_isManuallyUnread(inbox)) return true;
    final content = _content(inbox);
    final incoming = content['from']?.toString() != currentUserId;
    final unread = (inbox['unreadMessage'] as num?)?.toInt() ?? 0;
    return incoming && unread > 0;
  }

  bool _showUnreadBadge(Map<String, dynamic> inbox) {
    if (_isManuallyUnread(inbox)) return true;
    final content = _content(inbox);
    final incoming = content['from']?.toString() != currentUserId;
    final unread = (inbox['unreadMessage'] as num?)?.toInt() ?? 0;
    return incoming && (unread > 0 || (_isChatLocked(inbox) && content['readed'] != true));
  }

  bool _isFavourite(Map<String, dynamic> inbox) {
    return inbox['isFavourite'] == true ||
        inbox['isFavorite'] == true ||
        inbox['favourite'] == true ||
        inbox['favorite'] == true ||
        _hasUser(inbox['favouriteBy'], currentUserId) ||
        _hasUser(inbox['favoriteBy'], currentUserId);
  }

  bool _isArchived(Map<String, dynamic> inbox) =>
      _hasUser(inbox['archivedBy'], currentUserId);
  bool _isListed(Map<String, dynamic> inbox) =>
      _hasUser(inbox['listedBy'], currentUserId);
  bool _isHidden(Map<String, dynamic> inbox) =>
      _hasUser(inbox['hiddenBy'], currentUserId);
  bool _isPinned(Map<String, dynamic> inbox) =>
      _hasUser(inbox['pinnedBy'], currentUserId);
  bool _isManuallyUnread(Map<String, dynamic> inbox) =>
      _hasUser(inbox['markUnreadBy'], currentUserId);
  bool _isMuted(Map<String, dynamic> inbox) =>
      _hasUser(inbox['mutedBy'], currentUserId);
  bool _isDeletedForMe(Map<String, dynamic> inbox) =>
      _hasUser(inbox['deletedBy'], currentUserId);
  bool _isChatLocked(Map<String, dynamic> inbox) =>
      inbox['roomType']?.toString() == 'private' &&
      _hasUser(inbox['chatLockBy'], currentUserId);

  bool _isGroupPrivate(Map<String, dynamic> inbox) {
    if (inbox['roomType']?.toString() != 'group') return false;
    final channel = _asMap(inbox['channel']);
    final group = _asMap(inbox['group']);
    return channel['accessType']?.toString() == 'private' ||
        group['accessType']?.toString() == 'private';
  }

  bool _isPrivateLockedGroup(Map<String, dynamic> inbox) {
    if (inbox['roomType']?.toString() != 'group') return false;
    final channel = _asMap(inbox['channel']);
    final group = _asMap(inbox['group']);
    return channel['accessType']?.toString() == 'private' ||
        group['accessType']?.toString() == 'private' ||
        channel['requiresPassword'] == true ||
        group['requiresPassword'] == true;
  }

  bool _hasChannel(Map<String, dynamic> inbox) {
    final channel = _asMap(inbox['channel']);
    return channel['_id'] != null;
  }

  bool _isBlocked(String friendId) {
    final ids = settings['blockedUserIds'];
    return ids is List && ids.map((item) => item.toString()).contains(friendId);
  }

  bool _isOutgoing(Map<String, dynamic> inbox) =>
      _content(inbox)['from']?.toString() == currentUserId;

  bool _isOnline(Map<String, dynamic> profile) =>
      profile['online'] == true || profile['isOnline'] == true;

  Map<String, dynamic> _content(Map<String, dynamic> inbox) => _asMap(inbox['content']);

  String _contentText(Map<String, dynamic> inbox) =>
      _content(inbox)['text']?.toString() ?? '';

  String _senderName(Map<String, dynamic> inbox) {
    final value = _content(inbox)['senderName']?.toString().trim() ?? '';
    return value.isEmpty ? 'Unknown sender' : value;
  }

  Map<String, dynamic> _privateProfile(Map<String, dynamic> inbox) {
    if (inbox['roomType']?.toString() != 'private') return const {};
    final owners = inbox['owners'];
    if (owners is! List) return const {};
    for (final owner in owners.whereType<Map>()) {
      if (owner['userId']?.toString() == currentUserId) continue;
      return Map<String, dynamic>.from(owner);
    }
    return const {};
  }

  String? _inboxAvatar(Map<String, dynamic> inbox) {
    if (inbox['roomType']?.toString() == 'private') {
      final profile = _privateProfile(inbox);
      return profile['avatar']?.toString();
    }
    final channel = _asMap(inbox['channel']);
    final group = _asMap(inbox['group']);
    final value = channel['avatar']?.toString() ?? group['avatar']?.toString() ?? '';
    return value.isEmpty ? null : value;
  }

  String _searchBlob(Map<String, dynamic> inbox) {
    final owners = inbox['owners'];
    final ownerText = owners is List
        ? owners.whereType<Map>().map((owner) => [
              owner['fullname'],
              owner['username'],
              owner['userId'],
            ].where((value) => value != null).join(' ')).join(' ')
        : '';
    final file = _asMap(inbox['file']);
    final content = _content(inbox);
    return [
      _inboxName(inbox),
      ownerText,
      content['senderName']?.toString() ?? '',
      content['text']?.toString() ?? '',
      file['originalname']?.toString() ?? '',
      inbox['roomId']?.toString() ?? '',
      inbox['roomType']?.toString() ?? '',
    ].join(' ').toLowerCase();
  }

  String _inboxName(Map<String, dynamic> inbox) {
    if (inbox['roomType']?.toString() == 'group') {
      final channel = _asMap(inbox['channel']);
      final group = _asMap(inbox['group']);
      final channelName = channel['name']?.toString().trim() ?? '';
      if (channelName.isNotEmpty) return channelName;
      final groupName = group['name']?.toString().trim() ?? '';
      return groupName.isEmpty ? 'Group' : groupName;
    }

    final profile = _privateProfile(inbox);
    final fullName = profile['fullname']?.toString().trim() ?? '';
    if (fullName.isNotEmpty) return fullName;
    final username = profile['username']?.toString().trim() ?? '';
    return username.isEmpty ? '[inactive]' : username;
  }

  String _friendId(Map<String, dynamic> inbox) {
    final owners = inbox['owners'];
    if (owners is List) {
      for (final owner in owners.whereType<Map>()) {
        final id = owner['userId']?.toString() ?? '';
        if (id.isNotEmpty && id != currentUserId) return id;
      }
    }
    final ownerIds = inbox['ownersId'];
    if (ownerIds is List) {
      for (final raw in ownerIds) {
        final id = raw.toString();
        if (id.isNotEmpty && id != currentUserId) return id;
      }
    }
    return '';
  }

  void _setBusy(String roomId) {
    if (mounted) setState(() => busyRoomId = roomId);
  }

  void _clearBusy(String roomId) {
    if (mounted && busyRoomId == roomId) setState(() => busyRoomId = null);
  }

  void _message(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(text), behavior: SnackBarBehavior.floating),
    );
  }
}

class _MenuRow extends StatelessWidget {
  const _MenuRow({
    required this.icon,
    required this.label,
    this.danger = false,
  });

  final IconData icon;
  final String label;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final color = danger ? SyncColors.danger : null;
    return Row(
      children: [
        Icon(icon, size: 20, color: color),
        const SizedBox(width: 16),
        Expanded(
          child: Text(
            label,
            style: TextStyle(color: color),
          ),
        ),
      ],
    );
  }
}

class _StatusGroup {
  _StatusGroup({
    required this.userId,
    required this.profile,
    required this.items,
  });

  final String userId;
  final Map<String, dynamic> profile;
  final List<Map<String, dynamic>> items;
}

class _CallMeta {
  const _CallMeta({
    required this.label,
    required this.icon,
    required this.color,
  });

  final String label;
  final IconData icon;
  final Color color;
}

class _CreateLockDialog extends StatefulWidget {
  const _CreateLockDialog();

  @override
  State<_CreateLockDialog> createState() => _CreateLockDialogState();
}

class _CreateLockDialogState extends State<_CreateLockDialog> {
  final formKey = GlobalKey<FormState>();
  final password = TextEditingController();
  String scope = 'self';

  @override
  void dispose() {
    password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Lock this chat'),
      content: Form(
        key: formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Choose whether the password protects only your view or both participants.',
                style: TextStyle(fontSize: 12),
              ),
            ),
            const SizedBox(height: 14),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(
                  value: 'self',
                  label: Text('Only me'),
                  icon: Icon(Icons.person_outline_rounded),
                ),
                ButtonSegment(
                  value: 'both',
                  label: Text('Both'),
                  icon: Icon(Icons.group_outlined),
                ),
              ],
              selected: {scope},
              onSelectionChanged: (value) => setState(() => scope = value.first),
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: password,
              autofocus: true,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Password'),
              validator: (value) => (value ?? '').length < 4
                  ? 'Password must be at least 4 characters'
                  : null,
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () {
            if (formKey.currentState?.validate() != true) return;
            Navigator.pop(context, _LockCreateResult(scope, password.text));
          },
          child: const Text('Save'),
        ),
      ],
    );
  }
}

class _ChangeLockDialog extends StatefulWidget {
  const _ChangeLockDialog();

  @override
  State<_ChangeLockDialog> createState() => _ChangeLockDialogState();
}

class _ChangeLockDialogState extends State<_ChangeLockDialog> {
  final formKey = GlobalKey<FormState>();
  final oldPassword = TextEditingController();
  final newPassword = TextEditingController();

  @override
  void dispose() {
    oldPassword.dispose();
    newPassword.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Change lock password'),
      content: Form(
        key: formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextFormField(
              controller: oldPassword,
              autofocus: true,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Current password'),
              validator: (value) => (value ?? '').isEmpty
                  ? 'Current password is required.'
                  : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: newPassword,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'New password'),
              validator: (value) => (value ?? '').length < 4
                  ? 'New password must be at least 4 characters'
                  : null,
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () {
            if (formKey.currentState?.validate() != true) return;
            Navigator.pop(
              context,
              _LockChangeResult(oldPassword.text, newPassword.text),
            );
          },
          child: const Text('Save'),
        ),
      ],
    );
  }
}

class _LockCreateResult {
  const _LockCreateResult(this.scope, this.password);

  final String scope;
  final String password;
}

class _LockChangeResult {
  const _LockChangeResult(this.oldPassword, this.newPassword);

  final String oldPassword;
  final String newPassword;
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off_outlined, size: 46, color: SyncColors.sky),
            const SizedBox(height: 10),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

bool _hasUser(dynamic value, String userId) {
  if (value is! List || userId.isEmpty) return false;
  return value.map((item) => item.toString()).contains(userId);
}

Map<String, dynamic> _asMap(dynamic value) {
  if (value is Map) return Map<String, dynamic>.from(value);
  return const {};
}

DateTime _contentTime(Map<String, dynamic> inbox) {
  final content = _asMap(inbox['content']);
  return DateTime.tryParse(content['time']?.toString() ?? '') ??
      DateTime.fromMillisecondsSinceEpoch(0);
}

DateTime _statusTime(Map<String, dynamic> status) {
  return DateTime.tryParse(status['createdAt']?.toString() ?? '') ??
      DateTime.fromMillisecondsSinceEpoch(0);
}

String _statusName(Map<String, dynamic> profile) {
  final fullName = profile['fullname']?.toString().trim() ?? '';
  if (fullName.isNotEmpty) return fullName;
  final username = profile['username']?.toString().trim() ?? '';
  return username.isEmpty ? 'Status' : username;
}

String _fromNow(DateTime time) {
  if (time.millisecondsSinceEpoch == 0) return '';
  final diff = DateTime.now().difference(time.toLocal());
  if (diff.isNegative || diff.inSeconds < 45) return 'a few seconds ago';
  if (diff.inSeconds < 90) return 'a minute ago';
  if (diff.inMinutes < 45) return '${diff.inMinutes} minutes ago';
  if (diff.inMinutes < 90) return 'an hour ago';
  if (diff.inHours < 22) return '${diff.inHours} hours ago';
  if (diff.inHours < 36) return 'a day ago';
  if (diff.inDays < 26) return '${diff.inDays} days ago';
  if (diff.inDays < 45) return 'a month ago';
  if (diff.inDays < 320) return '${(diff.inDays / 30).round()} months ago';
  if (diff.inDays < 548) return 'a year ago';
  return '${(diff.inDays / 365).round()} years ago';
}

_CallMeta? _callMeta(String text) {
  final value = text.trim().toLowerCase();
  final mentionsCall = value.contains('call') ||
      value.contains('missed') ||
      value.contains('reject') ||
      value.contains('decline');
  if (!mentionsCall) return null;

  final video = value.contains('video');
  final missed = value.contains('missed');
  final rejected = value.contains('reject') || value.contains('decline');
  final danger = missed || rejected;
  final color = danger ? const Color(0xFFE11D48) : const Color(0xFF059669);

  var label = '${video ? 'Video' : 'Audio'} call';
  if (rejected) {
    label = '${video ? 'Video' : 'Audio'} call rejected';
  } else if (missed) {
    label = 'Missed ${video ? 'video' : 'audio'} call';
  }

  return _CallMeta(
    label: label,
    icon: video ? Icons.videocam_outlined : Icons.call_outlined,
    color: color,
  );
}

bool _isEventMessage(String text) {
  if (!text.startsWith(_eventPrefix)) return false;
  try {
    final parsed = jsonDecode(text.substring(_eventPrefix.length));
    return parsed is Map &&
        (parsed['title']?.toString().trim().isNotEmpty ?? false) &&
        (parsed['date']?.toString().trim().isNotEmpty ?? false);
  } on Object {
    return false;
  }
}

bool _isPollMessage(String text) {
  if (text.startsWith(_pollPrefix)) {
    try {
      final parsed = jsonDecode(text.substring(_pollPrefix.length));
      return parsed is Map &&
          (parsed['question']?.toString().trim().isNotEmpty ?? false) &&
          parsed['options'] is List &&
          (parsed['options'] as List).length >= 2;
    } on Object {
      return false;
    }
  }
  final value = text.trim();
  return RegExp(r'^poll\s*:', caseSensitive: false).hasMatch(value) ||
      RegExp(r'^poll$', caseSensitive: false).hasMatch(value);
}

bool _isLocationMessage(String text) {
  final value = text.trim();
  if (value.isEmpty) return false;
  return RegExp(r'maps\.google\.com/\?q=[-\d.]+,[-\d.]+', caseSensitive: false)
          .hasMatch(value) ||
      value.toLowerCase().contains('live location');
}

String? _oneTimeType(String text) {
  final match = RegExp(r'^1-time (photo|video|message)$', caseSensitive: false)
      .firstMatch(text.trim());
  return match?.group(1)?.toLowerCase();
}

bool _isAudioFile(Map<String, dynamic> file) {
  if (file.isEmpty) return false;
  if (file['type']?.toString() == 'audio') return true;
  final raw = file['format']?.toString() ?? file['originalname']?.toString() ?? '';
  final dot = raw.lastIndexOf('.');
  final ext = dot >= 0 ? raw.substring(dot + 1).toLowerCase() : raw.toLowerCase();
  return const {'mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'webm'}.contains(ext);
}

Color? _hexColor(String value) {
  final clean = value.replaceAll('#', '').trim();
  if (clean.isEmpty) return null;
  final parsed = int.tryParse(clean.length == 6 ? 'FF$clean' : clean, radix: 16);
  return parsed == null ? null : Color(parsed);
}

String _errorText(Object failure) {
  if (failure is ApiException) return failure.message;
  return failure.toString().replaceFirst('Exception: ', '');
}
