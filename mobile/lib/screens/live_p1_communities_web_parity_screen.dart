import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../core/permission_manager.dart';
import '../theme.dart';
import '../widgets.dart';
import 'live_chat_room_screen.dart';

class LiveP1CommunitiesScreen extends StatefulWidget {
  const LiveP1CommunitiesScreen({super.key});

  @override
  State<LiveP1CommunitiesScreen> createState() => _LiveP1CommunitiesScreenState();
}

class _LiveP1CommunitiesScreenState extends State<LiveP1CommunitiesScreen> {
  final Map<String, List<Map<String, dynamic>>> expandedChats = {};
  final Set<String> expanded = <String>{};
  final Set<String> loadingChats = <String>{};
  List<Map<String, dynamic>> communities = const [];
  bool loading = true;
  bool creating = false;
  String? error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final rows = await context.services.communities.list();
      if (!mounted) return;
      setState(() {
        communities = rows;
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

  Future<void> _createCommunity() async {
    setState(() => creating = !creating);
  }

  Future<void> _toggleChats(Map<String, dynamic> community) async {
    final id = community['_id']?.toString() ?? '';
    if (id.isEmpty || loadingChats.contains(id)) return;
    if (expanded.contains(id)) {
      setState(() => expanded.remove(id));
      return;
    }
    if (expandedChats.containsKey(id)) {
      setState(() => expanded.add(id));
      return;
    }
    setState(() => loadingChats.add(id));
    try {
      final rows = await context.services.communities.chats(id);
      if (!mounted) return;
      setState(() {
        expandedChats[id] = rows;
        expanded.add(id);
      });
    } on Object catch (failure) {
      if (mounted) _snack(_errorText(failure));
    } finally {
      if (mounted) setState(() => loadingChats.remove(id));
    }
  }

  Future<void> _openGroupCreator(Map<String, dynamic> community) async {
    final created = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (_) => LiveCreateCommunityGroupScreen(community: community),
      ),
    );
    if (created != true || !mounted) return;
    final id = community['_id']?.toString() ?? '';
    if (id.isNotEmpty) {
      try {
        expandedChats[id] = await context.services.communities.chats(id);
        expanded.add(id);
      } on Object {
        // The full reload below is authoritative.
      }
    }
    await _load();
  }

