import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../core/realtime_client.dart';
import '../theme.dart';
import '../widgets.dart';
import 'live_chat_room_screen.dart';

enum LiveInboxCollectionKind { archive, lists }

class LiveInboxCollectionScreen extends StatefulWidget {
  const LiveInboxCollectionScreen({super.key, required this.kind});

  final LiveInboxCollectionKind kind;

  @override
  State<LiveInboxCollectionScreen> createState() =>
      _LiveInboxCollectionScreenState();
}

class _LiveInboxCollectionScreenState extends State<LiveInboxCollectionScreen> {
  final search = TextEditingController();

  List<Map<String, dynamic>> inboxes = const [];
  List<Map<String, dynamic>> labels = const [];
  Map<String, List<String>> labelsByRoom = const {};
  Map<String, dynamic>? currentUser;
  RealtimeClient? realtime;
  bool loading = true;
  String? error;
  String filter = 'all';
  String labelFilter = '';
  String? busyRoomId;

  String get userId => currentUser?['_id']?.toString() ?? '';
  String get title =>
      widget.kind == LiveInboxCollectionKind.archive ? 'Archive' : 'Lists';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _start());
  }

  @override
  void dispose() {
    realtime?.off('inbox/find', _onInboxUpdate);
    realtime?.off('inbox/preferences', _onInboxUpdate);
    realtime?.off('inbox/delete', _onInboxDelete);
    search.dispose();
    super.dispose();
  }

  Future<void> _start() async {
    realtime = context.services.realtime;
    realtime?.on('inbox/find', _onInboxUpdate);
    realtime?.on('inbox/preferences', _onInboxUpdate);
    realtime?.on('inbox/delete', _onInboxDelete);
    await _load();
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final values = await Future.wait<dynamic>([
        context.services.chat.currentUser(refresh: true),
        context.services.inbox.list(),
        context.services.contacts.labels(),
        context.services.contacts.list(),
      ]);
      final contacts = (values[3] as List)
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList(growable: false);
      final nextLabelsByRoom = <String, List<String>>{};
      for (final contact in contacts) {
        final roomId = contact['roomId']?.toString() ?? '';
        if (roomId.isEmpty) continue;
        final raw = contact['labels'];
        nextLabelsByRoom[roomId] = raw is List
            ? raw.map((item) => item.toString()).toList(growable: false)
            : const [];
      }
      if (!mounted) return;
      setState(() {
        currentUser = Map<String, dynamic>.from(values[0] as Map);
        inboxes = (values[1] as List)
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList(growable: false);
        labels = (values[2] as List)
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList(growable: false);
        labelsByRoom = nextLabelsByRoom;
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
    });
  }

  List<Map<String, dynamic>> get visibleInboxes {
    final query = search.text.trim().toLowerCase();
    final rows = inboxes.where((inbox) {
      if (_contains(inbox['deletedBy'], userId)) return false;
      if (_contains(inbox['hiddenBy'], userId)) return false;
      final archived = _contains(inbox['archivedBy'], userId);
      final listed = _contains(inbox['listedBy'], userId);
      if (widget.kind == LiveInboxCollectionKind.archive) {
        if (!archived) return false;
      } else {
        // Web list mode still applies the normal non-archived inbox filter.
        if (archived || !listed) return false;
      }
      final matchesFilter = switch (filter) {
        'unread' => _hasUnread(inbox),
        'favourite' => _containsAny(inbox, const ['favouriteBy', 'favoriteBy'], userId),
        'group' => inbox['roomType']?.toString() == 'group',
        _ => true,
      };
      if (!matchesFilter) return false;
      if (labelFilter.isNotEmpty) {
        if (inbox['roomType']?.toString() != 'private') return false;
        final roomLabels = labelsByRoom[inbox['roomId']?.toString() ?? ''] ?? const [];
        if (!roomLabels.contains(labelFilter)) return false;
      }
      if (query.isEmpty) return true;
      return '${_name(inbox)} ${_preview(inbox)} ${_senderName(inbox)}'
          .toLowerCase()
          .contains(query);
    }).toList(growable: false);
    rows.sort((a, b) {
      final aPinned = _contains(a['pinnedBy'], userId);
      final bPinned = _contains(b['pinnedBy'], userId);
      if (aPinned != bPinned) return aPinned ? -1 : 1;
      return _contentTime(b).compareTo(_contentTime(a));
    });
    return rows;
  }

  int get unreadCount => visibleInboxes.where(_hasUnread).length;
  int get favouriteCount => visibleInboxes
      .where((item) => _containsAny(item, const ['favouriteBy', 'favoriteBy'], userId))
      .length;
  int get groupCount => visibleInboxes
      .where((item) => item['roomType']?.toString() == 'group')
      .length;

  @override
  Widget build(BuildContext context) {
    return SyncStandardPage(
      title: title,
      actions: [
        IconButton(
          tooltip: 'Refresh',
          onPressed: _load,
          icon: const Icon(Icons.refresh_rounded),
        ),
      ],
      child: Column(
        children: [
          _searchAndFilters(),
          _labelBar(),
          Divider(height: 1, color: context.border),
          Expanded(child: _body()),
        ],
      ),
    );
  }

  Widget _searchAndFilters() {
    final chips = <(String, String)>[
      ('all', 'All'),
      ('unread', 'Unread ($unreadCount)'),
      ('favourite', 'Favourite ($favouriteCount)'),
      ('group', 'Group ($groupCount)'),
    ];
    return Container(
      color: context.panel,
      padding: const EdgeInsets.fromLTRB(12, 9, 12, 8),
      child: Column(
        children: [
          TextField(
            controller: search,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              hintText: 'Search chats...',
              prefixIcon: const Icon(Icons.search_rounded),
              suffixIcon: search.text.isEmpty
                  ? null
                  : IconButton(
                      onPressed: () {
                        search.clear();
                        setState(() {});
                      },
                      icon: const Icon(Icons.close_rounded),
                    ),
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 34,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: chips.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (_, index) {
                final chip = chips[index];
                return ChoiceChip(
                  label: Text(chip.$2),
                  selected: filter == chip.$1,
                  showCheckmark: false,
                  onSelected: (_) => setState(() => filter = chip.$1),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _labelBar() {
    if (labels.isEmpty) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      color: context.panel,
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
      child: SizedBox(
        height: 32,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: labels.length + (labelFilter.isEmpty ? 0 : 1),
          separatorBuilder: (_, __) => const SizedBox(width: 7),
          itemBuilder: (_, index) {
            if (labelFilter.isNotEmpty && index == 0) {
              return ActionChip(
                label: const Text('Clear label'),
                onPressed: () => setState(() => labelFilter = ''),
              );
            }
            final labelIndex = index - (labelFilter.isEmpty ? 0 : 1);
            final label = labels[labelIndex];
            final id = label['_id']?.toString() ?? '';
            return ChoiceChip(
              label: Text(label['name']?.toString() ?? 'Label'),
              selected: labelFilter == id,
              showCheckmark: false,
              onSelected: id.isEmpty
                  ? null
                  : (_) => setState(() => labelFilter = labelFilter == id ? '' : id),
            );
          },
        ),
      ),
    );
  }

  Widget _body() {
    if (loading && inboxes.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (error != null && inboxes.isEmpty) {
      return _CollectionError(message: error!, onRetry: _load);
    }
    final items = visibleInboxes;
    if (items.isEmpty) {
      return RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(top: 120),
          children: [
            Icon(
              widget.kind == LiveInboxCollectionKind.archive
                  ? Icons.archive_outlined
                  : Icons.format_list_bulleted_rounded,
              size: 54,
              color: SyncColors.sky,
            ),
            const SizedBox(height: 12),
            Center(
              child: Text(
                widget.kind == LiveInboxCollectionKind.archive
                    ? 'No archived chats.'
                    : 'No chats in your list.',
              ),
            ),
          ],
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.only(bottom: 24 + MediaQuery.paddingOf(context).bottom),
        itemCount: items.length,
        itemBuilder: (_, index) => _tile(items[index]),
      ),
    );
  }

  Widget _tile(Map<String, dynamic> inbox) {
    final roomId = inbox['roomId']?.toString() ?? '';
    final name = _name(inbox);
    final unread = _hasUnread(inbox);
    final unreadValue = (inbox['unreadMessage'] as num?)?.toInt() ?? 0;
    final pinned = _contains(inbox['pinnedBy'], userId);
    final muted = _contains(inbox['mutedBy'], userId);
    final listed = _contains(inbox['listedBy'], userId);
    final favourite = _containsAny(inbox, const ['favouriteBy', 'favoriteBy'], userId);
    final privateProfile = _privateProfile(inbox);
    return Material(
      color: context.page,
      child: InkWell(
        onTap: busyRoomId == roomId ? null : () => _openInbox(inbox),
        onLongPress: busyRoomId == roomId ? null : () => _showActions(inbox),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: context.border)),
          ),
          child: Row(
            children: [
              SyncAvatar(
                name: name,
                imageUrl: _avatar(inbox),
                radius: 28,
                online: inbox['roomType']?.toString() == 'private' && privateProfile['online'] == true,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        if (inbox['channel'] is Map)
                          const Padding(
                            padding: EdgeInsets.only(right: 4),
                            child: Icon(Icons.podcasts_rounded, size: 14, color: SyncColors.sky),
                          ),
                        Expanded(
                          child: Text(
                            name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 17,
                              fontWeight: unread ? FontWeight.w700 : FontWeight.w500,
                            ),
                          ),
                        ),
                        if (pinned)
                          const Padding(
                            padding: EdgeInsets.only(left: 5),
                            child: Icon(Icons.push_pin_outlined, size: 14, color: SyncColors.sky),
                          ),
                        if (muted)
                          Padding(
                            padding: const EdgeInsets.only(left: 5),
                            child: Icon(Icons.notifications_off_outlined, size: 14, color: context.muted),
                          ),
                        const SizedBox(width: 6),
                        Text(
                          _fromNow(_contentTime(inbox)),
                          style: TextStyle(color: context.muted, fontSize: 11),
                        ),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            _preview(inbox),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(color: context.muted, fontSize: 13),
                          ),
                        ),
                        if (favourite)
                          const Padding(
                            padding: EdgeInsets.only(left: 6),
                            child: Icon(Icons.star_rounded, size: 15, color: Color(0xFFF59E0B)),
                          ),
                        if (listed)
                          const Padding(
                            padding: EdgeInsets.only(left: 5),
                            child: Icon(Icons.format_list_bulleted_rounded, size: 14, color: SyncColors.sky),
                          ),
                        if (unread) ...[
                          const SizedBox(width: 7),
                          Container(
                            constraints: const BoxConstraints(minWidth: 20, minHeight: 20),
                            padding: const EdgeInsets.symmetric(horizontal: 5),
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: SyncColors.sky600,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text(
                              '${unreadValue > 0 ? unreadValue : 1}',
                              style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700),
                            ),
                          ),
                        ],
                        const SizedBox(width: 2),
                        PopupMenuButton<String>(
                          tooltip: 'Chat actions',
                          onSelected: (value) => _runAction(inbox, value),
                          itemBuilder: (_) => _menuItems(inbox),
                          icon: Icon(Icons.more_vert_rounded, size: 17, color: context.muted),
                        ),
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

  List<PopupMenuEntry<String>> _menuItems(Map<String, dynamic> inbox) {
    final archived = _contains(inbox['archivedBy'], userId);
    final muted = _contains(inbox['mutedBy'], userId);
    final pinned = _contains(inbox['pinnedBy'], userId);
    final manualUnread = _contains(inbox['markUnreadBy'], userId);
    final favourite = _containsAny(inbox, const ['favouriteBy', 'favoriteBy'], userId);
    final listed = _contains(inbox['listedBy'], userId);
    return [
      PopupMenuItem(
        value: 'archive',
        child: Text(archived ? 'Unarchive chat' : 'Archive chat'),
      ),
      PopupMenuItem(
        value: 'mute',
        child: Text(muted ? 'Unmute notification' : 'Mute notification'),
      ),
      PopupMenuItem(value: 'pin', child: Text(pinned ? 'Unpin chat' : 'Pin chat')),
      PopupMenuItem(
        value: 'unread',
        child: Text(manualUnread ? 'Mark as read' : 'Mark as unread'),
      ),
      PopupMenuItem(
        value: 'favourite',
        child: Text(favourite ? 'Remove from favourite' : 'Add to favourite'),
      ),
      PopupMenuItem(
        value: 'list',
        child: Text(listed ? 'Remove from list' : 'Add to list'),
      ),
    ];
  }

  Future<void> _showActions(Map<String, dynamic> inbox) async {
    final entries = _menuItems(inbox).whereType<PopupMenuItem<String>>().toList();
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 10),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(_name(inbox), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
              ),
            ),
            ...entries.map(
              (entry) => ListTile(
                title: entry.child,
                onTap: () {
                  Navigator.pop(sheetContext);
                  if (entry.value != null) _runAction(inbox, entry.value!);
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _runAction(Map<String, dynamic> inbox, String action) async {
    final mapping = <String, (String, bool)>{
      'archive': ('archive', !_contains(inbox['archivedBy'], userId)),
      'mute': ('mute', !_contains(inbox['mutedBy'], userId)),
      'pin': ('pin', !_contains(inbox['pinnedBy'], userId)),
      'unread': ('markUnread', !_contains(inbox['markUnreadBy'], userId)),
      'favourite': ('favourite', !_containsAny(inbox, const ['favouriteBy', 'favoriteBy'], userId)),
      'list': ('list', !_contains(inbox['listedBy'], userId)),
    };
    final next = mapping[action];
    if (next == null) return;
    final roomId = inbox['roomId']?.toString() ?? '';
    if (roomId.isEmpty) return;
    setState(() => busyRoomId = roomId);
    try {
      final updated = await context.services.inbox.setPreference(roomId, next.$1, next.$2);
      if (!mounted) return;
      if (updated.isNotEmpty) _onInboxUpdate(updated);
      await _load();
    } on Object catch (failure) {
      if (mounted) _snack(_errorText(failure));
    } finally {
      if (mounted) setState(() => busyRoomId = null);
    }
  }

  Future<void> _openInbox(Map<String, dynamic> inbox) async {
    final roomId = inbox['roomId']?.toString() ?? '';
    if (roomId.isEmpty) return;
    if (_chatLocked(inbox)) {
      final password = await _passwordDialog();
      if (password == null || !mounted) return;
      try {
        final result = await context.services.inbox.verifyChatLock(roomId, password);
        if (result['verified'] != true) {
          _snack('Invalid password');
          return;
        }
      } on Object catch (failure) {
        if (mounted) _snack(_errorText(failure));
        return;
      }
    }
    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => LiveChatRoomScreen(inbox: inbox, name: _name(inbox)),
      ),
    );
    if (mounted) await _load();
  }

  Future<String?> _passwordDialog() async {
    final controller = TextEditingController();
    final value = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Enter Chat Password'),
        content: TextField(
          controller: controller,
          autofocus: true,
          obscureText: true,
          decoration: const InputDecoration(labelText: 'Password'),
          onSubmitted: (text) {
            if (text.isNotEmpty) Navigator.pop(dialogContext, text);
          },
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              if (controller.text.isNotEmpty) Navigator.pop(dialogContext, controller.text);
            },
            child: const Text('Unlock'),
          ),
        ],
      ),
    );
    controller.dispose();
    return value;
  }

  void _snack(String text) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(text), behavior: SnackBarBehavior.floating),
    );
  }

  Map<String, dynamic> _privateProfile(Map<String, dynamic> inbox) {
    final owners = inbox['owners'];
    if (owners is! List) return const {};
    for (final item in owners.whereType<Map>()) {
      if (item['userId']?.toString() == userId) continue;
      return Map<String, dynamic>.from(item);
    }
    return const {};
  }

  String _name(Map<String, dynamic> inbox) {
    final channel = inbox['channel'];
    if (channel is Map && (channel['name']?.toString() ?? '').isNotEmpty) {
      return channel['name'].toString();
    }
    final group = inbox['group'];
    if (group is Map && (group['name']?.toString() ?? '').isNotEmpty) {
      return group['name'].toString();
    }
    final profile = _privateProfile(inbox);
    final full = profile['fullname']?.toString().trim() ?? '';
    if (full.isNotEmpty) return full;
    final username = profile['username']?.toString().trim() ?? '';
    return username.isNotEmpty ? '@$username' : '[inactive]';
  }

  String? _avatar(Map<String, dynamic> inbox) {
    final channel = inbox['channel'];
    if (channel is Map) return channel['avatar']?.toString();
    final group = inbox['group'];
    if (group is Map) return group['avatar']?.toString();
    return _privateProfile(inbox)['avatar']?.toString();
  }

  String _senderName(Map<String, dynamic> inbox) {
    final content = inbox['content'];
    if (content is Map) {
      final value = content['senderName']?.toString().trim() ?? '';
      if (value.isNotEmpty) return value;
    }
    return '';
  }

  String _preview(Map<String, dynamic> inbox) {
    if (_chatLocked(inbox)) return 'Locked chat';
    final content = inbox['content'];
    if (content is! Map) return 'No messages yet';
    final file = content['file'];
    final text = content['text']?.toString().trim() ?? '';
    if (file is Map) {
      final type = file['type']?.toString().toLowerCase();
      if (type == 'image') return text.isEmpty ? 'Photo' : 'Photo · $text';
      if (type == 'video') return text.isEmpty ? 'Video' : 'Video · $text';
      if (type == 'audio') return text.isEmpty ? 'Voice message' : 'Voice · $text';
      final filename = file['originalname']?.toString().trim() ?? '';
      return filename.isEmpty ? 'Document' : filename;
    }
    if (text.startsWith('__poll__::') || RegExp(r'^poll\s*:', caseSensitive: false).hasMatch(text)) {
      return 'Poll';
    }
    if (text.startsWith('__event__::')) return 'Event';
    if (text.toLowerCase().contains('maps.google.com/?q=')) return 'Location';
    return text.isEmpty ? 'No messages yet' : text;
  }

  bool _hasUnread(Map<String, dynamic> inbox) {
    if (_contains(inbox['markUnreadBy'], userId)) return true;
    final content = inbox['content'];
    final from = content is Map ? content['from']?.toString() ?? '' : '';
    return from != userId && ((inbox['unreadMessage'] as num?)?.toInt() ?? 0) > 0;
  }

  bool _chatLocked(Map<String, dynamic> inbox) {
    if (inbox['chatLocked'] == true || inbox['isChatLocked'] == true) return true;
    return _contains(inbox['chatLockedBy'], userId) || _contains(inbox['lockedBy'], userId);
  }
}

