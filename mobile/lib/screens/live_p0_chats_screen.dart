import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../theme.dart';
import '../widgets.dart';
import 'live_chat_room_screen.dart';

class LiveP0ChatsScreen extends StatefulWidget {
  const LiveP0ChatsScreen({super.key, required this.onMenu});

  final VoidCallback onMenu;

  @override
  State<LiveP0ChatsScreen> createState() => _LiveP0ChatsScreenState();
}

class _LiveP0ChatsScreenState extends State<LiveP0ChatsScreen> {
  final search = TextEditingController();
  List<Map<String, dynamic>> inboxes = const [];
  Map<String, dynamic>? currentUser;
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
    search.dispose();
    super.dispose();
  }

  Future<void> _start() async {
    final realtime = context.services.realtime;
    realtime.on('inbox/find', _onInboxUpdate);
    realtime.on('inbox/preferences', _onInboxUpdate);
    realtime.on('inbox/delete', _onInboxDelete);
    realtime.on('inbox/chat-lock', _onLockUpdate);
    await _load();
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        loading = true;
        error = null;
      });
    }
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

  void _onInboxUpdate(dynamic data) {
    if (!mounted || data is! Map) return;
    final next = Map<String, dynamic>.from(data);
    final roomId = next['roomId']?.toString() ?? '';
    if (roomId.isEmpty) return;
    setState(() {
      final copy = [...inboxes];
      final index = copy.indexWhere((item) => item['roomId']?.toString() == roomId);
      if (index >= 0) {
        copy[index] = next;
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
      inboxes = inboxes.map((item) {
        if (item['roomId']?.toString() != roomId) return item;
        return <String, dynamic>{...item, ...patch};
      }).toList(growable: false);
    });
  }

  List<Map<String, dynamic>> get visibleInboxes {
    final query = search.text.trim().toLowerCase();
    final rows = inboxes.where((inbox) {
      final hidden = _hasUser(inbox['hiddenBy'], currentUserId);
      final pinned = _hasUser(inbox['pinnedBy'], currentUserId);
      final listed = _hasUser(inbox['listedBy'], currentUserId);
      final markedUnread = _hasUser(inbox['markUnreadBy'], currentUserId);
      final unreadCount = (inbox['unreadMessage'] as num?)?.toInt() ?? 0;

      final matchesFilter = switch (filter) {
        'unread' => !hidden && (markedUnread || unreadCount > 0),
        'pinned' => !hidden && pinned,
        'list' => !hidden && listed,
        'hidden' => hidden,
        _ => !hidden,
      };
      if (!matchesFilter) return false;
      if (query.isEmpty) return true;
      return _inboxName(inbox).toLowerCase().contains(query) ||
          _preview(inbox).toLowerCase().contains(query);
    }).toList(growable: false);

    rows.sort((left, right) {
      final leftPinned = _hasUser(left['pinnedBy'], currentUserId);
      final rightPinned = _hasUser(right['pinnedBy'], currentUserId);
      if (leftPinned != rightPinned) return leftPinned ? -1 : 1;
      return _contentTime(right).compareTo(_contentTime(left));
    });
    return rows;
  }

  @override
  Widget build(BuildContext context) {
    const filters = <(String, String)>[
      ('all', 'All'),
      ('unread', 'Unread'),
      ('pinned', 'Pinned'),
      ('list', 'List'),
      ('hidden', 'Hidden'),
    ];

    return SyncStandardPage(
      title: 'Chats',
      actions: [
        IconButton(
          tooltip: 'Menu',
          onPressed: widget.onMenu,
          icon: const Icon(Icons.menu_rounded),
        ),
        IconButton(
          tooltip: 'Mark all read',
          onPressed: _markAllRead,
          icon: const Icon(Icons.done_all_rounded),
        ),
        IconButton(
          tooltip: 'Refresh',
          onPressed: _load,
          icon: const Icon(Icons.refresh_rounded),
        ),
      ],
      child: Column(
        children: [
          Container(
            color: context.panel,
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 9),
            child: Column(
              children: [
                TextField(
                  controller: search,
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(
                    hintText: 'Search chats…',
                    prefixIcon: Icon(Icons.search_rounded),
                  ),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  height: 34,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    children: filters
                        .map(_buildFilterChip)
                        .toList(growable: false),
                  ),
                ),
              ],
            ),
          ),
          Expanded(child: _buildBody()),
        ],
      ),
    );
  }

  Widget _buildFilterChip((String, String) entry) {
    final active = filter == entry.$1;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        label: Text(entry.$2),
        selected: active,
        showCheckmark: false,
        onSelected: (_) => setState(() => filter = entry.$1),
      ),
    );
  }

  Widget _buildBody() {
    if (loading && inboxes.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (error != null && inboxes.isEmpty) {
      return _ErrorState(message: error!, onRetry: _load);
    }

    final items = visibleInboxes;
    return RefreshIndicator(
      onRefresh: _load,
      child: items.isEmpty
          ? ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.only(top: 120),
              children: [
                Icon(
                  filter == 'hidden'
                      ? Icons.visibility_off_outlined
                      : Icons.chat_bubble_outline_rounded,
                  size: 50,
                  color: SyncColors.sky,
                ),
                const SizedBox(height: 10),
                Center(
                  child: Text(
                    filter == 'hidden' ? 'No hidden chats.' : 'No chats found.',
                  ),
                ),
              ],
            )
          : ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: EdgeInsets.only(
                bottom: 116 + MediaQuery.paddingOf(context).bottom,
              ),
              itemCount: items.length,
              separatorBuilder: (_, __) => Divider(
                height: 1,
                indent: 76,
                color: context.border.withValues(alpha: .7),
              ),
              itemBuilder: (context, index) => _buildTile(items[index]),
            ),
    );
  }

  Widget _buildTile(Map<String, dynamic> inbox) {
    final roomId = inbox['roomId']?.toString() ?? '';
    final name = _inboxName(inbox);
    final unread = (inbox['unreadMessage'] as num?)?.toInt() ?? 0;
    final markedUnread = _hasUser(inbox['markUnreadBy'], currentUserId);
    final pinned = _hasUser(inbox['pinnedBy'], currentUserId);
    final listed = _hasUser(inbox['listedBy'], currentUserId);
    final hidden = _hasUser(inbox['hiddenBy'], currentUserId);
    final locked = _hasUser(inbox['chatLockBy'], currentUserId);
    final busy = busyRoomId == roomId;

    return InkWell(
      onTap: busy ? null : () => _openInbox(inbox),
      onLongPress: busy ? null : () => _showActions(inbox),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        child: Row(
          children: [
            SyncAvatar(name: name, radius: 24),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontWeight:
                                unread > 0 || markedUnread ? FontWeight.w900 : FontWeight.w700,
                          ),
                        ),
                      ),
                      if (locked)
                        const Padding(
                          padding: EdgeInsets.only(left: 5),
                          child: Icon(Icons.lock_rounded, size: 15, color: SyncColors.sky),
                        ),
                      if (pinned)
                        const Padding(
                          padding: EdgeInsets.only(left: 5),
                          child: Icon(Icons.push_pin_rounded, size: 15),
                        ),
                      if (listed)
                        const Padding(
                          padding: EdgeInsets.only(left: 5),
                          child: Icon(Icons.format_list_bulleted_rounded, size: 15),
                        ),
                      if (hidden)
                        const Padding(
                          padding: EdgeInsets.only(left: 5),
                          child: Icon(Icons.visibility_off_outlined, size: 15),
                        ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          locked ? 'Locked chat' : _preview(inbox),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: context.muted),
                        ),
                      ),
                      if (busy)
                        const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      else if (unread > 0 || markedUnread)
                        Container(
                          constraints: const BoxConstraints(minWidth: 20, minHeight: 20),
                          padding: const EdgeInsets.symmetric(horizontal: 6),
                          alignment: Alignment.center,
                          decoration: const BoxDecoration(
                            color: SyncColors.sky,
                            shape: BoxShape.circle,
                          ),
                          child: Text(
                            unread > 0 ? '$unread' : '•',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 10,
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
  }

  Future<void> _openInbox(Map<String, dynamic> inbox) async {
    if (_hasUser(inbox['chatLockBy'], currentUserId)) {
      final password = await _askPassword(
        title: 'Unlock chat',
        message: inbox['chatLockScope'] == 'both'
            ? 'Enter the shared chat lock password.'
            : 'Enter your chat lock password.',
        confirmLabel: 'Unlock',
      );
      if (password == null || !mounted) return;
      try {
        final result = await context.services.inbox.verifyChatLock(
          inbox['roomId']?.toString() ?? '',
          password,
        );
        if (result['verified'] != true) {
          _message('Password verification failed.');
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
    final isPrivate = inbox['roomType']?.toString() == 'private';
    final friendId = isPrivate ? _friendId(inbox) : '';
    var blocked = false;
    if (friendId.isNotEmpty) {
      try {
        final state = await context.services.contacts.blockState(friendId);
        blocked = state['youBlocked'] == true;
      } on Object {
        blocked = false;
      }
    }
    if (!mounted) return;

    final archived = _hasUser(inbox['archivedBy'], currentUserId);
    final muted = _hasUser(inbox['mutedBy'], currentUserId);
    final pinned = _hasUser(inbox['pinnedBy'], currentUserId);
    final unread = _hasUser(inbox['markUnreadBy'], currentUserId);
    final favourite = _hasUser(inbox['favouriteBy'], currentUserId);
    final listed = _hasUser(inbox['listedBy'], currentUserId);
    final hidden = _hasUser(inbox['hiddenBy'], currentUserId);
    final locked = _hasUser(inbox['chatLockBy'], currentUserId);
    final shared = locked && inbox['chatLockScope']?.toString() == 'both';
    final sharedOwner = shared && inbox['chatLockOwnerId']?.toString() == currentUserId;

    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheetContext) {
        Widget action({
          required String label,
          required IconData icon,
          required VoidCallback onTap,
          bool danger = false,
          bool enabled = true,
        }) {
          return ListTile(
            enabled: enabled,
            leading: Icon(icon, color: danger ? SyncColors.danger : null),
            title: Text(
              label,
              style: TextStyle(
                fontWeight: FontWeight.w800,
                color: danger ? SyncColors.danger : null,
              ),
            ),
            onTap: !enabled
                ? null
                : () {
                    Navigator.pop(sheetContext);
                    onTap();
                  },
          );
        }

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
                action(
                  label: archived ? 'Unarchive chat' : 'Archive chat',
                  icon: Icons.archive_outlined,
                  onTap: () => _preference(inbox, 'archive', !archived),
                ),
                action(
                  label: muted ? 'Unmute notifications' : 'Mute notifications',
                  icon: muted ? Icons.notifications_active_outlined : Icons.notifications_off_outlined,
                  onTap: () => _preference(inbox, 'mute', !muted),
                ),
                action(
                  label: pinned ? 'Unpin chat' : 'Pin chat',
                  icon: Icons.push_pin_outlined,
                  onTap: () => _preference(inbox, 'pin', !pinned),
                ),
                action(
                  label: unread ? 'Mark as read' : 'Mark as unread',
                  icon: Icons.mark_chat_read_outlined,
                  onTap: () => _preference(inbox, 'markUnread', !unread),
                ),
                action(
                  label: favourite ? 'Remove favourite' : 'Add favourite',
                  icon: favourite ? Icons.star_rounded : Icons.star_border_rounded,
                  onTap: () => _preference(inbox, 'favourite', !favourite),
                ),
                action(
                  label: listed ? 'Remove from list' : 'Add to list',
                  icon: Icons.format_list_bulleted_rounded,
                  onTap: () => _preference(inbox, 'list', !listed),
                ),
                action(
                  label: hidden ? 'Unhide chat' : 'Hide chat',
                  icon: hidden ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                  onTap: () => _preference(inbox, 'hide', !hidden),
                ),
                if (isPrivate) ...[
                  const Divider(),
                  action(
                    label: blocked ? 'Unblock contact' : 'Block contact',
                    icon: Icons.block_rounded,
                    danger: !blocked,
                    onTap: () => _toggleBlock(friendId, blocked),
                  ),
                  if (!locked)
                    action(
                      label: 'Lock chat',
                      icon: Icons.lock_outline_rounded,
                      onTap: () => _createLock(inbox),
                    ),
                  if (locked && (!shared || sharedOwner))
                    action(
                      label: shared ? 'Change shared lock password' : 'Change lock password',
                      icon: Icons.key_rounded,
                      onTap: () => _changeLock(inbox),
                    ),
                  if (locked && (!shared || sharedOwner))
                    action(
                      label: shared ? 'Remove shared lock' : 'Remove chat lock',
                      icon: Icons.lock_open_rounded,
                      onTap: () => _removeLock(inbox),
                    ),
                  if (shared && !sharedOwner)
                    action(
                      label: 'Shared lock managed by the creator',
                      icon: Icons.admin_panel_settings_outlined,
                      enabled: false,
                      onTap: () {},
                    ),
                ],
                const Divider(),
                action(
                  label: 'Clear chat',
                  icon: Icons.cleaning_services_outlined,
                  danger: true,
                  onTap: () => _clearChat(inbox),
                ),
                action(
                  label: 'Delete chat',
                  icon: Icons.delete_outline_rounded,
                  danger: true,
                  onTap: () => _deleteChat(inbox),
                ),
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
      final updated = await context.services.inbox.setPreference(roomId, action, value);
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
        _message('Contact unblocked.');
      } else {
        await context.services.contacts.block(friendId);
        _message('Contact blocked.');
      }
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
      if (!mounted) return;
      _message(result.scope == 'both' ? 'Shared chat lock enabled.' : 'Chat lock enabled.');
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
      if (!mounted) return;
      _message('Chat lock password changed.');
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
      message: inbox['chatLockScope'] == 'both'
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
      if (!mounted) return;
      _message('Chat lock removed.');
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
      if (!mounted) return;
      _message('Chat cleared.');
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
      _message(scope == 'both' ? 'Chat deleted for both participants.' : 'Chat deleted.');
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
                validator: (value) => (value ?? '').isEmpty ? 'Password is required.' : null,
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

  String _inboxName(Map<String, dynamic> inbox) {
    if (inbox['roomType']?.toString() == 'group') {
      final channel = inbox['channel'];
      final group = inbox['group'];
      if (channel is Map && channel['name'] != null) return channel['name'].toString();
      if (group is Map && group['name'] != null) return group['name'].toString();
      return 'Group';
    }
    final owners = inbox['owners'];
    if (owners is List) {
      for (final owner in owners.whereType<Map>()) {
        if (owner['userId']?.toString() == currentUserId) continue;
        return owner['fullname']?.toString() ?? owner['username']?.toString() ?? 'Contact';
      }
    }
    return 'Contact';
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
      title: const Text('Lock chat'),
      content: Form(
        key: formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'self', label: Text('Only me'), icon: Icon(Icons.person_outline_rounded)),
                ButtonSegment(value: 'both', label: Text('Both'), icon: Icon(Icons.group_outlined)),
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
              validator: (value) => (value ?? '').length < 4 ? 'Use at least 4 characters.' : null,
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(
          onPressed: () {
            if (formKey.currentState?.validate() != true) return;
            Navigator.pop(context, _LockCreateResult(scope, password.text));
          },
          child: const Text('Lock'),
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
              validator: (value) => (value ?? '').isEmpty ? 'Current password is required.' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: newPassword,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'New password'),
              validator: (value) => (value ?? '').length < 4 ? 'Use at least 4 characters.' : null,
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(
          onPressed: () {
            if (formKey.currentState?.validate() != true) return;
            Navigator.pop(
              context,
              _LockChangeResult(oldPassword.text, newPassword.text),
            );
          },
          child: const Text('Change'),
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

DateTime _contentTime(Map<String, dynamic> inbox) {
  final content = inbox['content'];
  final raw = content is Map ? content['time'] : null;
  return DateTime.tryParse(raw?.toString() ?? '') ?? DateTime.fromMillisecondsSinceEpoch(0);
}

String _preview(Map<String, dynamic> inbox) {
  final content = inbox['content'];
  if (content is Map) {
    final text = content['text']?.toString() ?? '';
    if (text.isNotEmpty) return text;
  }
  return 'No messages yet';
}

String _errorText(Object failure) {
  if (failure is ApiException) return failure.message;
  return failure.toString().replaceFirst('Exception: ', '');
}
