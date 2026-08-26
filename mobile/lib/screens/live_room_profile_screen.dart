import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../theme.dart';
import '../widgets.dart';
import 'live_call_screen.dart';
import 'live_p1_room_admin_screen.dart';
import 'live_p1_room_security_screen.dart';

/// Opens the production profile/info surface for a private chat or channel.
/// Standalone groups continue to use [LiveGroupInfoScreen] from
/// live_groups_screen.dart so the existing full group-admin implementation is
/// preserved instead of duplicating it here.
class LiveFriendProfileScreen extends StatefulWidget {
  const LiveFriendProfileScreen({
    super.key,
    required this.inbox,
    required this.name,
  });

  final Map<String, dynamic> inbox;
  final String name;

  @override
  State<LiveFriendProfileScreen> createState() => _LiveFriendProfileScreenState();
}

class _LiveFriendProfileScreenState extends State<LiveFriendProfileScreen> {
  Map<String, dynamic> room = const {};
  Map<String, dynamic> profile = const {};
  Map<String, dynamic> blockState = const {};
  List<Map<String, dynamic>> commonGroups = const [];
  List<Map<String, dynamic>> roomMedia = const [];
  Map<String, dynamic>? currentUser;
  bool loading = true;
  bool saving = false;
  String? error;
  String notificationTone = 'default-ringtone';

  String get roomId => widget.inbox['roomId']?.toString() ?? '';
  String get currentUserId => currentUser?['_id']?.toString() ?? '';
  String get friendId => _friendId(room.isEmpty ? widget.inbox : room, currentUserId);
  String get displayName {
    final value = profile['fullname']?.toString().trim();
    if (value?.isNotEmpty == true) return value!;
    final username = profile['username']?.toString().trim();
    if (username?.isNotEmpty == true) return username!;
    return widget.name;
  }

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
      final me = await context.services.chat.currentUser(refresh: true);
      final freshRoom = roomId.isEmpty
          ? Map<String, dynamic>.from(widget.inbox)
          : await context.services.inbox.findByRoom(roomId);
      final resolvedFriendId = _friendId(freshRoom, me['_id']?.toString() ?? '');
      if (resolvedFriendId.isEmpty) {
        throw const ApiException(statusCode: 400, message: 'Contact identity is missing.');
      }

