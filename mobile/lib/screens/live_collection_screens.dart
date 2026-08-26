import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
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

class _LiveInboxCollectionScreenState
    extends State<LiveInboxCollectionScreen> {
  final search = TextEditingController();
  List<Map<String, dynamic>> inboxes = const [];
  Map<String, dynamic>? currentUser;
  bool loading = true;
  String? error;

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

  String get title =>
      widget.kind == LiveInboxCollectionKind.archive ? 'Archive' : 'Lists';

  String get preferenceKey =>
      widget.kind == LiveInboxCollectionKind.archive ? 'archivedBy' : 'listedBy';

  String get preferenceAction =>
      widget.kind == LiveInboxCollectionKind.archive ? 'archive' : 'list';

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        loading = true;
        error = null;
      });
    }
    try {
      final values = await Future.wait<dynamic>([
        context.services.chat.currentUser(),
        context.services.inbox.list(),
      ]);
      if (!mounted) return;
      setState(() {
        currentUser = Map<String, dynamic>.from(values[0] as Map);
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
    final userId = currentUser?['_id']?.toString() ?? '';
    final query = search.text.trim().toLowerCase();
    return inboxes.where((inbox) {
      if (!_containsUser(inbox[preferenceKey], userId)) return false;
      if (query.isEmpty) return true;
      return _name(inbox).toLowerCase().contains(query) ||
          _preview(inbox).toLowerCase().contains(query);
    }).toList(growable: false)
      ..sort((a, b) => _contentTime(b).compareTo(_contentTime(a)));
  }

  Future<void> _remove(Map<String, dynamic> inbox) async {
    final roomId = inbox['roomId']?.toString() ?? '';
    if (roomId.isEmpty) return;
    try {
      await context.services.inbox.updatePreferences(
        roomId,
        {'action': preferenceAction, 'value': false},
      );
      await _load();
    } on Object catch (failure) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_errorText(failure))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.isDark ? SyncColors.spill950 : Colors.white,
      appBar: AppBar(
        title: Text(title),
        actions: [
          IconButton(onPressed: _load, icon: const Icon(Icons.refresh_rounded)),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 8),
            child: TextField(
              controller: search,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                hintText: 'Search ${title.toLowerCase()}...',
                prefixIcon: const Icon(Icons.search_rounded),
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
      return _ErrorState(message: error!, onRetry: _load);
    }
    final items = visible;
    if (items.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                widget.kind == LiveInboxCollectionKind.archive
                    ? Icons.archive_outlined
                    : Icons.format_list_bulleted_rounded,
                size: 54,
                color: SyncColors.sky,
              ),
              const SizedBox(height: 12),
              Text(
                widget.kind == LiveInboxCollectionKind.archive
                    ? 'No archived chats.'
                    : 'No chats in your list.',
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(10, 4, 10, 24),
        itemCount: items.length,
        separatorBuilder: (_, __) => Divider(height: 1, color: context.border),
        itemBuilder: (_, index) {
          final inbox = items[index];
          final name = _name(inbox);
          return ListTile(
            leading: SyncAvatar(name: name),
            title: Text(name, style: const TextStyle(fontWeight: FontWeight.w800)),
            subtitle: Text(
              _preview(inbox),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            trailing: IconButton(
              tooltip: widget.kind == LiveInboxCollectionKind.archive
                  ? 'Unarchive'
                  : 'Remove from list',
              icon: Icon(
                widget.kind == LiveInboxCollectionKind.archive
                    ? Icons.unarchive_outlined
                    : Icons.playlist_remove_rounded,
              ),
              onPressed: () => _remove(inbox),
            ),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => LiveChatRoomScreen(inbox: inbox, name: name),
              ),
            ),
          );
        },
      ),
    );
  }

  String _name(Map<String, dynamic> inbox) {
    final channel = inbox['channel'];
    if (channel is Map && channel['name'] != null) {
      return channel['name'].toString();
    }
    final group = inbox['group'];
    if (group is Map && group['name'] != null) return group['name'].toString();
    final myId = currentUser?['_id']?.toString() ?? '';
    final owners = inbox['owners'];
    if (owners is List) {
      for (final raw in owners.whereType<Map>()) {
        if (raw['userId']?.toString() == myId) continue;
        final fullName = raw['fullname']?.toString().trim() ?? '';
        final username = raw['username']?.toString().trim() ?? '';
        if (fullName.isNotEmpty) return fullName;
        if (username.isNotEmpty) return '@$username';
      }
    }
    return inbox['roomType']?.toString() == 'group' ? 'Group' : 'Contact';
  }
}

class LiveMediaScreen extends StatefulWidget {
  const LiveMediaScreen({super.key});

  @override
  State<LiveMediaScreen> createState() => _LiveMediaScreenState();
}