  Future<void> _openCommunityChat(Map<String, dynamic> chat) async {
    final roomId = chat['roomId']?.toString() ?? '';
    final group = _map(chat['group']);
    if (roomId.isEmpty || group.isEmpty) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => LiveChatRoomScreen(
          inbox: {
            ...chat,
            'roomId': roomId,
            'roomType': 'group',
            'group': group,
          },
          name: group['name']?.toString() ?? 'Group',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SyncStandardPage(
      title: 'Communities',
      actions: [
        FilledButton(
          onPressed: _createCommunity,
          child: Text(creating ? 'Close' : 'Create New'),
        ),
      ],
      child: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: EdgeInsets.fromLTRB(
            12,
            10,
            12,
            116 + MediaQuery.paddingOf(context).bottom,
          ),
          children: [
            if (creating)
              _CommunityCreateCard(
                onCreated: () async {
                  if (!mounted) return;
                  setState(() => creating = false);
                  await _load();
                },
              ),
            if (error != null) ...[
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Text(error!, style: const TextStyle(color: SyncColors.danger)),
              ),
            ],
            if (loading && communities.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 90),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (communities.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 90),
                child: Column(
                  children: [
                    Icon(Icons.groups_2_outlined, size: 54, color: SyncColors.sky),
                    SizedBox(height: 12),
                    Text('No community yet', style: TextStyle(fontWeight: FontWeight.w800)),
                    SizedBox(height: 5),
                    Text('Create New Community to start grouped chats.'),
                  ],
                ),
              )
            else
              ...communities.map(_communityCard),
          ],
        ),
      ),
    );
  }

  Widget _communityCard(Map<String, dynamic> community) {
    final id = community['_id']?.toString() ?? '';
    final name = community['name']?.toString() ?? 'Community';
    final total = (community['totalChats'] as num?)?.toInt() ?? 0;
    final unreadTotal = (community['unreadTotal'] as num?)?.toInt() ?? 0;
    final isExpanded = expanded.contains(id);
    final chats = isExpanded
        ? (expandedChats[id] ?? const <Map<String, dynamic>>[])
        : _list(community['previewChats']);
    final unreadRooms = chats.where((chat) => chat['unreadRooms'] == true).length;

    return Card(
      color: context.panel,
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(color: context.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            color: context.softPanel,
            child: Row(
              children: [
                SyncAvatar(
                  name: name,
                  imageUrl: community['avatar']?.toString(),
                  radius: 26,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(name, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
                      Text('$total chats', style: TextStyle(fontSize: 12, color: context.muted)),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: SyncColors.success.withValues(alpha: .12),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    'unread $unreadTotal',
                    style: const TextStyle(
                      color: SyncColors.success,
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              children: [
                Text('Community actions', style: TextStyle(fontSize: 12, color: context.muted)),
                const Spacer(),
                FilledButton.icon(
                  onPressed: () => _openGroupCreator(community),
                  icon: const Icon(Icons.add_rounded, size: 17),
                  label: const Text('New Group'),
                ),
              ],
            ),
          ),
          Divider(height: 1, color: context.border),
          if (chats.isEmpty)
            const Padding(
              padding: EdgeInsets.all(14),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text('No chats found in this community.'),
              ),
            )
          else
            ...chats.map((chat) {
              final group = _map(chat['group']);
              final content = _map(chat['content']);
              final sender = (content['senderName'] ?? chat['senderName'] ?? '').toString();
              final text = content['text']?.toString() ?? '';
              final relativeTime = _relativeTime(content['time']);
              final unread = chat['unreadRooms'] == true;
              final unreadCount = (chat['unreadMessage'] as num?)?.toInt() ?? 0;
              return ListTile(
                dense: true,
                title: Text(
                  group['name']?.toString() ?? 'Group',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                subtitle: Text(
                  sender.isEmpty ? text : '$sender: $text',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                trailing: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    if (relativeTime.isNotEmpty)
                      Text(
                        relativeTime,
                        style: TextStyle(fontSize: 11, color: context.muted),
                      ),
                    if (unread) ...[
                      if (relativeTime.isNotEmpty) const SizedBox(height: 4),
                      CircleAvatar(
                        radius: 10,
                        backgroundColor: SyncColors.sky,
                        child: Text(
                          '${unreadCount > 0 ? unreadCount : 1}',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                onTap: () => _openCommunityChat(chat),
              );
            }),
          Divider(height: 1, color: context.border),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'Showing ${chats.length} ${isExpanded ? 'all' : 'preview'} chats',
                    style: TextStyle(fontSize: 12, color: context.muted),
                  ),
                ),
                TextButton(
                  onPressed: loadingChats.contains(id) ? null : () => _toggleChats(community),
                  child: Text(
                    loadingChats.contains(id)
                        ? 'Loading...'
                        : isExpanded
                            ? 'Show less'
                            : 'View all',
                  ),
                ),
              ],
            ),
          ),
          if (!isExpanded && unreadRooms >= 3)
            const Padding(
              padding: EdgeInsets.fromLTRB(12, 0, 12, 10),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Showing unread top 3 chats.',
                  style: TextStyle(color: SyncColors.success, fontSize: 11),
                ),
              ),
            ),
        ],
      ),
    );
  }

  void _snack(String text) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(text), behavior: SnackBarBehavior.floating),
    );
  }
}

class _CommunityCreateCard extends StatefulWidget {
  const _CommunityCreateCard({required this.onCreated});

  final Future<void> Function() onCreated;

  @override
  State<_CommunityCreateCard> createState() => _CommunityCreateCardState();
}

class _CommunityCreateCardState extends State<_CommunityCreateCard> {
  final name = TextEditingController();
  final picker = ImagePicker();
  String? avatarDataUri;
  bool saving = false;
  String? error;

  @override
  void dispose() {
    name.dispose();
    super.dispose();
  }