      final results = await Future.wait<dynamic>([
        context.services.profile.getProfile(resolvedFriendId),
        context.services.contacts.blockState(resolvedFriendId),
        context.services.api.get('/profiles/$resolvedFriendId/common-groups'),
        roomId.isEmpty
            ? Future<ApiEnvelope>.value(
                const ApiEnvelope(statusCode: 200, success: true, message: null, payload: <dynamic>[]),
              )
            : context.services.api.get('/chats/media', query: {'roomId': roomId}),
      ]);
      if (!mounted) return;
      final nextRoom = freshRoom.isEmpty ? Map<String, dynamic>.from(widget.inbox) : freshRoom;
      final toneBy = _map(nextRoom['notificationToneBy']);
      setState(() {
        currentUser = Map<String, dynamic>.from(me);
        room = nextRoom;
        profile = Map<String, dynamic>.from(results[0] as Map);
        blockState = Map<String, dynamic>.from(results[1] as Map);
        commonGroups = _list((results[2] as ApiEnvelope).payload);
        roomMedia = _list((results[3] as ApiEnvelope).payload);
        notificationTone = toneBy[currentUserId]?.toString() ?? 'default-ringtone';
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

  Future<void> _setPreference(String action, dynamic value) async {
    if (roomId.isEmpty || saving) return;
    setState(() => saving = true);
    try {
      final updated = await context.services.inbox.setPreference(roomId, action, value);
      if (!mounted) return;
      setState(() {
        if (updated.isNotEmpty) room = updated;
        final tones = _map(room['notificationToneBy']);
        notificationTone = tones[currentUserId]?.toString() ?? notificationTone;
        saving = false;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => saving = false);
      _snack(_errorText(failure));
    }
  }

  Future<void> _toggleBlock() async {
    if (friendId.isEmpty || saving) return;
    setState(() => saving = true);
    try {
      if (blockState['youBlocked'] == true) {
        await context.services.contacts.unblock(friendId);
      } else {
        await context.services.contacts.block(friendId);
      }
      final next = await context.services.contacts.blockState(friendId);
      if (!mounted) return;
      setState(() {
        blockState = next;
        saving = false;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => saving = false);
      _snack(_errorText(failure));
    }
  }

  Future<void> _toggleContact() async {
    if (friendId.isEmpty || saving) return;
    setState(() => saving = true);
    try {
      if (profile['saved'] == true) {
        await context.services.contacts.delete(friendId);
      } else {
        final identity = profile['username']?.toString().trim().isNotEmpty == true
            ? profile['username'].toString()
            : profile['phone']?.toString().trim().isNotEmpty == true
                ? profile['phone'].toString()
                : profile['email']?.toString() ?? '';
        if (identity.trim().isEmpty) {
          throw const ApiException(statusCode: 400, message: 'No addable contact identity is available.');
        }
        await context.services.contacts.add({'identity': identity});
      }
      final refreshed = await context.services.profile.getProfile(friendId);
      if (!mounted) return;
      setState(() {
        profile = refreshed;
        saving = false;
      });
      _snack(profile['saved'] == true ? 'Contact saved.' : 'Contact removed.');
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => saving = false);
      _snack(_errorText(failure));
    }
  }

  Future<void> _shareContact() async {
    final rooms = await context.services.inbox.list();
    if (!mounted) return;
    final destination = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: SizedBox(
          height: MediaQuery.sizeOf(sheetContext).height * .68,
          child: Column(
            children: [
              const ListTile(
                title: Text('Share contact', style: TextStyle(fontWeight: FontWeight.w900)),
                subtitle: Text('Choose a conversation'),
              ),
              Expanded(
                child: ListView.separated(
                  itemCount: rooms.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (_, index) {
                    final target = rooms[index];
                    final label = _roomName(target, currentUserId);
                    return ListTile(
                      leading: SyncAvatar(name: label, radius: 21),
                      title: Text(label),
                      onTap: () => Navigator.pop(sheetContext, target),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (destination == null || !mounted) return;
    try {
      final lines = <String>[
        '👤 SyncChat contact',
        'Name: $displayName',
        if ((profile['username']?.toString() ?? '').isNotEmpty) 'Username: @${profile['username']}',
        if ((profile['phone']?.toString() ?? '').isNotEmpty) 'Phone: ${profile['phone']}',
        if ((profile['email']?.toString() ?? '').isNotEmpty) 'Email: ${profile['email']}',
      ];
      await context.services.chat.sendText(inbox: destination, text: lines.join('\n'));
      if (mounted) _snack('Contact shared.');
    } on Object catch (failure) {
      if (mounted) _snack(_errorText(failure));
    }
  }

  Future<void> _report() async {
    final category = ValueNotifier<String>('general');
    final reason = TextEditingController();
    final formKey = GlobalKey<FormState>();
    final submitted = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Report contact'),
        content: Form(
          key: formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ValueListenableBuilder<String>(
                valueListenable: category,
                builder: (_, value, __) => DropdownButtonFormField<String>(
                  value: value,
                  decoration: const InputDecoration(labelText: 'Category'),
                  items: const [
                    DropdownMenuItem(value: 'general', child: Text('General')),
                    DropdownMenuItem(value: 'spam', child: Text('Spam')),
                    DropdownMenuItem(value: 'harassment', child: Text('Harassment')),
                    DropdownMenuItem(value: 'impersonation', child: Text('Impersonation')),
                    DropdownMenuItem(value: 'scam', child: Text('Scam / fraud')),
                  ],
                  onChanged: (next) {
                    if (next != null) category.value = next;
                  },
                ),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: reason,
                minLines: 3,
                maxLines: 5,
                maxLength: 500,
                decoration: const InputDecoration(labelText: 'Reason'),
                validator: (value) => (value ?? '').trim().length < 3 ? 'Please add a short reason.' : null,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              if (formKey.currentState?.validate() != true) return;
              Navigator.pop(dialogContext, true);
            },
            child: const Text('Submit report'),
          ),
        ],
      ),
    );
    final selectedCategory = category.value;
    final selectedReason = reason.text.trim();
    category.dispose();
    reason.dispose();
    if (submitted != true || !mounted) return;
    try {
      await context.services.api.post('/reports/chat', body: {
        'roomId': roomId,
        'roomType': 'private',
        'targetId': friendId,
        'reportedUserId': friendId,
        'category': selectedCategory,
        'reason': selectedReason,
      });
      if (mounted) _snack('Report submitted.');
    } on Object catch (failure) {
      if (mounted) _snack(_errorText(failure));
    }
  }

  Future<void> _openSecurity() async {
    if (currentUserId.isEmpty) return;
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (_) => LiveFriendRoomSecurityScreen(
          inbox: room.isEmpty ? widget.inbox : room,
          currentUserId: currentUserId,
        ),
      ),
    );
    if (changed == true && mounted) await _load();
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return Scaffold(
        backgroundColor: context.page,
        appBar: AppBar(title: const Text('Contact info')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }
    if (error != null && profile.isEmpty) {
      return Scaffold(
        backgroundColor: context.page,
        appBar: AppBar(title: const Text('Contact info')),
        body: _ErrorState(message: error!, onRetry: _load),
      );
    }

    final muted = _containsUser(room['mutedBy'], currentUserId);
    final favourite = _containsUser(room['favouriteBy'], currentUserId);
    final listed = _containsUser(room['listedBy'], currentUserId);
    final advancedPrivacy = _containsUser(room['privacyShieldBy'], currentUserId);
    final secret = room['secretChatEnabled'] == true;
    final online = profile['online'] == true;
    final socials = _list(profile['socialAccounts']);
    final media = roomMedia.where((item) => ['photo', 'video'].contains(item['kind']?.toString())).toList(growable: false);
    final links = roomMedia.where((item) => item['kind']?.toString() == 'link').length;
    final files = roomMedia.where((item) => item['kind']?.toString() == 'file').length;

    return Scaffold(
      backgroundColor: context.page,
      appBar: AppBar(
        title: const Text('Contact info'),
        backgroundColor: context.panel,
        surfaceTintColor: Colors.transparent,
        actions: [
          IconButton(tooltip: 'Share contact', onPressed: _shareContact, icon: const Icon(Icons.ios_share_rounded)),
          IconButton(tooltip: 'Refresh', onPressed: saving ? null : _load, icon: const Icon(Icons.refresh_rounded)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(14, 18, 14, 36),
          children: [
            _profileHero(
              context,
              name: displayName,
              avatar: profile['avatar']?.toString(),
              subtitle: online ? 'Online' : _presenceLabel(profile),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: _roundAction(
                    context,
                    Icons.call_outlined,
                    'Audio',
                    () => openOutgoingCall(context, inbox: room.isEmpty ? widget.inbox : room, name: displayName, video: false),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _roundAction(
                    context,
                    Icons.videocam_outlined,
                    'Video',
                    () => openOutgoingCall(context, inbox: room.isEmpty ? widget.inbox : room, name: displayName, video: true),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(child: _roundAction(context, Icons.ios_share_rounded, 'Share', _shareContact)),
              ],
            ),
            const SizedBox(height: 18),
            SyncSoftCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  _infoTile(Icons.alternate_email_rounded, 'Username', (profile['username']?.toString() ?? '').isEmpty ? 'Not set' : '@${profile['username']}'),
                  Divider(height: 1, color: context.border),
                  _infoTile(Icons.info_outline_rounded, 'About', profile['bio']?.toString().trim().isNotEmpty == true ? profile['bio'].toString() : 'No bio'),
                  if ((profile['phone']?.toString() ?? '').isNotEmpty) ...[
                    Divider(height: 1, color: context.border),
                    _infoTile(Icons.phone_outlined, 'Phone', profile['phone'].toString()),
                  ],
                  if ((profile['email']?.toString() ?? '').isNotEmpty) ...[
                    Divider(height: 1, color: context.border),
                    _infoTile(Icons.email_outlined, 'Email', profile['email'].toString()),
                  ],
                ],
              ),
            ),
            if (socials.isNotEmpty) ...[
              const SizedBox(height: 18),
              _sectionLabel(context, 'Social links'),
              SyncSoftCard(
                padding: EdgeInsets.zero,
                child: Column(
                  children: _withDividers(
                    context,
                    socials.map((item) {
                      final platform = item['platform']?.toString() ?? 'link';
                      final url = item['url']?.toString() ?? '';
                      return ListTile(
                        leading: const Icon(Icons.public_rounded, color: SyncColors.sky),
                        title: Text(_socialLabel(platform), style: const TextStyle(fontWeight: FontWeight.w800)),
                        subtitle: Text(url, maxLines: 1, overflow: TextOverflow.ellipsis),
                        trailing: IconButton(
                          tooltip: 'Copy link',
                          onPressed: url.isEmpty
                              ? null
                              : () async {
                                  await Clipboard.setData(ClipboardData(text: url));
                                  if (mounted) _snack('Link copied.');
                                },
                          icon: const Icon(Icons.copy_rounded),
                        ),
                      );
                    }).toList(growable: false),
                  ),
                ),
              ),
            ],
            const SizedBox(height: 18),
            _sectionLabel(context, 'Shared content'),
            SyncSoftCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  ListTile(
                    leading: const Icon(Icons.photo_library_outlined, color: SyncColors.sky),
                    title: const Text('Media, links and files', style: TextStyle(fontWeight: FontWeight.w800)),
                    subtitle: Text('${media.length} media · $links links · $files files'),
                  ),
                  if (media.isNotEmpty) ...[
                    Divider(height: 1, color: context.border),
                    SizedBox(
                      height: 88,
                      child: ListView.separated(
                        padding: const EdgeInsets.all(9),
                        scrollDirection: Axis.horizontal,
                        itemCount: media.take(12).length,
                        separatorBuilder: (_, __) => const SizedBox(width: 7),
                        itemBuilder: (_, index) {
                          final item = media[index];
                          final file = _map(item['file']);
                          final raw = file['url']?.toString() ?? '';
                          final url = _absoluteUrl(context, raw);
                          return ClipRRect(
                            borderRadius: BorderRadius.circular(10),
                            child: url.isEmpty
                                ? Container(width: 72, color: context.softPanel, child: const Icon(Icons.image_outlined))
                                : Image.network(
                                    url,
                                    width: 72,
                                    height: 72,
                                    fit: BoxFit.cover,
                                    errorBuilder: (_, __, ___) => Container(width: 72, color: context.softPanel, child: const Icon(Icons.broken_image_outlined)),
                                  ),
                          );
                        },
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (commonGroups.isNotEmpty) ...[
              const SizedBox(height: 18),
              _sectionLabel(context, 'Groups in common'),
              SyncSoftCard(
                padding: EdgeInsets.zero,
                child: Column(
                  children: _withDividers(
                    context,
                    commonGroups.take(12).map((group) {
                      final name = group['name']?.toString() ?? 'Group';
                      return ListTile(
                        leading: SyncAvatar(name: name, radius: 20),
                        title: Text(name, style: const TextStyle(fontWeight: FontWeight.w800)),
                        subtitle: Text('${_ids(group['participantsId']).length} members'),
                      );
                    }).toList(growable: false),
                  ),
                ),
              ),
            ],
            const SizedBox(height: 18),
            _sectionLabel(context, 'Chat settings'),
            SyncSoftCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  SwitchListTile.adaptive(
                    secondary: const Icon(Icons.notifications_off_outlined, color: SyncColors.sky),
                    title: const Text('Mute notifications'),
                    value: muted,
                    onChanged: saving ? null : (value) => _setPreference('mute', value),
                  ),
                  Divider(height: 1, color: context.border),
                  ListTile(
                    leading: const Icon(Icons.music_note_outlined, color: SyncColors.sky),
                    title: const Text('Notification tone'),
                    trailing: DropdownButton<String>(
                      value: const ['default-ringtone', 'classic-bell', 'digital-pop', 'soft-chime'].contains(notificationTone)
                          ? notificationTone
                          : 'default-ringtone',
                      underline: const SizedBox.shrink(),
                      items: const [
                        DropdownMenuItem(value: 'default-ringtone', child: Text('Default')),
                        DropdownMenuItem(value: 'classic-bell', child: Text('Classic')),
                        DropdownMenuItem(value: 'digital-pop', child: Text('Digital')),
                        DropdownMenuItem(value: 'soft-chime', child: Text('Soft')),
                      ],
                      onChanged: saving
                          ? null
                          : (value) {
                              if (value != null) {
                                setState(() => notificationTone = value);
                                _setPreference('notificationTone', value);
                              }
                            },
                    ),
                  ),
                  Divider(height: 1, color: context.border),
                  SwitchListTile.adaptive(
                    secondary: const Icon(Icons.star_border_rounded, color: SyncColors.sky),
                    title: const Text('Favourite'),
                    value: favourite,
                    onChanged: saving ? null : (value) => _setPreference('favourite', value),
                  ),
                  Divider(height: 1, color: context.border),
                  SwitchListTile.adaptive(
                    secondary: const Icon(Icons.format_list_bulleted_rounded, color: SyncColors.sky),
                    title: const Text('Add to list'),
                    value: listed,
                    onChanged: saving ? null : (value) => _setPreference('list', value),
                  ),
                  Divider(height: 1, color: context.border),
                  SwitchListTile.adaptive(
                    secondary: const Icon(Icons.shield_outlined, color: SyncColors.sky),
                    title: const Text('Advanced privacy'),
                    subtitle: const Text('Apply the room privacy shield for both participants.'),
                    value: advancedPrivacy,
                    onChanged: saving ? null : (value) => _setPreference('advancedPrivacy', value),
                  ),
                  Divider(height: 1, color: context.border),
                  ListTile(
                    leading: Icon(secret ? Icons.lock_rounded : Icons.security_outlined, color: SyncColors.sky),
                    title: const Text('Security & secret chat', style: TextStyle(fontWeight: FontWeight.w800)),
                    subtitle: Text(secret ? 'Secret chat enabled' : 'E2EE, secret chat, timer and screenshot alerts'),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: _openSecurity,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 18),
            _sectionLabel(context, 'Contact actions'),
            SyncSoftCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  ListTile(
                    leading: Icon(profile['saved'] == true ? Icons.person_remove_alt_1_outlined : Icons.person_add_alt_1_rounded, color: SyncColors.sky),
                    title: Text(profile['saved'] == true ? 'Delete contact' : 'Add contact'),
                    onTap: saving ? null : _toggleContact,
                  ),
                  Divider(height: 1, color: context.border),
                  ListTile(
                    leading: Icon(blockState['youBlocked'] == true ? Icons.lock_open_rounded : Icons.block_rounded, color: SyncColors.danger),
                    title: Text(blockState['youBlocked'] == true ? 'Unblock contact' : 'Block contact', style: const TextStyle(color: SyncColors.danger)),
                    subtitle: blockState['blockedYou'] == true ? const Text('This contact has blocked you.') : null,
                    onTap: saving ? null : _toggleBlock,
                  ),
                  Divider(height: 1, color: context.border),
                  ListTile(
                    leading: const Icon(Icons.flag_outlined, color: SyncColors.danger),
                    title: const Text('Report contact', style: TextStyle(color: SyncColors.danger)),
                    onTap: _report,
                  ),
                ],
              ),
            ),
            if (saving) ...[
              const SizedBox(height: 18),
              const LinearProgressIndicator(minHeight: 2),
            ],
          ],
        ),
      ),
    );
  }

  void _snack(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text), behavior: SnackBarBehavior.floating));
  }
}

class LiveChannelProfileScreen extends StatefulWidget {
  const LiveChannelProfileScreen({
    super.key,
    required this.inbox,
    required this.name,
  });

  final Map<String, dynamic> inbox;
  final String name;

  @override
  State<LiveChannelProfileScreen> createState() => _LiveChannelProfileScreenState();
}

class _LiveChannelProfileScreenState extends State<LiveChannelProfileScreen> {
  Map<String, dynamic> room = const {};
  Map<String, dynamic> channel = const {};
  Map<String, dynamic> analytics = const {};
  Map<String, dynamic> reviews = const {};
  List<Map<String, dynamic>> participants = const [];
  Map<String, dynamic>? currentUser;
  bool loading = true;
  bool saving = false;
  String? error;
  int rating = 5;
  final review = TextEditingController();

  String get roomId => widget.inbox['roomId']?.toString() ?? channel['roomId']?.toString() ?? '';
  String get channelId {
    final nested = widget.inbox['channel'];
    if (nested is Map && nested['_id'] != null) return nested['_id'].toString();
    return channel['_id']?.toString() ?? '';
  }
  String get currentUserId => currentUser?['_id']?.toString() ?? '';
  bool get isAdmin => _isAdmin(channel, currentUserId);
  String get displayName => channel['name']?.toString().trim().isNotEmpty == true ? channel['name'].toString().trim() : widget.name;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    review.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final me = await context.services.channels.currentUser(refresh: true);
      final initial = widget.inbox['channel'] is Map
          ? Map<String, dynamic>.from(widget.inbox['channel'] as Map)
          : <String, dynamic>{};
      final id = initial['_id']?.toString() ?? channel['_id']?.toString() ?? '';
      if (id.isEmpty) throw const ApiException(statusCode: 400, message: 'Channel identity is missing.');
      final results = await Future.wait<dynamic>([
        context.services.channels.find(id),
        context.services.channels.participants(id),
        context.services.api.get('/channels/$id/analytics'),
        context.services.api.get('/channels/$id/reviews'),
        roomId.isEmpty
            ? Future<Map<String, dynamic>>.value(Map<String, dynamic>.from(widget.inbox))
            : context.services.inbox.findByRoom(roomId),
      ]);
      if (!mounted) return;
      final reviewPayload = _map((results[3] as ApiEnvelope).payload);
      final mine = reviewPayload['myReview'];
      setState(() {
        currentUser = Map<String, dynamic>.from(me);
        channel = Map<String, dynamic>.from(results[0] as Map);
        participants = (results[1] as List).whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList(growable: false);
        analytics = _map((results[2] as ApiEnvelope).payload);
        reviews = reviewPayload;
        room = Map<String, dynamic>.from(results[4] as Map);
        rating = mine is Map ? ((mine['rating'] as num?)?.toInt() ?? 5).clamp(1, 5) : 5;
        review.text = mine is Map ? mine['review']?.toString() ?? '' : '';
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

  Future<void> _setPreference(String action, dynamic value) async {
    if (roomId.isEmpty || saving) return;
    setState(() => saving = true);
    try {
      final next = await context.services.inbox.setPreference(roomId, action, value);
      if (!mounted) return;
      setState(() {
        if (next.isNotEmpty) room = next;
        saving = false;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => saving = false);
      _snack(_errorText(failure));
    }
  }

  Future<void> _editInfo() async {
    final name = TextEditingController(text: displayName);
    final desc = TextEditingController(text: channel['desc']?.toString() ?? '');
    final formKey = GlobalKey<FormState>();
    final result = await showDialog<(String, String)>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Edit channel info'),
        content: Form(
          key: formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextFormField(
                controller: name,
                maxLength: 64,
                decoration: const InputDecoration(labelText: 'Channel name'),
                validator: (value) => (value ?? '').trim().isEmpty ? 'Channel name is required.' : null,
              ),
              TextFormField(
                controller: desc,
                maxLength: 300,
                minLines: 2,
                maxLines: 4,
                decoration: const InputDecoration(labelText: 'Description'),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              if (formKey.currentState?.validate() != true) return;
              Navigator.pop(dialogContext, (name.text.trim(), desc.text.trim()));
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
    name.dispose();
    desc.dispose();
    if (result == null || !mounted) return;
    setState(() => saving = true);
    try {
      await context.services.channels.edit(channelId: channelId, name: result.$1, desc: result.$2);
      await _load();
      if (mounted) _snack('Channel info updated.');
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => saving = false);
      _snack(_errorText(failure));
    }
  }

  Future<void> _changePrivacy() async {
    final current = channel['accessType']?.toString() == 'private' ? 'private' : 'public';
    var access = current;
    final password = TextEditingController();
    final result = await showDialog<(String, String)>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (_, setDialogState) => AlertDialog(
          title: const Text('Channel privacy'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'public', label: Text('Public'), icon: Icon(Icons.public_rounded)),
                  ButtonSegment(value: 'private', label: Text('Private'), icon: Icon(Icons.lock_outline_rounded)),
                ],
                selected: {access},
                onSelectionChanged: (value) => setDialogState(() => access = value.first),
              ),
              if (access == 'private') ...[
                const SizedBox(height: 12),
                TextField(
                  controller: password,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'Password (required when making private)'),
                ),
              ],
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(dialogContext, (access, password.text)), child: const Text('Save')),
          ],
        ),
      ),
    );
    password.dispose();
    if (result == null || !mounted) return;
    if (result.$1 == 'private' && current != 'private' && result.$2.length < 4) {
      _snack('Private channel password must be at least 4 characters.');
      return;
    }
    setState(() => saving = true);
    try {
      await context.services.channels.updatePrivacy(channelId, accessType: result.$1, password: result.$2);
      await _load();
      if (mounted) _snack('Channel privacy updated.');
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => saving = false);
      _snack(_errorText(failure));
    }
  }

  Future<void> _addParticipants() async {
    final query = TextEditingController();
    List<Map<String, dynamic>> results = const [];
    bool searching = false;
    final selected = <String>{};
    final added = await showDialog<List<String>>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (_, setDialogState) => AlertDialog(
          title: const Text('Add subscribers'),
          content: SizedBox(
            width: 480,
            height: 440,
            child: Column(
              children: [
                TextField(
                  controller: query,
                  decoration: const InputDecoration(
                    hintText: 'Username, email or phone',
                    prefixIcon: Icon(Icons.search_rounded),
                  ),
                  onSubmitted: (value) async {
                    final q = value.trim();
                    if (q.length < 2) return;
                    setDialogState(() => searching = true);
                    try {
                      final rows = await context.services.contacts.search(q);
                      if (!dialogContext.mounted) return;
                      setDialogState(() {
                        results = rows.where((item) => !_ids(channel['participantsId']).contains(item['userId']?.toString() ?? '')).toList(growable: false);
                        searching = false;
                      });
                    } on Object {
                      if (dialogContext.mounted) setDialogState(() => searching = false);
                    }
                  },
                ),
                const SizedBox(height: 8),
                Expanded(
                  child: searching
                      ? const Center(child: CircularProgressIndicator())
                      : ListView.builder(
                          itemCount: results.length,
                          itemBuilder: (_, index) {
                            final item = results[index];
                            final id = item['userId']?.toString() ?? '';
                            final name = item['fullname']?.toString() ?? item['username']?.toString() ?? 'User';
                            return CheckboxListTile(
                              value: selected.contains(id),
                              secondary: SyncAvatar(name: name, radius: 20),
                              title: Text(name),
                              subtitle: (item['username']?.toString() ?? '').isEmpty ? null : Text('@${item['username']}'),
                              onChanged: id.isEmpty
                                  ? null
                                  : (value) => setDialogState(() {
                                        if (value == true) {
                                          selected.add(id);
                                        } else {
                                          selected.remove(id);
                                        }
                                      }),
                            );
                          },
                        ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
            FilledButton(onPressed: selected.isEmpty ? null : () => Navigator.pop(dialogContext, selected.toList()), child: const Text('Add')),
          ],
        ),
      ),
    );
    query.dispose();
    if (added == null || added.isEmpty || !mounted) return;
    setState(() => saving = true);
    try {
      await context.services.channels.addParticipants(channelId, added);
      await _load();
      if (mounted) _snack('Subscribers added.');
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => saving = false);
      _snack(_errorText(failure));
    }
  }

  Future<void> _participantActions(Map<String, dynamic> participant) async {
    if (!isAdmin) return;
    final id = participant['userId']?.toString() ?? participant['_id']?.toString() ?? '';
    if (id.isEmpty || id == currentUserId) return;
    final admin = _ids(channel['adminsId']).contains(id) || channel['adminId']?.toString() == id;
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: Icon(admin ? Icons.person_remove_alt_1_outlined : Icons.admin_panel_settings_outlined),
              title: Text(admin ? 'Remove admin' : 'Make admin'),
              onTap: () {
                Navigator.pop(sheetContext);
                _changeAdmin(id, !admin);
              },
            ),
            ListTile(
              leading: const Icon(Icons.person_remove_outlined, color: SyncColors.danger),
              title: const Text('Remove subscriber', style: TextStyle(color: SyncColors.danger)),
              onTap: () {
                Navigator.pop(sheetContext);
                _removeParticipant(id);
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _changeAdmin(String id, bool makeAdmin) async {
    setState(() => saving = true);
    try {
      if (makeAdmin) {
        await context.services.channels.promoteAdmin(channelId, id);
      } else {
        await context.services.channels.demoteAdmin(channelId, id);
      }
      await _load();
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => saving = false);
      _snack(_errorText(failure));
    }
  }

  Future<void> _removeParticipant(String id) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Remove subscriber?'),
        content: const Text('They will lose access to this channel until they subscribe again.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Remove')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => saving = true);
    try {
      await context.services.channels.removeParticipant(channelId, id);
      await _load();
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => saving = false);
      _snack(_errorText(failure));
    }
  }

  Future<void> _submitReview() async {
    if (saving) return;
    setState(() => saving = true);
    try {
      await context.services.api.post('/channels/$channelId/reviews', body: {
        'rating': rating,
        'review': review.text.trim(),
      });
      await _load();
      if (mounted) _snack('Channel review saved.');
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => saving = false);
      _snack(_errorText(failure));
    }
  }

  Future<void> _openAdmin() async {
    if (!isAdmin || currentUserId.isEmpty) return;
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => LiveRoomAdminScreen(
          inbox: {
            ...room,
            'channel': channel,
            'roomType': 'group',
          },
          currentUserId: currentUserId,
        ),
      ),
    );
    if (mounted) await _load();
  }

  Future<void> _leave() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Leave channel?'),
        content: Text('Stop receiving updates from $displayName?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Leave')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => saving = true);
    try {
      await context.services.channels.exit(channelId);
      if (!mounted) return;
      Navigator.pop(context, true);
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => saving = false);
      _snack(_errorText(failure));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return Scaffold(backgroundColor: context.page, appBar: AppBar(title: const Text('Channel info')), body: const Center(child: CircularProgressIndicator()));
    }
    if (error != null && channel.isEmpty) {
      return Scaffold(backgroundColor: context.page, appBar: AppBar(title: const Text('Channel info')), body: _ErrorState(message: error!, onRetry: _load));
    }

    final members = _ids(channel['participantsId']).length;
    final private = channel['accessType']?.toString() == 'private';
    final muted = _containsUser(room['mutedBy'], currentUserId);
    final growth = _map(analytics['subscriberGrowth']);
    final reach = _map(analytics['postReach']);
    final reactions = _map(analytics['reactions']);
    final reviewItems = _list(reviews['reviews']);

    return Scaffold(
      backgroundColor: context.page,
      appBar: AppBar(
        title: const Text('Channel info'),
        backgroundColor: context.panel,
        surfaceTintColor: Colors.transparent,
        actions: [
          if (isAdmin) IconButton(tooltip: 'Edit info', onPressed: saving ? null : _editInfo, icon: const Icon(Icons.edit_outlined)),
          IconButton(tooltip: 'Refresh', onPressed: saving ? null : _load, icon: const Icon(Icons.refresh_rounded)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(14, 18, 14, 36),
          children: [
            _profileHero(
              context,
              name: displayName,
              avatar: channel['avatar']?.toString(),
              subtitle: '${private ? 'Private' : 'Public'} channel · $members subscriber${members == 1 ? '' : 's'}',
            ),
            if ((channel['desc']?.toString() ?? '').isNotEmpty) ...[
              const SizedBox(height: 14),
              SyncSoftCard(child: Text(channel['desc'].toString(), style: const TextStyle(height: 1.45))),
            ],
            const SizedBox(height: 18),
            _sectionLabel(context, 'Channel controls'),
            SyncSoftCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  SwitchListTile.adaptive(
                    secondary: const Icon(Icons.notifications_off_outlined, color: SyncColors.sky),
                    title: const Text('Mute notifications'),
                    value: muted,
                    onChanged: saving ? null : (value) => _setPreference('mute', value),
                  ),
                  if (isAdmin) ...[
                    Divider(height: 1, color: context.border),
                    ListTile(
                      leading: const Icon(Icons.lock_outline_rounded, color: SyncColors.sky),
                      title: const Text('Privacy & password'),
                      subtitle: Text(private ? 'Private channel' : 'Public channel'),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: saving ? null : _changePrivacy,
                    ),
                    Divider(height: 1, color: context.border),
                    ListTile(
                      leading: const Icon(Icons.admin_panel_settings_outlined, color: SyncColors.sky),
                      title: const Text('Permissions & moderation'),
                      subtitle: const Text('Slow mode, approvals, banned words and media rules'),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: _openAdmin,
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(child: _sectionLabel(context, 'Subscribers')),
                if (isAdmin)
                  TextButton.icon(onPressed: saving ? null : _addParticipants, icon: const Icon(Icons.person_add_alt_1_rounded), label: const Text('Add')),
              ],
            ),
            SyncSoftCard(
              padding: EdgeInsets.zero,
              child: participants.isEmpty
                  ? const ListTile(title: Text('No subscriber profiles available.'))
                  : Column(
                      children: _withDividers(
                        context,
                        participants.take(80).map((item) {
                          final name = item['fullname']?.toString() ?? item['username']?.toString() ?? 'Subscriber';
                          final id = item['userId']?.toString() ?? item['_id']?.toString() ?? '';
                          final admin = _ids(channel['adminsId']).contains(id) || channel['adminId']?.toString() == id;
                          return ListTile(
                            leading: SyncAvatar(name: name, radius: 21),
                            title: Text(name, style: const TextStyle(fontWeight: FontWeight.w800)),
                            subtitle: (item['username']?.toString() ?? '').isEmpty ? null : Text('@${item['username']}'),
                            trailing: admin
                                ? const Chip(label: Text('Admin'))
                                : isAdmin && id != currentUserId
                                    ? const Icon(Icons.more_vert_rounded)
                                    : null,
                            onTap: isAdmin && id != currentUserId ? () => _participantActions(item) : null,
                          );
                        }).toList(growable: false),
                      ),
                    ),
            ),
            const SizedBox(height: 18),
            _sectionLabel(context, '30-day analytics'),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 9,
              crossAxisSpacing: 9,
              childAspectRatio: 1.7,
              children: [
                _metric(context, 'Subscribers', _num(growth['currentSubscribers']), Icons.group_outlined),
                _metric(context, 'Net growth', _signed(growth['netLast30Days']), Icons.trending_up_rounded),
                _metric(context, 'View rate', '${_decimal(reach['viewRate'])}%', Icons.visibility_outlined),
                _metric(context, 'Reactions', _num(reactions['totalReactions']), Icons.favorite_border_rounded),
              ],
            ),
            const SizedBox(height: 18),
            _sectionLabel(context, 'Reviews'),
            SyncSoftCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: List.generate(5, (index) {
                      final value = index + 1;
                      return IconButton(
                        onPressed: saving ? null : () => setState(() => rating = value),
                        icon: Icon(value <= rating ? Icons.star_rounded : Icons.star_border_rounded, color: Colors.amber),
                      );
                    }),
                  ),
                  TextField(
                    controller: review,
                    enabled: !saving,
                    minLines: 2,
                    maxLines: 4,
                    maxLength: 500,
                    decoration: const InputDecoration(labelText: 'Your review (optional)'),
                  ),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(onPressed: saving ? null : _submitReview, icon: const Icon(Icons.rate_review_outlined), label: const Text('Save review')),
                  ),
                ],
              ),
            ),
            if (reviewItems.isNotEmpty) ...[
              const SizedBox(height: 10),
              SyncSoftCard(
                padding: EdgeInsets.zero,
                child: Column(
                  children: _withDividers(
                    context,
                    reviewItems.take(20).map((item) {
                      final author = _map(item['profile']);
                      final name = author['fullname']?.toString() ?? author['username']?.toString() ?? 'Subscriber';
                      final stars = ((item['rating'] as num?)?.toInt() ?? 0).clamp(0, 5);
                      return ListTile(
                        leading: SyncAvatar(name: name, radius: 20),
                        title: Text(name, style: const TextStyle(fontWeight: FontWeight.w800)),
                        subtitle: Text('${'★' * stars}${stars < 5 ? '☆' * (5 - stars) : ''}${(item['review']?.toString() ?? '').isEmpty ? '' : '\n${item['review']}'}'),
                      );
                    }).toList(growable: false),
                  ),
                ),
              ),
            ],
            const SizedBox(height: 18),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(foregroundColor: SyncColors.danger),
              onPressed: saving ? null : _leave,
              icon: const Icon(Icons.logout_rounded),
              label: const Text('Leave channel'),
            ),
            if (saving) ...[
              const SizedBox(height: 18),
              const LinearProgressIndicator(minHeight: 2),
            ],
          ],
        ),
      ),
    );
  }

  void _snack(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text), behavior: SnackBarBehavior.floating));
  }
}