class LiveMediaScreen extends StatefulWidget {
  const LiveMediaScreen({
    super.key,
    this.roomId,
    this.title,
    this.initialTab = 'media',
  });

  final String? roomId;
  final String? title;
  final String initialTab;

  @override
  State<LiveMediaScreen> createState() => _LiveMediaScreenState();
}

class _LiveMediaScreenState extends State<LiveMediaScreen> {
  List<Map<String, dynamic>> items = const [];
  bool loading = true;
  bool allowDownload = true;
  String? error;
  late String tab;
  String? downloadingId;

  String get roomId => widget.roomId?.trim() ?? '';

  @override
  void initState() {
    super.initState();
    tab = const {'media', 'link', 'file'}.contains(widget.initialTab)
        ? widget.initialTab
        : 'media';
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final futures = <Future<dynamic>>[
        context.services.chat.listMedia(roomId: roomId.isEmpty ? null : roomId),
        if (roomId.isNotEmpty) context.services.inbox.findByRoom(roomId),
      ];
      final values = await Future.wait<dynamic>(futures);
      final mediaRows = (values[0] as List)
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList(growable: false);
      var downloadsAllowed = true;
      if (roomId.isNotEmpty && values.length > 1 && values[1] is Map) {
        final inbox = Map<String, dynamic>.from(values[1] as Map);
        final blocked = inbox['roomType']?.toString() == 'private' &&
            inbox['secretChatEnabled'] == true &&
            inbox['secretSaveBlocked'] != false;
        downloadsAllowed = !blocked;
      }
      if (!mounted) return;
      setState(() {
        items = mediaRows;
        allowDownload = downloadsAllowed;
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

  List<Map<String, dynamic>> get filtered => items.where((item) {
        final kind = item['kind']?.toString() ?? '';
        if (tab == 'media') return kind == 'photo' || kind == 'video';
        return kind == tab;
      }).toList(growable: false)
        ..sort((a, b) => _itemTime(b).compareTo(_itemTime(a)));

  Map<String, List<Map<String, dynamic>>> get grouped {
    final result = <String, List<Map<String, dynamic>>>{};
    for (final item in filtered) {
      final key = _monthLabel(_itemTime(item));
      result.putIfAbsent(key, () => <Map<String, dynamic>>[]).add(item);
    }
    return result;
  }

  @override
  Widget build(BuildContext context) {
    final pageTitle = (widget.title?.trim().isNotEmpty ?? false)
        ? '${widget.title!.trim()} media'
        : 'Media';
    return SyncStandardPage(
      title: pageTitle,
      actions: [
        IconButton(onPressed: _load, icon: const Icon(Icons.refresh_rounded)),
      ],
      child: Column(
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
            decoration: BoxDecoration(
              color: context.panel,
              border: Border(bottom: BorderSide(color: context.border)),
            ),
            child: Row(
              children: [
                _tab('media', 'Media'),
                const SizedBox(width: 8),
                _tab('link', 'Links'),
                const SizedBox(width: 8),
                _tab('file', 'Docs'),
              ],
            ),
          ),
          if (!allowDownload)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
              color: SyncColors.danger.withValues(alpha: .08),
              child: const Text(
                'Saving is disabled for this secret chat.',
                style: TextStyle(color: SyncColors.danger, fontSize: 12, fontWeight: FontWeight.w700),
              ),
            ),
          Expanded(child: _body()),
        ],
      ),
    );
  }