  Future<void> _pickAvatar() async {
    final allowed = await AppPermissionManager.ensurePhotos(
      context,
      reason: 'Photo permission is needed to choose a community image.',
    );
    if (!allowed || !mounted) return;
    final image = await picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 90,
      maxWidth: 1400,
      maxHeight: 1400,
    );
    if (image == null || !mounted) return;
    try {
      final bytes = await image.readAsBytes();
      final max = context.services.config.avatarUploadLimitMb * 1024 * 1024;
      if (bytes.length >= max) {
        setState(() => error = 'Image too large (max ${context.services.config.avatarUploadLimitMb} MB)');
        return;
      }
      setState(() {
        avatarDataUri = 'data:${_imageMime(image.name)};base64,${base64Encode(bytes)}';
        error = null;
      });
    } on Object catch (failure) {
      if (mounted) setState(() => error = _errorText(failure));
    }
  }

  Future<void> _submit() async {
    final value = name.text.trim();
    if (value.length < 3 || value.length > 64) {
      setState(() => error = 'Community name must be between 3 and 64 characters.');
      return;
    }
    setState(() {
      saving = true;
      error = null;
    });
    try {
      await context.services.communities.create({
        'name': value,
        if (avatarDataUri != null) 'avatar': avatarDataUri,
      });
      if (!mounted) return;
      await widget.onCreated();
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        saving = false;
        error = _errorText(failure);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      color: context.softPanel,
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                InkWell(
                  onTap: saving ? null : _pickAvatar,
                  borderRadius: BorderRadius.circular(18),
                  child: Container(
                    width: 64,
                    height: 64,
                    clipBehavior: Clip.antiAlias,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(18),
                      color: context.panel,
                      border: Border.all(color: context.border),
                    ),
                    child: avatarDataUri == null
                        ? const Icon(Icons.camera_alt_outlined)
                        : Image.memory(
                            base64Decode(avatarDataUri!.split(',').last),
                            fit: BoxFit.cover,
                          ),
                  ),
                ),
                const SizedBox(width: 12),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Create New Community', style: TextStyle(fontWeight: FontWeight.w900)),
                      SizedBox(height: 3),
                      Text('Community name and profile photo'),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            TextField(
              controller: name,
              enabled: !saving,
              maxLength: 64,
              decoration: const InputDecoration(
                labelText: 'Community name',
                hintText: 'Type community name',
              ),
            ),
            if (error != null) Text(error!, style: const TextStyle(color: SyncColors.danger)),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton(
                onPressed: saving ? null : _submit,
                child: Text(saving ? 'Creating...' : 'Create'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class LiveCreateCommunityGroupScreen extends StatefulWidget {
  const LiveCreateCommunityGroupScreen({
    super.key,
    required this.community,
  });

  final Map<String, dynamic> community;

  @override
  State<LiveCreateCommunityGroupScreen> createState() => _LiveCreateCommunityGroupScreenState();
}

class _LiveCreateCommunityGroupScreenState extends State<LiveCreateCommunityGroupScreen> {
  final name = TextEditingController();
  final desc = TextEditingController();
  final search = TextEditingController();
  Timer? debounce;
  List<Map<String, dynamic>> results = const [];
  final Map<String, Map<String, dynamic>> selected = {};
  bool searching = false;
  bool saving = false;
  String? error;

  @override
  void initState() {
    super.initState();
    final communityName = widget.community['name']?.toString() ?? '';
    final suggested = '$communityName Group'.trim();
    name.text = suggested.isEmpty
        ? 'New Group'
        : suggested.length > 32
            ? suggested.substring(0, 32).trim()
            : suggested;
  }

  @override
  void dispose() {
    debounce?.cancel();
    name.dispose();
    desc.dispose();
    search.dispose();
    super.dispose();
  }

  void _onSearch(String raw) {
    debounce?.cancel();
    final query = raw.trim();
    if (query.length < 2) {
      setState(() {
        results = const [];
        searching = false;
      });
      return;
    }
    debounce = Timer(const Duration(milliseconds: 300), () => _runSearch(query));
  }

  Future<void> _runSearch(String query) async {
    if (!mounted) return;
    setState(() => searching = true);
    try {
      final rows = await context.services.contacts.search(query);
      if (!mounted || search.text.trim() != query) return;
      setState(() {
        results = rows;
        searching = false;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        searching = false;
        error = _errorText(failure);
      });
    }
  }

  void _toggleUser(Map<String, dynamic> user) {
    final id = user['userId']?.toString() ?? '';
    if (id.isEmpty) return;
    setState(() {
      if (selected.containsKey(id)) {
        selected.remove(id);
      } else {
        selected[id] = Map<String, dynamic>.from(user);
      }
    });
  }

  Future<void> _submit() async {
    final communityId = widget.community['_id']?.toString() ?? '';
    final groupName = name.text.trim();
    if (communityId.isEmpty) {
      setState(() => error = 'Community identity is missing.');
      return;
    }
    if (groupName.length < 3 || groupName.length > 32) {
      setState(() => error = 'Group name must be between 3 and 32 characters.');
      return;
    }
    if (desc.text.trim().length > 300) {
      setState(() => error = 'Description is too long (max 300).');
      return;
    }
    final users = selected.values.toList(growable: false);
    final identities = <String>{};
    for (final user in users) {
      for (final key in ['username', 'email', 'phone']) {
        final value = user[key]?.toString().trim() ?? '';
        if (value.isNotEmpty) identities.add(value);
      }
    }
    setState(() {
      saving = true;
      error = null;
    });
    try {
      await context.services.communities.createGroup(communityId, {
        'name': groupName,
        'desc': desc.text.trim(),
        'participantsId': users.map((item) => item['userId'].toString()).toList(growable: false),
        'identities': identities.toList(growable: false),
      });
      if (!mounted) return;
      Navigator.pop(context, true);
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        saving = false;
        error = _errorText(failure);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return SyncStandardPage(
      title: 'New Group in ${widget.community['name'] ?? 'Community'}',
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 36),
        children: [
          const Text(
            'Add people by username, email, mobile number (optional)',
            style: TextStyle(fontSize: 12),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: name,
            enabled: !saving,
            maxLength: 32,
            decoration: const InputDecoration(labelText: 'Group name'),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: desc,
            enabled: !saving,
            maxLength: 300,
            decoration: const InputDecoration(labelText: 'Description (optional)'),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: search,
            enabled: !saving,
            onChanged: _onSearch,
            decoration: InputDecoration(
              hintText: 'Search people by username, email, mobile',
              prefixIcon: const Icon(Icons.search_rounded),
              suffixIcon: searching
                  ? const Padding(
                      padding: EdgeInsets.all(13),
                      child: SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    )
                  : null,
            ),
          ),
          if (selected.isNotEmpty) ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: selected.values.map((user) {
                final label = user['fullname']?.toString() ?? user['username']?.toString() ?? 'User';
                return InputChip(
                  label: Text(label),
                  onDeleted: saving ? null : () => _toggleUser(user),
                );
              }).toList(growable: false),
            ),
          ],
          const SizedBox(height: 10),
          if (!searching && search.text.trim().length >= 2 && results.isEmpty)
            const Padding(
              padding: EdgeInsets.all(10),
              child: Text('No user found'),
            ),
          ...results.map((user) {
            final id = user['userId']?.toString() ?? '';
            final active = selected.containsKey(id);
            final fullname = user['fullname']?.toString() ?? user['username']?.toString() ?? 'User';
            final username = user['username']?.toString() ?? '';
            final email = user['email']?.toString() ?? '';
            final phone = user['phone']?.toString() ?? '';
            return ListTile(
              contentPadding: EdgeInsets.zero,
              leading: SyncAvatar(
                name: fullname,
                imageUrl: user['avatar']?.toString(),
                radius: 20,
              ),
              title: Text(fullname),
              subtitle: Text(
                [
                  if (username.isNotEmpty) '@$username',
                  if (email.isNotEmpty) email,
                  if (phone.isNotEmpty) phone,
                ].join(' - '),
              ),
              trailing: Icon(
                active ? Icons.check_circle_rounded : Icons.circle_outlined,
                color: active ? SyncColors.sky : context.muted,
              ),
              onTap: saving ? null : () => _toggleUser(user),
            );
          }),
          if (error != null) ...[
            const SizedBox(height: 10),
            Text(error!, style: const TextStyle(color: SyncColors.danger)),
          ],
          const SizedBox(height: 16),
          Row(
            children: [
              Text('Participants: ${selected.length}', style: TextStyle(color: context.muted)),
              const Spacer(),
              FilledButton(
                onPressed: saving ? null : _submit,
                child: Text(saving ? 'Creating...' : 'Create Group'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

List<Map<String, dynamic>> _list(dynamic value) {
  if (value is! List) return const [];
  return value
      .whereType<Map>()
      .map((item) => Map<String, dynamic>.from(item))
      .toList(growable: false);
}

Map<String, dynamic> _map(dynamic value) =>
    value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

String _relativeTime(dynamic value) {
  final raw = value?.toString().trim() ?? '';
  final parsed = raw.isEmpty ? null : DateTime.tryParse(raw);
  if (parsed == null) return '';

  final delta = DateTime.now().difference(parsed.toLocal());
  if (delta.isNegative || delta.inSeconds < 45) return 'a few seconds ago';
  if (delta.inMinutes < 2) return 'a minute ago';
  if (delta.inMinutes < 60) return '${delta.inMinutes} minutes ago';
  if (delta.inHours < 2) return 'an hour ago';
  if (delta.inHours < 24) return '${delta.inHours} hours ago';
  if (delta.inDays < 2) return 'a day ago';
  if (delta.inDays < 30) return '${delta.inDays} days ago';
  if (delta.inDays < 60) return 'a month ago';
  if (delta.inDays < 365) return '${delta.inDays ~/ 30} months ago';
  if (delta.inDays < 730) return 'a year ago';
  return '${delta.inDays ~/ 365} years ago';
}

String _imageMime(String filename) {
  final lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

String _errorText(Object failure) {
  if (failure is ApiException) return failure.message;
  return failure.toString().replaceFirst('Exception: ', '');
}