Widget _profileHero(
  BuildContext context, {
  required String name,
  String? avatar,
  required String subtitle,
}) {
  final url = _absoluteUrl(context, avatar ?? '');
  return Column(
    children: [
      Container(
        width: 112,
        height: 112,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: SyncColors.sky.withValues(alpha: .12),
          border: Border.all(color: context.border, width: 2),
        ),
        clipBehavior: Clip.antiAlias,
        child: url.isEmpty
            ? Center(child: SyncAvatar(name: name, radius: 54))
            : Image.network(
                url,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Center(child: SyncAvatar(name: name, radius: 54)),
              ),
      ),
      const SizedBox(height: 12),
      Text(name, textAlign: TextAlign.center, style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w900)),
      const SizedBox(height: 4),
      Text(subtitle, textAlign: TextAlign.center, style: TextStyle(color: context.muted)),
    ],
  );
}

Widget _roundAction(BuildContext context, IconData icon, String label, VoidCallback action) => Material(
      color: context.panel,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: action,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 13, horizontal: 6),
          decoration: BoxDecoration(border: Border.all(color: context.border), borderRadius: BorderRadius.circular(16)),
          child: Column(
            children: [
              Icon(icon, color: SyncColors.sky),
              const SizedBox(height: 5),
              Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
            ],
          ),
        ),
      ),
    );

