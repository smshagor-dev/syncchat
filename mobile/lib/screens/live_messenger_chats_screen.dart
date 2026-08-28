import 'dart:async';

import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../core/realtime_client.dart';
import '../theme.dart';
import '../widgets.dart';
import 'live_chat_room_screen.dart';
import 'live_groups_screen.dart';
import 'live_p0_contacts_screen.dart';
import 'live_settings_hub_screen.dart';
import 'live_starred_messages_screen.dart';

/// Native mobile chat-list presentation.
///
/// This deliberately keeps SyncChat's existing inbox/realtime APIs and moves
/// web-style secondary information behind mobile-friendly interactions. The
/// visible hierarchy follows the proven messenger pattern: header, search,
/// quick filters, conversations, and a single compose action.
class LiveMessengerChatsScreen extends StatefulWidget {
  const LiveMessengerChatsScreen({
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
  State<LiveMessengerChatsScreen> createState() =>
      _LiveMessengerChatsScreenState();
}

class _LiveMessengerChatsScreenState extends State<LiveMessengerChatsScreen> {
  final searchController = TextEditingController();
  final searchFocus = FocusNode();

  List<Map<String, dynamic>> inboxes = const [];
  Map<String, dynamic>? currentUser;
  Map<String, dynamic> settings = const {};

  StreamSubscription<RealtimeConnectionState>? connectionSubscription;
  Timer? fallbackTimer;

  bool loading = true;
  String? error;
  String filter = 'all';
  String? busyRoomId;

  String get currentUserId => currentUser?['_id']?.toString() ?? '';

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
    connectionSubscription?.cancel();
    fallbackTimer?.cancel();
    searchController.dispose();
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
        fallbackTimer?.cancel();
        unawaited(_load());
      } else if (state == RealtimeConnectionState.disconnected) {
        _scheduleFallback();
      }
    });

    if (realtime.state == RealtimeConnectionState.disconnected) {
      unawaited(realtime.connect());
      _scheduleFallback();
    }

    unawaited(_load());
    unawaited(_loadSettings());
  }

  void _scheduleFallback() {
    fallbackTimer?.cancel();
    fallbackTimer = Timer(const Duration(milliseconds: 500), () {
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
  }

  Future<void> _loadSettings() async {
    try {
      final next = await context.services.settings.get();
      if (!mounted) return;
      setState(() {
        settings = next is Map
            ? Map<String, dynamic>.from(next)
            : const <String, dynamic>{};
      });
    } on Object {
      // Blocking metadata is secondary; the chat list stays available.
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
      if (index < 0) {
        copy.insert(0, next);
      } else {
        copy[index] = {...copy[index], ...next};
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

  Iterable<Map<String, dynamic>> get _activeInboxes => inboxes.where(
        (inbox) =>
            !_isDeletedForMe(inbox) &&
            !_isHidden(inbox) &&
            !_isArchived(inbox),
      );

  List<Map<String, dynamic>> get visibleInboxes {
    final query = searchController.text.trim().toLowerCase();
    final rows = _activeInboxes.where((inbox) {
      final matches = switch (filter) {
        'unread' => _hasUnreadForMe(inbox),
        'favourite' => _isFavourite(inbox),
        'group' => inbox['roomType']?.toString() == 'group',
        _ => true,
      };
      if (!matches) return false;
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

  int get unreadCount => _activeInboxes.where(_hasUnreadForMe).length;
  int get favouriteCount => _activeInboxes.where(_isFavourite).length;
  int get groupCount => _activeInboxes
      .where((inbox) => inbox['roomType']?.toString() == 'group')
      .length;

  @override
  Widget build(BuildContext context) {
    final page = context.isDark ? SyncColors.spill950 : Colors.white;
    return Scaffold(
      backgroundColor: page,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _header(),
            _searchBox(),
            _filters(),
            const SizedBox(height: 4),
            Expanded(child: _body()),
          ],
        ),
      ),
      floatingActionButton: Padding(
        padding: const EdgeInsets.only(bottom: 84),
        child: FloatingActionButton(
          heroTag: 'syncchat-new-chat',
          tooltip: 'New chat',
          onPressed: () => _openUtility(const LiveP0ContactsScreen()),
          backgroundColor: SyncColors.sky600,
          foregroundColor: Colors.white,
          elevation: 4,
          child: const Icon(Icons.edit_rounded, size: 23),
        ),
      ),
    );
  }

  Widget _header() {
    return SizedBox(
      height: 58,
      child: Row(
        children: [
          const SizedBox(width: 4),
          IconButton(
            tooltip: 'Menu',
            onPressed: widget.onMenu,
            icon: const Icon(Icons.menu_rounded, size: 25),
          ),
          const SizedBox(width: 4),
          const Expanded(
            child: Text(
              'Chats',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 23,
                fontWeight: FontWeight.w800,
                letterSpacing: -.3,
              ),
            ),
          ),
          IconButton(
            tooltip: 'Contacts',
            onPressed: () => _openUtility(const LiveP0ContactsScreen()),
            icon: const Icon(Icons.person_add_alt_1_outlined, size: 23),
          ),
          PopupMenuButton<String>(
            tooltip: 'More',
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
            icon: const Icon(Icons.more_vert_rounded, size: 24),
            onSelected: (value) => unawaited(_handleTopMenu(value)),
            itemBuilder: (_) => const [
              PopupMenuItem(
                value: 'new-group',
                child: _MenuRow(Icons.group_add_outlined, 'New group'),
              ),
              PopupMenuItem(
                value: 'starred',
                child: _MenuRow(Icons.star_border_rounded, 'Starred messages'),
              ),
              PopupMenuItem(
                value: 'status',
                child: _MenuRow(Icons.donut_large_rounded, 'Status'),
              ),
              PopupMenuItem(
                value: 'mark-read',
                child: _MenuRow(Icons.mark_chat_read_outlined, 'Mark all as read'),
              ),
              PopupMenuDivider(),
              PopupMenuItem(
                value: 'settings',
                child: _MenuRow(Icons.settings_outlined, 'Settings'),
              ),
              PopupMenuItem(
                value: 'logout',
                child: _MenuRow(Icons.logout_rounded, 'Log out'),
              ),
            ],
          ),
          const SizedBox(width: 2),
        ],
      ),
    );
  }

  Widget _searchBox() {
    final fill = context.isDark ? SyncColors.spill800 : SyncColors.slate100;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 3, 12, 7),
      child: SizedBox(
        height: 44,
        child: TextField(
          controller: searchController,
          focusNode: searchFocus,
          onChanged: (_) => setState(() {}),
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            hintText: 'Search chats',
            hintStyle: TextStyle(color: context.muted, fontSize: 14.5),
            prefixIcon: Icon(Icons.search_rounded, size: 21, color: context.muted),
            prefixIconConstraints: const BoxConstraints(minWidth: 44),
            suffixIcon: searchController.text.isEmpty
                ? null
                : IconButton(
                    tooltip: 'Clear search',
                    onPressed: () {
                      searchController.clear();
                      setState(() {});
                    },
                    icon: Icon(Icons.close_rounded, size: 18, color: context.muted),
                  ),
            filled: true,
            fillColor: fill,
            contentPadding: const EdgeInsets.symmetric(horizontal: 12),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide.none,
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide.none,
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: SyncColors.sky600, width: 1.2),
            ),
          ),
        ),
      ),
    );
  }

  Widget _filters() {
    final entries = <(String, String, int?)>[
      ('all', 'All', null),
      ('unread', 'Unread', unreadCount),
      ('favourite', 'Favorites', favouriteCount),
      ('group', 'Groups', groupCount),
    ];

    return SizedBox(
      height: 38,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        scrollDirection: Axis.horizontal,
        itemCount: entries.length,
        separatorBuilder: (_, __) => const SizedBox(width: 7),
        itemBuilder: (_, index) {
          final item = entries[index];
          final active = filter == item.$1;
          final count = item.$3 ?? 0;
          final label = count > 0 ? '${item.$2} $count' : item.$2;
          return ChoiceChip(
            label: Text(label),
            selected: active,
            showCheckmark: false,
            onSelected: (_) => setState(() => filter = item.$1),
            backgroundColor:
                context.isDark ? SyncColors.spill800 : SyncColors.slate50,
            selectedColor: context.isDark
                ? SyncColors.sky.withValues(alpha: .18)
                : const Color(0xFFE0F2FE),
            side: BorderSide(
              color: active
                  ? SyncColors.sky600.withValues(alpha: .55)
                  : context.border.withValues(alpha: .8),
            ),
            labelStyle: TextStyle(
              color: active
                  ? (context.isDark ? const Color(0xFF7DD3FC) : SyncColors.sky700)
                  : context.muted,
              fontSize: 12.5,
              fontWeight: active ? FontWeight.w700 : FontWeight.w600,
            ),
            visualDensity: VisualDensity.compact,
            padding: const EdgeInsets.symmetric(horizontal: 4),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(18),
            ),
          );
        },
      ),
    );
  }

  Widget _body() {
    if (loading && inboxes.isEmpty) {
      return const Center(
        child: SizedBox(
          width: 23,
          height: 23,
          child: CircularProgressIndicator(strokeWidth: 2.3),
        ),
      );
    }

    if (error != null && inboxes.isEmpty) {
      return _ErrorState(error!, _load);
    }

    final rows = visibleInboxes;
    if (rows.isEmpty) {
      final filtered = searchController.text.trim().isNotEmpty || filter != 'all';
      return RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(28, 86, 28, 180),
          children: [
            Icon(
              filtered ? Icons.search_off_rounded : Icons.chat_bubble_outline_rounded,
              size: 48,
              color: context.muted.withValues(alpha: .65),
            ),
            const SizedBox(height: 14),
            Text(
              filtered ? 'No matching chats' : 'No chats yet',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 7),
            Text(
              filtered
                  ? 'Try a different search or filter.'
                  : 'Start a conversation from the new chat button.',
              textAlign: TextAlign.center,
              style: TextStyle(color: context.muted, fontSize: 13.5, height: 1.4),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.only(
          top: 2,
          bottom: 176 + MediaQuery.paddingOf(context).bottom,
        ),
        itemCount: rows.length,
        itemBuilder: (_, index) => _chatTile(rows[index]),
      ),
    );
  }

  Widget _chatTile(Map<String, dynamic> inbox) {
    final roomId = inbox['roomId']?.toString() ?? '';
    final name = _inboxName(inbox);
    final profile = _privateProfile(inbox);
    final unread = _showUnreadBadge(inbox);
    final rawUnread = (inbox['unreadMessage'] as num?)?.toInt() ?? 0;
    final unreadBadge = rawUnread > 0 ? rawUnread : 1;
    final busy = busyRoomId == roomId;
    final locked = _isChatLocked(inbox) || _isPrivateLockedGroup(inbox);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: busy ? null : () => unawaited(_openInbox(inbox)),
        onLongPress: busy ? null : () => unawaited(_showActions(inbox)),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 10, 8),
          child: Row(
            children: [
              SyncAvatar(
                name: name,
                imageUrl: _inboxAvatar(inbox),
                radius: 28,
                online: inbox['roomType']?.toString() == 'private' &&
                    _isOnline(profile),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Container(
                  constraints: const BoxConstraints(minHeight: 58),
                  padding: const EdgeInsets.only(bottom: 7),
                  decoration: BoxDecoration(
                    border: Border(
                      bottom: BorderSide(
                        color: context.border.withValues(alpha: .55),
                        width: .7,
                      ),
                    ),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Row(
                              children: [
                                if (_hasChannel(inbox)) ...[
                                  const Icon(
                                    Icons.campaign_outlined,
                                    size: 15,
                                    color: SyncColors.sky600,
                                  ),
                                  const SizedBox(width: 4),
                                ] else if (inbox['roomType']?.toString() == 'group') ...[
                                  Icon(
                                    _isGroupPrivate(inbox)
                                        ? Icons.lock_outline_rounded
                                        : Icons.groups_outlined,
                                    size: 15,
                                    color: _isGroupPrivate(inbox)
                                        ? const Color(0xFFD97706)
                                        : context.muted,
                                  ),
                                  const SizedBox(width: 4),
                                ],
                                Expanded(
                                  child: Text(
                                    name,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontSize: 16.5,
                                      height: 1.2,
                                      fontWeight:
                                          unread ? FontWeight.w800 : FontWeight.w600,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            _formatChatTime(_contentTime(inbox)),
                            style: TextStyle(
                              color: unread ? SyncColors.sky600 : context.muted,
                              fontSize: 11.5,
                              fontWeight: unread ? FontWeight.w700 : FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 5),
                      Row(
                        children: [
                          Expanded(
                            child: _preview(
                              inbox,
                              unread: unread,
                              locked: locked,
                            ),
                          ),
                          const SizedBox(width: 7),
                          if (busy)
                            const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          else ...[
                            if (_isPinned(inbox))
                              Padding(
                                padding: const EdgeInsets.only(right: 5),
                                child: Transform.rotate(
                                  angle: .65,
                                  child: Icon(
                                    Icons.push_pin_rounded,
                                    size: 15,
                                    color: context.muted,
                                  ),
                                ),
                              ),
                            if (_isMuted(inbox))
                              Padding(
                                padding: const EdgeInsets.only(right: 5),
                                child: Icon(
                                  Icons.volume_off_rounded,
                                  size: 17,
                                  color: context.muted,
                                ),
                              ),
                            if (unread)
                              Container(
                                constraints:
                                    const BoxConstraints(minWidth: 20, minHeight: 20),
                                padding: const EdgeInsets.symmetric(horizontal: 5),
                                alignment: Alignment.center,
                                decoration: BoxDecoration(
                                  color: SyncColors.sky600,
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Text(
                                  unreadBadge > 99 ? '99+' : '$unreadBadge',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 10.5,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _preview(
    Map<String, dynamic> inbox, {
    required bool unread,
    required bool locked,
  }) {
    final color = unread
        ? (context.isDark ? SyncColors.slate200 : SyncColors.slate700)
        : context.muted;
    final content = _content(inbox);
    final children = <Widget>[];

    if (content['from']?.toString() == currentUserId) {
      final read = content['readed'] == true;
      final delivered = content['delivered'] == true;
      children.add(
        Icon(
          read || delivered ? Icons.done_all_rounded : Icons.done_rounded,
          size: 17,
          color: read ? SyncColors.sky600 : context.muted,
        ),
      );
      children.add(const SizedBox(width: 3));
    }

    if (locked) {
      children.add(
        const Icon(
          Icons.lock_outline_rounded,
          size: 15,
          color: Color(0xFFD97706),
        ),
      );
      children.add(const SizedBox(width: 4));
      children.add(
        const Expanded(
          child: Text(
            'Locked message',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: Color(0xFFD97706),
              fontSize: 13.5,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      );
      return Row(children: children);
    }

    if (inbox['roomType']?.toString() == 'group') {
      final sender = content['senderName']?.toString().trim() ?? '';
      if (sender.isNotEmpty) {
        children.add(
          Flexible(
            flex: 0,
            child: Text(
              '$sender: ',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: color,
                fontSize: 13.5,
                fontWeight: unread ? FontWeight.w600 : FontWeight.w500,
              ),
            ),
          ),
        );
      }
    }

    final rawText = _contentText(inbox);
    final file = _asMap(inbox['file']);
    final preview = _previewText(rawText, file);
    final icon = _previewIcon(rawText, file);
    if (icon != null) {
      children.add(Icon(icon, size: 16, color: color));
      children.add(const SizedBox(width: 4));
    }
    children.add(
      Expanded(
        child: Text(
          preview,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: color,
            fontSize: 13.5,
            fontWeight: unread ? FontWeight.w600 : FontWeight.w400,
          ),
        ),
      ),
    );
    return Row(children: children);
  }

  String _previewText(String text, Map<String, dynamic> file) {
    final value = text.trim();
    final lower = value.toLowerCase();
    if (lower.startsWith('__event__::')) return 'Event';
    if (lower.startsWith('__poll__::') || lower.startsWith('poll:')) return 'Poll';
    if (lower.contains('live location') || lower.contains('maps.google.com/?q=')) {
      return 'Location';
    }
    if (lower.startsWith('1-time photo')) return 'View once photo';
    if (lower.startsWith('1-time video')) return 'View once video';
    if (lower.startsWith('1-time message')) return 'View once message';

    final call = _callText(value);
    if (call != null) return call;

    final fileType = file['type']?.toString().toLowerCase() ?? '';
    if (_isAudioFile(file)) return 'Voice message';
    if (fileType == 'image') return value.isEmpty ? 'Photo' : value;
    if (fileType == 'video') return value.isEmpty ? 'Video' : value;
    if (file.isNotEmpty && value.isEmpty) return 'Document';
    return value.isEmpty ? 'Message' : value;
  }

  IconData? _previewIcon(String text, Map<String, dynamic> file) {
    final lower = text.trim().toLowerCase();
    if (lower.startsWith('__event__::')) return Icons.event_outlined;
    if (lower.startsWith('__poll__::') || lower.startsWith('poll:')) {
      return Icons.poll_outlined;
    }
    if (lower.contains('live location') || lower.contains('maps.google.com/?q=')) {
      return Icons.location_on_outlined;
    }
    if (lower.startsWith('1-time ')) return Icons.visibility_outlined;
    if (_callText(text) != null) {
      return lower.contains('video') ? Icons.videocam_outlined : Icons.call_outlined;
    }

    final fileType = file['type']?.toString().toLowerCase() ?? '';
    if (_isAudioFile(file)) return Icons.mic_rounded;
    if (fileType == 'image') return Icons.image_outlined;
    if (fileType == 'video') return Icons.videocam_outlined;
    if (file.isNotEmpty) return Icons.description_outlined;
    return null;
  }

  String? _callText(String text) {
    final value = text.trim().toLowerCase();
    final isCall = value.contains('call') ||
        value.contains('missed') ||
        value.contains('reject') ||
        value.contains('decline');
    if (!isCall) return null;
    final video = value.contains('video');
    if (value.contains('missed')) {
      return 'Missed ${video ? 'video' : 'audio'} call';
    }
    if (value.contains('reject') || value.contains('decline')) {
      return '${video ? 'Video' : 'Audio'} call rejected';
    }
    return '${video ? 'Video' : 'Audio'} call';
  }

  Future<void> _handleTopMenu(String value) async {
    switch (value) {
      case 'new-group':
        await _openUtility(const LiveCreateGroupScreen());
        break;
      case 'starred':
        await _openUtility(const LiveStarredMessagesScreen());
        break;
      case 'status':
        widget.onOpenStatus();
        break;
      case 'mark-read':
        await _markAllRead();
        break;
      case 'settings':
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

  Future<void> _showActions(Map<String, dynamic> inbox) async {
    final actions = _actions(inbox);
    await showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      showDragHandle: true,
      isScrollControlled: true,
      backgroundColor: context.panel,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => FractionallySizedBox(
        heightFactor: .76,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 0, 12, 10),
              child: Row(
                children: [
                  SyncAvatar(
                    name: _inboxName(inbox),
                    imageUrl: _inboxAvatar(inbox),
                    radius: 22,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      _inboxName(inbox),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
                    ),
                  ),
                ],
              ),
            ),
            Divider(height: 1, color: context.border),
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.fromLTRB(8, 8, 8, 20),
                itemCount: actions.length,
                itemBuilder: (_, index) {
                  final action = actions[index];
                  final tone = action.danger ? SyncColors.danger : null;
                  return ListTile(
                    enabled: action.enabled,
                    dense: true,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                    leading: Icon(action.icon, size: 21, color: tone),
                    title: Text(
                      action.label,
                      style: TextStyle(
                        color: tone,
                        fontSize: 14.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    onTap: !action.enabled
                        ? null
                        : () {
                            Navigator.pop(sheetContext);
                            unawaited(_runAction(inbox, action.value));
                          },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<_ActionSpec> _actions(Map<String, dynamic> inbox) {
    final privateChat = inbox['roomType']?.toString() == 'private';
    final friendId = privateChat ? _friendId(inbox) : '';
    final locked = _isChatLocked(inbox);
    final shared = locked && inbox['chatLockScope']?.toString() == 'both';
    final sharedOwner =
        shared && inbox['chatLockOwnerId']?.toString() == currentUserId;

    return [
      _ActionSpec(
        'archive',
        _isArchived(inbox) ? Icons.unarchive_outlined : Icons.archive_outlined,
        _isArchived(inbox) ? 'Unarchive chat' : 'Archive chat',
      ),
      _ActionSpec(
        'mute',
        _isMuted(inbox)
            ? Icons.notifications_outlined
            : Icons.notifications_off_outlined,
        _isMuted(inbox) ? 'Unmute notifications' : 'Mute notifications',
      ),
      _ActionSpec(
        'pin',
        Icons.push_pin_outlined,
        _isPinned(inbox) ? 'Unpin chat' : 'Pin chat',
      ),
      _ActionSpec(
        'unread',
        Icons.mark_chat_unread_outlined,
        _isManuallyUnread(inbox) ? 'Mark as read' : 'Mark as unread',
      ),
      _ActionSpec(
        'favourite',
        _isFavourite(inbox) ? Icons.star_rounded : Icons.star_border_rounded,
        _isFavourite(inbox) ? 'Remove from favorites' : 'Add to favorites',
      ),
      _ActionSpec(
        'list',
        Icons.format_list_bulleted_rounded,
        _isListed(inbox) ? 'Remove from list' : 'Add to list',
      ),
      _ActionSpec(
        'hide',
        _isHidden(inbox) ? Icons.visibility_outlined : Icons.visibility_off_outlined,
        _isHidden(inbox) ? 'Unhide chat' : 'Hide chat',
      ),
      if (privateChat && friendId.isNotEmpty)
        _ActionSpec(
          'block',
          Icons.block_rounded,
          _isBlocked(friendId) ? 'Unblock contact' : 'Block contact',
          danger: !_isBlocked(friendId),
        ),
      if (privateChat)
        _ActionSpec(
          'chat-lock',
          Icons.lock_outline_rounded,
          !locked
              ? 'Lock chat'
              : shared
                  ? sharedOwner
                      ? 'Remove shared lock'
                      : 'Shared lock active'
                  : 'Remove chat lock',
          enabled: !(shared && !sharedOwner),
        ),
      if (privateChat && locked && (!shared || sharedOwner))
        const _ActionSpec(
          'change-lock',
          Icons.key_rounded,
          'Change lock password',
        ),
      const _ActionSpec(
        'clear',
        Icons.cleaning_services_outlined,
        'Clear chat',
        danger: true,
      ),
      const _ActionSpec(
        'delete',
        Icons.delete_outline_rounded,
        'Delete chat',
        danger: true,
      ),
    ];
  }

  Future<void> _runAction(Map<String, dynamic> inbox, String action) async {
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
        final id = _friendId(inbox);
        if (id.isNotEmpty) await _toggleBlock(id, _isBlocked(id));
        break;
      case 'chat-lock':
        final locked = _isChatLocked(inbox);
        final shared = locked && inbox['chatLockScope']?.toString() == 'both';
        final sharedOwner =
            shared && inbox['chatLockOwnerId']?.toString() == currentUserId;
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
        title: 'Enter chat password',
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
    try {
      if (blocked) {
        await context.services.contacts.unblock(friendId);
      } else {
        await context.services.contacts.block(friendId);
      }
      await _loadSettings();
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
    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(title),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(message),
            const SizedBox(height: 14),
            TextField(
              controller: controller,
              autofocus: true,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: 'Password',
                prefixIcon: Icon(Icons.lock_outline_rounded),
              ),
              onSubmitted: (value) {
                if (value.isNotEmpty) Navigator.pop(dialogContext, value);
              },
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              if (controller.text.isEmpty) return;
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
    return incoming &&
        (unread > 0 || (_isChatLocked(inbox) && content['readed'] != true));
  }

  bool _isFavourite(Map<String, dynamic> inbox) =>
      inbox['isFavourite'] == true ||
      inbox['isFavorite'] == true ||
      inbox['favourite'] == true ||
      inbox['favorite'] == true ||
      _hasUser(inbox['favouriteBy'], currentUserId) ||
      _hasUser(inbox['favoriteBy'], currentUserId);

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

  bool _hasChannel(Map<String, dynamic> inbox) =>
      _asMap(inbox['channel'])['_id'] != null;

  bool _isBlocked(String friendId) {
    final ids = settings['blockedUserIds'];
    return ids is List && ids.map((item) => item.toString()).contains(friendId);
  }

  bool _isOnline(Map<String, dynamic> profile) =>
      profile['online'] == true || profile['isOnline'] == true;

  Map<String, dynamic> _content(Map<String, dynamic> inbox) =>
      _asMap(inbox['content']);

  String _contentText(Map<String, dynamic> inbox) =>
      _content(inbox)['text']?.toString() ?? '';

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
      final value = _privateProfile(inbox)['avatar']?.toString() ?? '';
      return value.isEmpty ? null : value;
    }
    final channel = _asMap(inbox['channel']);
    final group = _asMap(inbox['group']);
    final value =
        channel['avatar']?.toString() ?? group['avatar']?.toString() ?? '';
    return value.isEmpty ? null : value;
  }

  String _searchBlob(Map<String, dynamic> inbox) {
    final owners = inbox['owners'];
    final ownerText = owners is List
        ? owners
            .whereType<Map>()
            .map(
              (owner) => [
                owner['fullname'],
                owner['username'],
                owner['userId'],
              ].where((value) => value != null).join(' '),
            )
            .join(' ')
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

class _ActionSpec {
  const _ActionSpec(
    this.value,
    this.icon,
    this.label, {
    this.danger = false,
    this.enabled = true,
  });

  final String value;
  final IconData icon;
  final String label;
  final bool danger;
  final bool enabled;
}

class _MenuRow extends StatelessWidget {
  const _MenuRow(this.icon, this.label);

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 20),
        const SizedBox(width: 14),
        Expanded(child: Text(label)),
      ],
    );
  }
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
            const Text(
              'Choose whether the password protects only your view or both participants.',
              style: TextStyle(fontSize: 12),
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
              validator: (value) =>
                  (value ?? '').isEmpty ? 'Current password is required.' : null,
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
  const _ErrorState(this.message, this.onRetry);

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
            const Icon(
              Icons.cloud_off_outlined,
              size: 44,
              color: SyncColors.sky600,
            ),
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

String _formatChatTime(DateTime time) {
  if (time.millisecondsSinceEpoch == 0) return '';
  final local = time.toLocal();
  final now = DateTime.now();

  if (_sameDay(local, now)) {
    final hour = local.hour % 12 == 0 ? 12 : local.hour % 12;
    final minute = local.minute.toString().padLeft(2, '0');
    final period = local.hour >= 12 ? 'PM' : 'AM';
    return '$hour:$minute $period';
  }

  final yesterday = now.subtract(const Duration(days: 1));
  if (_sameDay(local, yesterday)) return 'Yesterday';

  final days = DateTime(now.year, now.month, now.day)
      .difference(DateTime(local.year, local.month, local.day))
      .inDays;
  if (days >= 0 && days < 7) {
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return weekdays[local.weekday - 1];
  }

  if (local.year == now.year) return '${local.day}/${local.month}';
  return '${local.day}/${local.month}/${local.year.toString().substring(2)}';
}

bool _sameDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

bool _isAudioFile(Map<String, dynamic> file) {
  if (file.isEmpty) return false;
  if (file['type']?.toString() == 'audio') return true;
  final raw =
      file['format']?.toString() ?? file['originalname']?.toString() ?? '';
  final dot = raw.lastIndexOf('.');
  final ext = dot >= 0 ? raw.substring(dot + 1).toLowerCase() : raw.toLowerCase();
  return const {'mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'webm'}
      .contains(ext);
}