  Widget _tab(String value, String label) {
    final selected = tab == value;
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      showCheckmark: false,
      onSelected: (_) => setState(() => tab = value),
    );
  }

  Widget _body() {
    if (loading) return const Center(child: CircularProgressIndicator());
    if (error != null) return _CollectionError(message: error!, onRetry: _load);
    if (filtered.isEmpty) {
      return Center(child: Text('No $tab found yet.'));
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 28),
        children: [
          for (final entry in grouped.entries) ...[
            Text(
              entry.key.toUpperCase(),
              style: TextStyle(
                color: context.muted,
                fontSize: 11,
                fontWeight: FontWeight.w900,
                letterSpacing: 1.1,
              ),
            ),
            const SizedBox(height: 8),
            if (tab == 'media') _mediaGrid(entry.value),
            if (tab == 'link') ...entry.value.map(_linkCard),
            if (tab == 'file') ...entry.value.map(_fileCard),
            const SizedBox(height: 18),
          ],
        ],
      ),
    );
  }

  Widget _mediaGrid(List<Map<String, dynamic>> monthItems) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth >= 520 ? 3 : 2;
        return GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: monthItems.length,
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: columns,
            crossAxisSpacing: 10,
            mainAxisSpacing: 10,
            childAspectRatio: .90,
          ),
          itemBuilder: (_, index) {
            final item = monthItems[index];
            final kind = item['kind']?.toString() ?? '';
            final file = _map(item['file']);
            final url = context.services.config.resolveMediaUrl(file['url']?.toString());
            return Card(
              clipBehavior: Clip.antiAlias,
              color: context.panel,
              elevation: 0,
              shape: RoundedRectangleBorder(
                side: BorderSide(color: context.border),
                borderRadius: BorderRadius.circular(10),
              ),
              child: InkWell(
                onTap: url.isEmpty
                    ? null
                    : () => kind == 'photo'
                        ? _openPhoto(url)
                        : _openWeb('Video', url),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(
                      child: kind == 'photo' && url.isNotEmpty
                          ? Image.network(
                              url,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => _mediaPlaceholder(kind),
                            )
                          : Stack(
                              fit: StackFit.expand,
                              children: [
                                _mediaPlaceholder(kind),
                                if (kind == 'video')
                                  const Center(
                                    child: CircleAvatar(
                                      backgroundColor: Colors.black54,
                                      child: Icon(Icons.play_arrow_rounded, color: Colors.white),
                                    ),
                                  ),
                              ],
                            ),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                      child: Text(
                        _fromNow(_itemTime(item)),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: context.muted, fontSize: 11),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  Widget _linkCard(Map<String, dynamic> item) {
    final raw = item['url']?.toString().trim() ?? '';
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Card(
        color: context.panel,
        elevation: 0,
        shape: RoundedRectangleBorder(
          side: BorderSide(color: context.border),
          borderRadius: BorderRadius.circular(10),
        ),
        child: ListTile(
          leading: const Icon(Icons.link_rounded, color: SyncColors.sky),
          title: Text(raw, maxLines: 2, overflow: TextOverflow.ellipsis),
          subtitle: Text(_fromNow(_itemTime(item))),
          onTap: raw.isEmpty ? null : () => _openWeb('Link', raw),
        ),
      ),
    );
  }

  Widget _fileCard(Map<String, dynamic> item) {
    final file = _map(item['file']);
    final rawUrl = file['url']?.toString() ?? '';
    final url = context.services.config.resolveMediaUrl(rawUrl);
    final filename = file['originalname']?.toString().trim().isNotEmpty == true
        ? file['originalname'].toString()
        : 'Document';
    final id = item['_id']?.toString() ?? url;
    final downloading = downloadingId == id;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Card(
        color: context.panel,
        elevation: 0,
        shape: RoundedRectangleBorder(
          side: BorderSide(color: context.border),
          borderRadius: BorderRadius.circular(10),
        ),
        child: ListTile(
          leading: const Icon(Icons.insert_drive_file_outlined),
          title: Text(filename, maxLines: 1, overflow: TextOverflow.ellipsis),
          subtitle: Text(_fromNow(_itemTime(item))),
          onTap: url.isEmpty ? null : () => _openWeb(filename, url),
          trailing: !allowDownload || url.isEmpty
              ? null
              : IconButton(
                  tooltip: 'Download',
                  onPressed: downloading ? null : () => _download(item, url, filename),
                  icon: downloading
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.download_rounded),
                ),
        ),
      ),
    );
  }

  Future<void> _openPhoto(String url) async {
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => Dialog.fullscreen(
        backgroundColor: Colors.black,
        child: SafeArea(
          child: Stack(
            children: [
              Positioned.fill(
                child: InteractiveViewer(
                  minScale: .8,
                  maxScale: 5,
                  child: Center(
                    child: Image.network(
                      url,
                      fit: BoxFit.contain,
                      errorBuilder: (_, __, ___) => const Icon(
                        Icons.broken_image_outlined,
                        color: Colors.white,
                        size: 50,
                      ),
                    ),
                  ),
                ),
              ),
              Positioned(
                top: 8,
                left: 8,
                child: IconButton.filledTonal(
                  onPressed: () => Navigator.pop(dialogContext),
                  icon: const Icon(Icons.close_rounded),
                ),
              ),
              if (allowDownload)
                Positioned(
                  top: 8,
                  right: 8,
                  child: IconButton.filledTonal(
                    onPressed: () {
                      Navigator.pop(dialogContext);
                      _download(
                        {'_id': url, 'file': {'url': url}},
                        url,
                        _filenameFromUrl(url, fallback: 'photo.jpg'),
                      );
                    },
                    icon: const Icon(Icons.download_rounded),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _openWeb(String title, String raw) async {
    final uri = Uri.tryParse(raw);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      _snack('Invalid URL.');
      return;
    }
    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => _MediaWebPage(title: title, uri: uri)),
    );
  }

  Future<void> _download(
    Map<String, dynamic> item,
    String url,
    String filename,
  ) async {
    if (!allowDownload) {
      _snack('Saving is disabled for this secret chat.');
      return;
    }
    final id = item['_id']?.toString() ?? url;
    setState(() => downloadingId = id);
    try {
      final response = await http.get(Uri.parse(url));
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw ApiException(
          statusCode: response.statusCode,
          message: 'Download failed (${response.statusCode}).',
        );
      }
      final dir = await getApplicationDocumentsDirectory();
      final mediaDir = Directory('${dir.path}${Platform.pathSeparator}SyncChat${Platform.pathSeparator}Media');
      await mediaDir.create(recursive: true);
      final safe = _safeFilename(filename);
      final target = File('${mediaDir.path}${Platform.pathSeparator}$safe');
      await target.writeAsBytes(response.bodyBytes, flush: true);
      if (mounted) _snack('Saved to ${target.path}');
    } on Object catch (failure) {
      if (mounted) _snack(_errorText(failure));
    } finally {
      if (mounted) setState(() => downloadingId = null);
    }
  }

  void _snack(String text) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(text), behavior: SnackBarBehavior.floating),
    );
  }
}