Widget _infoTile(IconData icon, String title, String value) => ListTile(
      leading: Icon(icon, color: SyncColors.sky),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
      subtitle: Text(value),
    );

Widget _sectionLabel(BuildContext context, String label) => Padding(
      padding: const EdgeInsets.fromLTRB(5, 0, 5, 7),
      child: Text(label.toUpperCase(), style: TextStyle(color: context.muted, fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: .7)),
    );

Widget _metric(BuildContext context, String label, String value, IconData icon) => Container(
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(color: context.panel, borderRadius: BorderRadius.circular(16), border: Border.all(color: context.border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: SyncColors.sky, size: 19),
          const Spacer(),
          Text(value, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w900)),
          Text(label, style: TextStyle(color: context.muted, fontSize: 10, fontWeight: FontWeight.w700)),
        ],
      ),
    );

List<Widget> _withDividers(BuildContext context, List<Widget> children) {
  final result = <Widget>[];
  for (var i = 0; i < children.length; i++) {
    if (i > 0) result.add(Divider(height: 1, indent: 58, color: context.border));
    result.add(children[i]);
  }
  return result;
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});
  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off_outlined, size: 48, color: SyncColors.sky),
              const SizedBox(height: 12),
              Text(message, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              FilledButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh_rounded), label: const Text('Retry')),
            ],
          ),
        ),
      );
}