class _LiveMediaScreenState extends State<LiveMediaScreen> {
  final search = TextEditingController();
  List<Map<String, dynamic>> media = const [];
  List<Map<String, dynamic>> inboxes = const [];
  String filter = 'all';
  bool loading = true;
  String? error;

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
        context.services.chat.listMedia(),
        context.services.inbox.list(),
      ]);
      if (!mounted) return;
      setState(() {
        media = (values[0] as List)
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
    return media.where((item) {
      final file = _file(item);
      final type = file['type']?.toString().toLowerCase() ?? 'document';
      if (filter != 'all' && type != filter) return false;
      if (query.isEmpty) return true;
      final original = file['originalname']?.toString().toLowerCase() ?? '';
      final text = item['text']?.toString().toLowerCase() ?? '';
      final room = _roomTitle(item).toLowerCase();
      return original.contains(query) || text.contains(query) || room.contains(query);
    }).toList(growable: false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.isDark ? SyncColors.spill950 : Colors.white,
      appBar: AppBar(
        title: const Text('Media'),
        actions: [
          IconButton(onPressed: _load, icon: const Icon(Icons.refresh_rounded)),
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
                hintText: 'Search shared media...',
                prefixIcon: Icon(Icons.search_rounded),
              ),
            ),
          ),
          SizedBox(
            height: 42,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              children: const [
                ('all', 'All'),
                ('image', 'Photos'),
                ('video', 'Videos'),
                ('audio', 'Audio'),
                ('document', 'Files'),
              ].map((item) {
                final selected = filter == item.$1;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(item.$2),
                    selected: selected,
                    showCheckmark: false,
                    onSelected: (_) => setState(() => filter = item.$1),
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 6),
          Expanded(child: _body()),
        ],
      ),
    );
  }

  Widget _body() {
    if (loading) return const Center(child: CircularProgressIndicator());
    if (error != null) return _ErrorState(message: error!, onRetry: _load);
    final items = visible;
    if (items.isEmpty) return const Center(child: Text('No shared media found.'));
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(12, 4, 12, 24),
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(height: 8),
        itemBuilder: (_, index) => _MediaTile(
          item: items[index],
          onOpenRoom: () => _openRoom(items[index]),
        ),
      ),
    );
  }

  Future<void> _openRoom(Map<String, dynamic> item) async {
    final roomId = _roomId(item);
    if (roomId.isEmpty) return;
    Map<String, dynamic>? inbox;
    for (final candidate in inboxes) {
      if (candidate['roomId']?.toString() == roomId) {
        inbox = candidate;
        break;
      }
    }
    if (inbox == null) {
      try {
        inbox = await context.services.inbox.findByRoom(roomId);
      } on Object catch (failure) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(_errorText(failure))),
        );
        return;
      }
    }
    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => LiveChatRoomScreen(
          inbox: inbox!,
          name: _roomTitle(item),
        ),
      ),
    );
  }
}

class _MediaTile extends StatelessWidget {
  const _MediaTile({required this.item, required this.onOpenRoom});

  final Map<String, dynamic> item;
  final VoidCallback onOpenRoom;

  @override
  Widget build(BuildContext context) {
    final file = _file(item);
    final type = file['type']?.toString().toLowerCase() ?? 'document';
    final url = file['url']?.toString() ?? '';
    final original = file['originalname']?.toString().trim() ?? '';
    final text = item['text']?.toString().trim() ?? '';
    return SyncSoftCard(
      padding: const EdgeInsets.all(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onOpenRoom,
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: SizedBox(
                width: 64,
                height: 64,
                child: type == 'image' && url.startsWith('http')
                    ? Image.network(
                        url,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => _mediaIcon(type),
                      )
                    : _mediaIcon(type),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    original.isNotEmpty ? original : _mediaLabel(type),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    _roomTitle(item),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: context.muted, fontSize: 12),
                  ),
                  if (text.isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Text(
                      text,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: context.muted, fontSize: 12),
                    ),
                  ],
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded),
          ],
        ),
      ),
    );
  }
}

Widget _mediaIcon(String type) => ColoredBox(
      color: const Color(0x160EA5E9),
      child: Icon(
        switch (type) {
          'video' => Icons.play_circle_outline_rounded,
          'audio' => Icons.graphic_eq_rounded,
          'image' => Icons.image_outlined,
          _ => Icons.insert_drive_file_outlined,
        },
        color: SyncColors.sky,
        size: 30,
      ),
    );

String _mediaLabel(String type) => switch (type) {
      'video' => 'Video',
      'audio' => 'Audio',
      'image' => 'Photo',
      _ => 'Document',
    };

Map<String, dynamic> _file(Map<String, dynamic> item) => item['file'] is Map
    ? Map<String, dynamic>.from(item['file'] as Map)
    : const {};

String _roomId(Map<String, dynamic> item) {
  final direct = item['roomId']?.toString().trim() ?? '';
  if (direct.isNotEmpty) return direct;
  final room = item['room'];
  return room is Map ? room['roomId']?.toString().trim() ?? '' : '';
}

String _roomTitle(Map<String, dynamic> item) {
  final room = item['room'];
  if (room is Map) {
    for (final key in ['title', 'name']) {
      final value = room[key]?.toString().trim() ?? '';
      if (value.isNotEmpty) return value;
    }
  }
  final channel = item['channel'];
  if (channel is Map && channel['name'] != null) return channel['name'].toString();
  final profile = item['profile'];
  if (profile is Map) {
    final name = profile['fullname']?.toString().trim() ?? '';
    final username = profile['username']?.toString().trim() ?? '';
    if (name.isNotEmpty) return name;
    if (username.isNotEmpty) return '@$username';
  }
  return 'Conversation';
}

bool _containsUser(dynamic value, String userId) => value is List &&
    value.map((item) => item.toString()).contains(userId);

String _preview(Map<String, dynamic> inbox) {
  final content = inbox['content'];
  if (content is Map) {
    final text = content['text']?.toString().trim() ?? '';
    if (text.isNotEmpty) return text;
  }
  return 'Open conversation';
}

DateTime _contentTime(Map<String, dynamic> inbox) {
  final content = inbox['content'];
  final value = content is Map ? content['time'] : inbox['updatedAt'];
  return DateTime.tryParse(value?.toString() ?? '') ??
      DateTime.fromMillisecondsSinceEpoch(0);
}

String _errorText(Object failure) {
  if (failure is ApiException) return failure.message;
  return failure.toString().replaceFirst('Exception: ', '');
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
            const Icon(Icons.cloud_off_outlined, size: 48, color: SyncColors.sky),
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