class _MediaWebPage extends StatefulWidget {
  const _MediaWebPage({required this.title, required this.uri});

  final String title;
  final Uri uri;

  @override
  State<_MediaWebPage> createState() => _MediaWebPageState();
}

class _MediaWebPageState extends State<_MediaWebPage> {
  late final WebViewController controller;

  @override
  void initState() {
    super.initState();
    controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..loadRequest(widget.uri);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: WebViewWidget(controller: controller),
    );
  }
}

class _CollectionError extends StatelessWidget {
  const _CollectionError({required this.message, required this.onRetry});

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

Map<String, dynamic> _map(dynamic value) =>
    value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

bool _contains(dynamic value, String id) =>
    id.isNotEmpty && value is List && value.map((item) => item.toString()).contains(id);

bool _containsAny(
  Map<String, dynamic> item,
  List<String> keys,
  String id,
) => keys.any((key) => _contains(item[key], id));

DateTime _contentTime(Map<String, dynamic> inbox) {
  final content = inbox['content'];
  final raw = content is Map
      ? content['time'] ?? content['createdAt']
      : inbox['updatedAt'] ?? inbox['createdAt'];
  return DateTime.tryParse(raw?.toString() ?? '') ?? DateTime.fromMillisecondsSinceEpoch(0);
}

DateTime _itemTime(Map<String, dynamic> item) =>
    DateTime.tryParse(item['createdAt']?.toString() ?? '') ??
    DateTime.fromMillisecondsSinceEpoch(0);

String _monthLabel(DateTime time) {
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  if (time.year <= 1970) return 'Unknown date';
  return '${months[time.month - 1]} ${time.year}';
}

String _fromNow(DateTime time) {
  if (time.year <= 1970) return '';
  final diff = DateTime.now().difference(time.toLocal());
  if (diff.isNegative || diff.inMinutes < 1) return 'now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m';
  if (diff.inHours < 24) return '${diff.inHours}h';
  if (diff.inDays < 7) return '${diff.inDays}d';
  return '${time.day}/${time.month}/${time.year}';
}

Widget _mediaPlaceholder(String kind) => ColoredBox(
      color: const Color(0x160EA5E9),
      child: Icon(
        kind == 'video' ? Icons.play_circle_outline_rounded : Icons.image_outlined,
        color: SyncColors.sky,
        size: 40,
      ),
    );

String _safeFilename(String value) {
  final cleaned = value.trim().replaceAll(RegExp(r'[\\/:*?"<>|]'), '_');
  return cleaned.isEmpty ? 'syncchat-file' : cleaned;
}

String _filenameFromUrl(String raw, {required String fallback}) {
  final uri = Uri.tryParse(raw);
  if (uri == null || uri.pathSegments.isEmpty) return fallback;
  final value = uri.pathSegments.last.trim();
  return value.isEmpty ? fallback : value;
}

String _errorText(Object failure) {
  if (failure is ApiException) return failure.message;
  return failure.toString().replaceFirst('Exception: ', '');
}