String _friendId(Map<String, dynamic> inbox, String userId) {
  final owners = inbox['owners'];
  if (owners is List) {
    for (final owner in owners.whereType<Map>()) {
      final id = owner['userId']?.toString() ?? owner['_id']?.toString() ?? '';
      if (id.isNotEmpty && id != userId) return id;
    }
  }
  final ids = inbox['ownersId'];
  if (ids is List) {
    for (final raw in ids) {
      final id = raw.toString();
      if (id.isNotEmpty && id != userId) return id;
    }
  }
  return '';
}

String _roomName(Map<String, dynamic> inbox, String userId) {
  if (inbox['channel'] is Map) {
    return (inbox['channel'] as Map)['name']?.toString() ?? 'Channel';
  }
  if (inbox['group'] is Map) {
    return (inbox['group'] as Map)['name']?.toString() ?? 'Group';
  }
  final owners = inbox['owners'];
  if (owners is List) {
    for (final owner in owners.whereType<Map>()) {
      if (owner['userId']?.toString() == userId) continue;
      return owner['fullname']?.toString() ?? owner['username']?.toString() ?? 'Contact';
    }
  }
  return 'Contact';
}

bool _isAdmin(Map<String, dynamic> entity, String userId) {
  if (userId.isEmpty) return false;
  if (entity['adminId']?.toString() == userId) return true;
  return _ids(entity['adminsId']).contains(userId);
}

