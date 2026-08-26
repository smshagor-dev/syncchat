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
  List<Map<String, dynamic>> communities = const [];
  final Map<String, List<Map<String, dynamic>>> expandedChats = {};
  final Set<String> expanded = <String>{};
  bool loading = true;
  String? error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        loading = true;
        error = null;
      });
    }
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
    final created = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(builder: (_) => const LiveCreateCommunityScreen()),
    );
    if (created == true && mounted) await _load();
  }

  Future<void> _toggle(Map<String, dynamic> community) async {
    final id = community['_id']?.toString() ?? '';
    if (id.isEmpty) return;
    if (expanded.contains(id)) {
      setState(() => expanded.remove(id));
      return;
    }
    try {
      final rows = expandedChats[id] ?? await context.services.communities.chats(id);
      if (!mounted) return;
      setState(() {
        expandedChats[id] = rows;
        expanded.add(id);
      });
    } on Object catch (failure) {
      if (mounted) _snack(_errorText(failure));
    }
  }

  Future<void> _createGroup(Map<String, dynamic> community) async {
    final created = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (_) => LiveCreateCommunityGroupScreen(community: community),
      ),
    );
    if (created == true && mounted) {
      final id = community['_id']?.toString() ?? '';
      if (id.isNotEmpty) {
        try {
          expandedChats[id] = await context.services.communities.chats(id);
          expanded.add(id);
        } on Object {
          // Full reload below remains authoritative.
        }
      }
      await _load();
    }
  }

  Future<void> _openChat(Map<String, dynamic> chat) async {
    final group = chat['group'] is Map
        ? Map<String, dynamic>.from(chat['group'] as Map)
        : <String, dynamic>{};
    final name = group['name']?.toString() ?? 'Community group';
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => LiveChatRoomScreen(
          inbox: {
            ...chat,
            'roomType': 'group',
            'group': group,
          },
          name: name,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SyncStandardPage(
      title: 'Communities',
      actions: [
        IconButton(
          tooltip: 'Create community',
          onPressed: _createCommunity,
          icon: const Icon(Icons.add_rounded),
        ),
        IconButton(onPressed: _load, icon: const Icon(Icons.refresh_rounded)),
      ],
      child: loading && communities.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : error != null && communities.isEmpty
              ? _CommunityError(message: error!, onRetry: _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  child: communities.isEmpty
                      ? ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.only(top: 120),
                          children: [
                            const Icon(Icons.groups_2_outlined, size: 54, color: SyncColors.sky),
                            const SizedBox(height: 12),
                            const Center(child: Text('No communities yet.')),
                            const SizedBox(height: 16),
                            Center(
                              child: FilledButton.icon(
                                onPressed: _createCommunity,
                                icon: const Icon(Icons.add_rounded),
                                label: const Text('Create community'),
                              ),
                            ),
                          ],
                        )
                      : ListView.builder(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: EdgeInsets.fromLTRB(
                            12,
                            10,
                            12,
                            116 + MediaQuery.paddingOf(context).bottom,
                          ),
                          itemCount: communities.length,
                          itemBuilder: (_, index) => _communityCard(communities[index]),
                        ),
                ),
    );
  }

  Widget _communityCard(Map<String, dynamic> community) {
    final id = community['_id']?.toString() ?? '';
    final name = community['name']?.toString() ?? 'Community';
    final unread = (community['unreadTotal'] as num?)?.toInt() ?? 0;
    final total = (community['totalChats'] as num?)?.toInt() ?? 0;
    final chats = expandedChats[id] ?? _list(community['previewChats']);
    final open = expanded.contains(id);
    final visible = open ? chats : chats.take(3).toList(growable: false);

    return Card(
      color: context.panel,
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(color: context.border),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
        child: Column(
          children: [
            Row(
              children: [
                SyncAvatar(name: name, radius: 26),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(name, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
                      const SizedBox(height: 2),
                      Text(
                        '$total chat${total == 1 ? '' : 's'}${unread > 0 ? ' · $unread unread' : ''}',
                        style: TextStyle(color: context.muted),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'Create group',
                  onPressed: () => _createGroup(community),
                  icon: const Icon(Icons.group_add_outlined, color: SyncColors.sky),
                ),
              ],
            ),
            if (visible.isNotEmpty) ...[
              const SizedBox(height: 8),
              ...visible.map((chat) {
                final group = chat['group'] is Map
                    ? Map<String, dynamic>.from(chat['group'] as Map)
                    : <String, dynamic>{};
                final label = group['name']?.toString() ?? 'Community group';
                final content = chat['content'];
                final preview = content is Map
                    ? content['text']?.toString() ?? 'No messages yet'
                    : 'No messages yet';
                final unreadChat = chat['unreadRooms'] == true || ((chat['unreadMessage'] as num?)?.toInt() ?? 0) > 0;
                return ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 2),
                  dense: true,
                  leading: const Icon(Icons.tag_rounded, color: SyncColors.sky),
                  title: Text(label, style: TextStyle(fontWeight: unreadChat ? FontWeight.w900 : FontWeight.w700)),
                  subtitle: Text(preview, maxLines: 1, overflow: TextOverflow.ellipsis),
                  trailing: unreadChat
                      ? const Icon(Icons.circle, size: 9, color: SyncColors.sky)
                      : const Icon(Icons.chevron_right_rounded),
                  onTap: () => _openChat(chat),
                );
              }),
            ],
            const SizedBox(height: 4),
            Row(
              children: [
                TextButton.icon(
                  onPressed: () => _toggle(community),
                  icon: Icon(open ? Icons.expand_less_rounded : Icons.expand_more_rounded),
                  label: Text(open ? 'Show less' : 'View all'),
                ),
                const Spacer(),
                TextButton.icon(
                  onPressed: () => _createGroup(community),
                  icon: const Icon(Icons.add_rounded),
                  label: const Text('New group'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _snack(String text) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }
}

class LiveCreateCommunityScreen extends StatefulWidget {
  const LiveCreateCommunityScreen({super.key});

  @override
  State<LiveCreateCommunityScreen> createState() => _LiveCreateCommunityScreenState();
}

class _LiveCreateCommunityScreenState extends State<LiveCreateCommunityScreen> {
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
    try {
      final image = await picker.pickImage(
        source: ImageSource.gallery,
        imageQuality: 90,
        maxWidth: 1400,
        maxHeight: 1400,
      );
      if (image == null || !mounted) return;
      final bytes = await image.readAsBytes();
      if (bytes.length > context.services.config.avatarUploadLimitMb * 1024 * 1024) {
        setState(() => error = 'Image is too large.');
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

  Future<void> _create() async {
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
  Widget build(BuildContext context) => SyncStandardPage(
        title: 'Create community',
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 20, 18, 36),
          children: [
            Center(
              child: InkWell(
                onTap: saving ? null : _pickAvatar,
                borderRadius: BorderRadius.circular(28),
                child: Container(
                  width: 100,
                  height: 100,
                  clipBehavior: Clip.antiAlias,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(28),
                    color: SyncColors.sky.withValues(alpha: .12),
                    border: Border.all(color: context.border),
                  ),
                  child: avatarDataUri == null
                      ? const Icon(Icons.add_a_photo_outlined, size: 36, color: SyncColors.sky)
                      : Image.memory(base64Decode(avatarDataUri!.split(',').last), fit: BoxFit.cover),
                ),
              ),
            ),
            const SizedBox(height: 22),
            TextField(
              controller: name,
              enabled: !saving,
              maxLength: 64,
              decoration: const InputDecoration(
                labelText: 'Community name',
                prefixIcon: Icon(Icons.groups_2_outlined),
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'SyncChat will create Announcements and General groups automatically.',
              style: TextStyle(height: 1.4),
            ),
            if (error != null) ...[
              const SizedBox(height: 12),
              Text(error!, style: const TextStyle(color: SyncColors.danger)),
            ],
            const SizedBox(height: 22),
            FilledButton.icon(
              onPressed: saving ? null : _create,
              icon: const Icon(Icons.add_rounded),
              label: Text(saving ? 'Creating…' : 'Create community'),
            ),
          ],
        ),
      );
}

class LiveCreateCommunityGroupScreen extends StatefulWidget {
  const LiveCreateCommunityGroupScreen({
    super.key,
    required this.community,
  });

  final Map<String, dynamic> community;

  @override
  State<LiveCreateCommunityGroupScreen> createState() =>
      _LiveCreateCommunityGroupScreenState();
}

class _LiveCreateCommunityGroupScreenState
    extends State<LiveCreateCommunityGroupScreen> {
  final name = TextEditingController();
  final desc = TextEditingController();
  List<Map<String, dynamic>> contacts = const [];
  final Set<String> selected = <String>{};
  bool loading = true;
  bool saving = false;
  String? error;

  @override
  void initState() {
    super.initState();
    final communityName = widget.community['name']?.toString() ?? '';
    final suggested = '$communityName Group'.trim();
    name.text = suggested.length > 32 ? suggested.substring(0, 32).trim() : suggested;
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadContacts());
  }

  @override
  void dispose() {
    name.dispose();
    desc.dispose();
    super.dispose();
  }

  Future<void> _loadContacts() async {
    try {
      final rows = await context.services.contacts.list();
      if (!mounted) return;
      setState(() {
        contacts = rows;
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

  Future<void> _create() async {
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
    setState(() {
      saving = true;
      error = null;
    });
    try {
      await context.services.communities.createGroup(communityId, {
        'name': groupName,
        'desc': desc.text.trim(),
        'participantsId': selected.toList(growable: false),
        'identities': <String>[],
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
  Widget build(BuildContext context) => SyncStandardPage(
        title: 'New community group',
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 18, 16, 36),
          children: [
            TextField(
              controller: name,
              enabled: !saving,
              maxLength: 32,
              decoration: const InputDecoration(
                labelText: 'Group name',
                prefixIcon: Icon(Icons.groups_outlined),
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: desc,
              enabled: !saving,
              maxLength: 300,
              minLines: 2,
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: 'Description',
                prefixIcon: Icon(Icons.notes_rounded),
                alignLabelWithHint: true,
              ),
            ),
            const SizedBox(height: 18),
            Text(
              'Members · ${selected.length} selected',
              style: const TextStyle(fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 8),
            if (loading)
              const Center(child: CircularProgressIndicator())
            else
              ...contacts.map((contact) {
                final profile = contact['profile'] is Map
                    ? Map<String, dynamic>.from(contact['profile'] as Map)
                    : <String, dynamic>{};
                final id = contact['friendId']?.toString() ?? profile['userId']?.toString() ?? '';
                final label = profile['fullname']?.toString() ?? profile['username']?.toString() ?? 'Contact';
                return CheckboxListTile(
                  value: selected.contains(id),
                  secondary: SyncAvatar(name: label, radius: 20),
                  title: Text(label),
                  subtitle: (profile['username']?.toString() ?? '').isEmpty
                      ? null
                      : Text('@${profile['username']}'),
                  onChanged: saving || id.isEmpty
                      ? null
                      : (value) => setState(() {
                            if (value == true) {
                              selected.add(id);
                            } else {
                              selected.remove(id);
                            }
                          }),
                );
              }),
            if (error != null) ...[
              const SizedBox(height: 10),
              Text(error!, style: const TextStyle(color: SyncColors.danger)),
            ],
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: saving ? null : _create,
              icon: const Icon(Icons.group_add_rounded),
              label: Text(saving ? 'Creating…' : 'Create group'),
            ),
          ],
        ),
      );
}

class _CommunityError extends StatelessWidget {
  const _CommunityError({required this.message, required this.onRetry});
  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.groups_2_outlined, size: 48, color: SyncColors.sky),
              const SizedBox(height: 12),
              Text(message, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              FilledButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh_rounded), label: const Text('Retry')),
            ],
          ),
        ),
      );
}

List<Map<String, dynamic>> _list(dynamic value) => value is List
    ? value.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList(growable: false)
    : const [];

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
