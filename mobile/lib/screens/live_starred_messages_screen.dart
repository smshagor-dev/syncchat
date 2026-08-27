import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../theme.dart';
import '../widgets.dart';
import 'live_chat_room_screen.dart';

class LiveStarredMessagesScreen extends StatefulWidget {
  const LiveStarredMessagesScreen({super.key});

  @override
  State<LiveStarredMessagesScreen> createState() =>
      _LiveStarredMessagesScreenState();
}

class _LiveStarredMessagesScreenState extends State<LiveStarredMessagesScreen> {
  final search = TextEditingController();
  List<Map<String, dynamic>> messages = const [];
  List<Map<String, dynamic>> inboxes = const [];
  bool loading = true;
  String? error;
  final mutating = <String>{};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        loading = true;
        error = null;
      });
    }
    try {
      final values = await Future.wait<dynamic>([
        context.services.chat.listStarred(),
        context.services.inbox.list(),
      ]);
      if (!mounted) return;
      setState(() {
        messages = (values[0] as List)
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList(growable: false);
        inboxes = (values[1] as List)
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList(growable: false);
        loading = false;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        error = _errorText(failure);
        loading = false;
      });
    }
  }

  List<Map<String, dynamic>> get visible {
    final query = search.text.trim().toLowerCase();
    final items = messages.where((message) {
      if (query.isEmpty) return true;
      return _preview(message).toLowerCase().contains(query) ||
          _roomName(message).toLowerCase().contains(query) ||
          _senderName(message).toLowerCase().contains(query);
    }).toList(growable: false);
    items.sort((a, b) => _timeOf(b).compareTo(_timeOf(a)));
    return items;
  }

  Map<String, dynamic>? _inboxFor(Map<String, dynamic> message) {
    final roomId = message['roomId']?.toString() ?? '';
    if (roomId.isEmpty) return null;
    for (final inbox in inboxes) {
      if (inbox['roomId']?.toString() == roomId) return inbox;
    }
    return null;
  }

  Map<String, dynamic> _roomPayload(Map<String, dynamic> message) {
    final room = message['room'];
    return room is Map
        ? Map<String, dynamic>.from(room)
        : const <String, dynamic>{};
  }

  String _roomName(Map<String, dynamic> message) {
    final canonicalTitle = _roomPayload(message)['title']?.toString().trim() ?? '';
    if (canonicalTitle.isNotEmpty) return canonicalTitle;

    final inbox = _inboxFor(message);
    if (inbox == null) {
      return message['roomType']?.toString() == 'group' ? 'Group' : 'Conversation';
    }
    final channel = inbox['channel'];
    if (channel is Map && channel['name'] != null) {
      return channel['name'].toString();
    }
    final group = inbox['group'];
    if (group is Map && group['name'] != null) {
      return group['name'].toString();
    }
    final owners = inbox['owners'];
    if (owners is List) {
      for (final owner in owners.whereType<Map>()) {
        final fullName = owner['fullname']?.toString().trim() ?? '';
        final username = owner['username']?.toString().trim() ?? '';
        if (fullName.isNotEmpty) return fullName;
        if (username.isNotEmpty) return '@$username';
      }
    }
    return inbox['roomType']?.toString() == 'group' ? 'Group' : 'Conversation';
  }

  String? _roomAvatar(Map<String, dynamic> message) {
    final canonicalAvatar = _roomPayload(message)['avatar']?.toString().trim() ?? '';
    if (canonicalAvatar.isNotEmpty) return canonicalAvatar;

    final inbox = _inboxFor(message);
    if (inbox == null) return null;
    final channel = inbox['channel'];
    if (channel is Map) {
      final avatar = channel['avatar']?.toString().trim() ?? '';
      if (avatar.isNotEmpty) return avatar;
    }
    final group = inbox['group'];
    if (group is Map) {
      final avatar = group['avatar']?.toString().trim() ?? '';
      if (avatar.isNotEmpty) return avatar;
    }
    return null;
  }

  String _senderName(Map<String, dynamic> message) {
    final profile = message['profile'];
    if (profile is Map) {
      final fullName = profile['fullname']?.toString().trim() ?? '';
      final username = profile['username']?.toString().trim() ?? '';
      if (fullName.isNotEmpty) return fullName;
      if (username.isNotEmpty) return '@$username';
    }
    final sender = message['sender'];
    if (sender is Map) {
      final fullName = sender['fullname']?.toString().trim() ?? '';
      final username = sender['username']?.toString().trim() ?? '';
      if (fullName.isNotEmpty) return fullName;
      if (username.isNotEmpty) return '@$username';
    }
    return 'Message';
  }

  String _preview(Map<String, dynamic> message) {
    final text = message['text']?.toString().trim() ?? '';
    if (text.isNotEmpty) return text;
    final file = message['file'];
    if (file is Map) {
      final type = file['type']?.toString().toLowerCase() ?? '';
      final originalName = file['originalname']?.toString().trim() ?? '';
      if (originalName.isNotEmpty) return originalName;
      return switch (type) {
        'image' => 'Photo',
        'video' => 'Video',
        'audio' => 'Voice message',
        _ => 'Attachment',
      };
    }
    return 'Starred message';
  }

  DateTime _timeOf(Map<String, dynamic> message) {
    for (final key in ['createdAt', 'updatedAt', 'timestamp']) {
      final parsed = DateTime.tryParse(message[key]?.toString() ?? '');
      if (parsed != null) return parsed;
    }
    return DateTime.fromMillisecondsSinceEpoch(0);
  }

  Future<void> _unstar(Map<String, dynamic> message) async {
    final chatId = message['_id']?.toString() ?? message['id']?.toString() ?? '';
    if (chatId.isEmpty || mutating.contains(chatId)) return;
    setState(() => mutating.add(chatId));
    try {
      await context.services.chat.toggleStar(chatId, starred: false);
      if (!mounted) return;
      setState(() {
        messages = messages
            .where((item) =>
                (item['_id']?.toString() ?? item['id']?.toString() ?? '') !=
                chatId)
            .toList(growable: false);
      });
    } on Object catch (failure) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(_errorText(failure))));
    } finally {
      if (mounted) setState(() => mutating.remove(chatId));
    }
  }

  void _openRoom(Map<String, dynamic> message) {
    final inbox = _inboxFor(message);
    if (inbox == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('This conversation is no longer available.')),
      );
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => LiveChatRoomScreen(
          inbox: inbox,
          name: _roomName(message),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.page,
      appBar: AppBar(
        title: const Text('Starred messages'),
        backgroundColor: context.panel,
        surfaceTintColor: Colors.transparent,
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: loading ? null : _load,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 8),
            child: TextField(
              controller: search,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                hintText: 'Search starred messages...',
                prefixIcon: Icon(Icons.search_rounded),
              ),
            ),
          ),
          Expanded(child: _body()),
        ],
      ),
    );
  }

  Widget _body() {
    if (loading) return const Center(child: CircularProgressIndicator());
    if (error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off_outlined, size: 48, color: SyncColors.sky),
              const SizedBox(height: 10),
              Text(error!, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: _load,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }

    final items = visible;
    if (items.isEmpty) {
      return RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: const [
            SizedBox(height: 140),
            Icon(Icons.star_border_rounded, size: 56, color: SyncColors.sky),
            SizedBox(height: 12),
            Center(child: Text('No starred messages yet.')),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(10, 4, 10, 28),
        itemCount: items.length,
        separatorBuilder: (_, __) => Divider(height: 1, color: context.border),
        itemBuilder: (_, index) {
          final message = items[index];
          final id = message['_id']?.toString() ?? message['id']?.toString() ?? '';
          final roomName = _roomName(message);
          final sender = _senderName(message);
          return ListTile(
            leading: SyncAvatar(
              name: roomName,
              imageUrl: _roomAvatar(message),
            ),
            title: Text(
              roomName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
            subtitle: Text(
              '$sender · ${_preview(message)}',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            trailing: IconButton(
              tooltip: 'Unstar',
              onPressed: id.isEmpty || mutating.contains(id)
                  ? null
                  : () => _unstar(message),
              icon: mutating.contains(id)
                  ? const SizedBox.square(
                      dimension: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.star_rounded, color: Colors.amber),
            ),
            onTap: () => _openRoom(message),
          );
        },
      ),
    );
  }
}

String _errorText(Object failure) {
  if (failure is ApiException) return failure.message;
  return failure.toString().replaceFirst('Exception: ', '');
}