Set<String> _ids(dynamic value) => value is List
    ? value.map((item) => item.toString()).where((item) => item.isNotEmpty).toSet()
    : <String>{};

bool _containsUser(dynamic value, String userId) => value is List && userId.isNotEmpty && value.map((item) => item.toString()).contains(userId);

Map<String, dynamic> _map(dynamic value) => value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

List<Map<String, dynamic>> _list(dynamic value) => value is List
    ? value.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList(growable: false)
    : const [];

String _absoluteUrl(BuildContext context, String raw) {
  final value = raw.trim();
  if (value.isEmpty) return '';
  final parsed = Uri.tryParse(value);
  if (parsed?.hasScheme == true) return parsed.toString();
  final base = Uri.tryParse(context.services.config.validatedSocketUrl);
  if (base == null) return value;
  return base.resolve(value.startsWith('/') ? value.substring(1) : value).toString();
}

String _presenceLabel(Map<String, dynamic> profile) {
  final value = profile['lastSeenAt'] ?? profile['lastSeen'] ?? profile['updatedAt'];
  final date = DateTime.tryParse(value?.toString() ?? '')?.toLocal();
  if (date == null) return 'Offline';
  final now = DateTime.now();
  final diff = now.difference(date);
  if (diff.inMinutes < 1) return 'Last seen just now';
  if (diff.inMinutes < 60) return 'Last seen ${diff.inMinutes} min ago';
  if (diff.inHours < 24) return 'Last seen ${diff.inHours} h ago';
  return 'Last seen ${date.day}/${date.month}/${date.year}';
}

String _socialLabel(String platform) {
  const labels = {
    'facebook': 'Facebook',
    'instagram': 'Instagram',
    'whatsapp': 'WhatsApp',
    'linkedin': 'LinkedIn',
    'x': 'X',
    'buddy': 'Buddy',
    'twitter': 'Twitter',
    'rss': 'RSS',
    'skype': 'Skype',
    'pinterest': 'Pinterest',
    'blogger': 'Blogger',
    'vimeo': 'Vimeo',
    'youtube': 'YouTube',
    'google_plus': 'Google +',
    'website': 'Website',
    'others': 'Other',
  };
  return labels[platform] ?? platform;
}

String _num(dynamic value) => ((value as num?)?.toInt() ?? 0).toString();
String _signed(dynamic value) {
  final number = (value as num?)?.toInt() ?? 0;
  return number > 0 ? '+$number' : '$number';
}
String _decimal(dynamic value) {
  final number = (value as num?)?.toDouble() ?? 0;
  return number.toStringAsFixed(number % 1 == 0 ? 0 : 1);
}

String _errorText(Object failure) {
  if (failure is ApiException) return failure.message;
  return failure.toString().replaceFirst('Exception: ', '');
}
