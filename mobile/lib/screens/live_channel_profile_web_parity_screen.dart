import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../core/permission_manager.dart';
import '../theme.dart';
import '../widgets.dart';
import 'live_p1_room_admin_screen.dart';

class LiveChannelProfileScreen extends StatefulWidget {
  const LiveChannelProfileScreen({
    super.key,
    required this.inbox,
    required this.name,
  });

  final Map<String, dynamic> inbox;
  final String name;

  @override
  State<LiveChannelProfileScreen> createState() =>
      _LiveChannelProfileScreenState();
}

class _LiveChannelProfileScreenState extends State<LiveChannelProfileScreen> {
  final review = TextEditingController();
  final picker = ImagePicker();

  Map<String, dynamic> room = const {};
  Map<String, dynamic> channel = const {};
  Map<String, dynamic> analytics = const {};
  Map<String, dynamic> reviews = const {};
  Map<String, dynamic>? currentUser;
  List<Map<String, dynamic>> participants = const [];
  List<Map<String, dynamic>> media = const [];

  bool loading = true;
  bool saving = false;
  String? error;
  int rating = 5;

  String get channelId {
    final nested = widget.inbox['channel'];
    if (nested is Map && nested['_id'] != null) {
      return nested['_id'].toString();
    }
    return channel['_id']?.toString() ?? '';
  }

  String get roomId =>
      room['roomId']?.toString() ??
      widget.inbox['roomId']?.toString() ??
      channel['roomId']?.toString() ??
      '';

  String get currentUserId => currentUser?['_id']?.toString() ?? '';

  bool get isAdmin => _isAdmin(channel, currentUserId);

  String get displayName {
    final value = channel['name']?.toString().trim() ?? '';
    return value.isNotEmpty ? value : widget.name;
  }

  Map<String, dynamic> get permissions => _map(channel['permissions']);

  bool get canInvite =>
      isAdmin || permissions['memberCanInviteViaLink'] == true;

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
      final initial = widget.inbox['channel'] is Map
          ? Map<String, dynamic>.from(widget.inbox['channel'] as Map)
          : <String, dynamic>{};
      final id = initial['_id']?.toString() ?? channel['_id']?.toString() ?? '';
      if (id.isEmpty) {
        throw const ApiException(
          statusCode: 400,
          message: 'Channel identity is missing.',
        );
      }

      final first = await Future.wait<dynamic>([
        context.services.channels.currentUser(refresh: true),
        context.services.channels.find(id),
      ]);
      final me = Map<String, dynamic>.from(first[0] as Map);
      final foundChannel = Map<String, dynamic>.from(first[1] as Map);
      final resolvedRoomId =
          widget.inbox['roomId']?.toString() ??
          foundChannel['roomId']?.toString() ??
          '';

      final results = await Future.wait<dynamic>([
        context.services.channels.participants(id),
        context.services.api.get('/channels/$id/analytics'),
        context.services.api.get('/channels/$id/reviews'),
        resolvedRoomId.isEmpty
            ? Future<Map<String, dynamic>>.value(
                Map<String, dynamic>.from(widget.inbox),
              )
            : context.services.inbox.findByRoom(resolvedRoomId),
        resolvedRoomId.isEmpty
            ? Future<ApiEnvelope>.value(
                const ApiEnvelope(
                  statusCode: 200,
                  success: true,
                  message: null,
                  payload: <dynamic>[],
                ),
              )
            : context.services.api.get(
                '/chats/media',
                query: {'roomId': resolvedRoomId},
              ),
      ]);

      if (!mounted) return;
      final reviewPayload = _map((results[2] as ApiEnvelope).payload);
      final mine = reviewPayload['myReview'];
      setState(() {
        currentUser = me;
        channel = foundChannel;
        participants = _list(results[0]);
        analytics = _map((results[1] as ApiEnvelope).payload);
        reviews = reviewPayload;
        room = Map<String, dynamic>.from(results[3] as Map);
        media = _list((results[4] as ApiEnvelope).payload);
        rating = mine is Map
            ? ((mine['rating'] as num?)?.toInt() ?? 5).clamp(1, 5)
            : 5;
        review.text = mine is Map ? mine['review']?.toString() ?? '' : '';
        loading = false;
        saving = false;
        error = null;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        loading = false;
        saving = false;
        error = _errorText(failure);
      });
    }
  }

  Future<void> _setPreference(String action, dynamic value) async {
    if (roomId.isEmpty || saving) return;
    setState(() => saving = true);
    try {
      final next = await context.services.inbox.setPreference(
        roomId,
        action,
        value,
      );
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

  Future<void> _changeAvatar() async {
    if (!isAdmin || saving) return;
    final allowed = await AppPermissionManager.ensurePhotos(
      context,
      reason: 'Photo permission is needed to choose a channel image.',
    );
    if (!allowed || !mounted) return;

    final file = await picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 92,
      maxWidth: 1800,
      maxHeight: 1800,
    );
    if (file == null || !mounted) return;

    try {
      final bytes = await file.readAsBytes();
      final max = context.services.config.avatarUploadLimitMb * 1024 * 1024;
      if (bytes.length > max) {
        _snack(
          'Channel photo is too large. Max ${context.services.config.avatarUploadLimitMb} MB.',
        );
        return;
      }

      setState(() => saving = true);
      final envelope = await context.services.api.post(
        '/avatars',
        body: {
          'avatar': 'data:${_imageMime(file.name)};base64,${base64Encode(bytes)}',
          'targetId': channelId,
          'isGroup': false,
          'isChannel': true,
        },
      );
      final uploaded = envelope.payload?.toString() ?? '';
      if (!mounted) return;
      setState(() {
        if (uploaded.isNotEmpty) channel = {...channel, 'avatar': uploaded};
        saving = false;
      });
      _snack('Channel photo updated.');
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => saving = false);
      _snack(_errorText(failure));
    }
  }

  Future<void> _editInfo() async {
    if (!isAdmin || saving) return;
    final name = TextEditingController(text: displayName);
    final desc = TextEditingController(text: channel['desc']?.toString() ?? '');
    final formKey = GlobalKey<FormState>();

    final result = await showDialog<(String, String)>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Edit channel info'),
        content: Form(
          key: formKey,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextFormField(
                  controller: name,
                  maxLength: 32,
                  decoration: const InputDecoration(labelText: 'Channel name'),
                  validator: (value) => (value ?? '').trim().isEmpty
                      ? 'Channel name is required.'
                      : null,
                ),
                const SizedBox(height: 10),
                TextFormField(
                  controller: desc,
                  maxLength: 300,
                  minLines: 2,
                  maxLines: 5,
                  decoration: const InputDecoration(labelText: 'Description'),
                ),
              ],
            ),
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
              Navigator.pop(
                dialogContext,
                (name.text.trim(), desc.text.trim()),
              );
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
      await context.services.channels.edit(
        channelId: channelId,
        name: result.$1,
        desc: result.$2,
      );
      await _load();
      if (mounted) _snack('Channel info updated.');
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => saving = false);
      _snack(_errorText(failure));
    }
  }

  Future<void> _changePrivacy() async {
    if (!isAdmin || saving) return;
    final current = channel['accessType']?.toString() == 'private'
        ? 'private'
        : 'public';
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
                  ButtonSegment(
                    value: 'public',
                    label: Text('Public'),
                    icon: Icon(Icons.public_rounded),
                  ),
                  ButtonSegment(
                    value: 'private',
                    label: Text('Private'),
                    icon: Icon(Icons.lock_outline_rounded),
                  ),
                ],
                selected: {access},
                onSelectionChanged: (value) =>
                    setDialogState(() => access = value.first),
              ),
              if (access == 'private' && current != 'private') ...[
                const SizedBox(height: 12),
                TextField(
                  controller: password,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'Channel password',
                  ),
                ),
              ],
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () =>
                  Navigator.pop(dialogContext, (access, password.text)),
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
    password.dispose();
    if (result == null || !mounted) return;
    if (result.$1 == 'private' &&
        current != 'private' &&
        result.$2.length < 4) {
      _snack('Private channel password must be at least 4 characters.');
      return;
    }

    setState(() => saving = true);
    try {
      await context.services.channels.updatePrivacy(
        channelId,
        accessType: result.$1,
        password: result.$2,
      );
      await _load();
      if (mounted) _snack('Channel privacy updated.');
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => saving = false);
      _snack(_errorText(failure));
    }
  }

  Future<void> _changePassword() async {
    if (!isAdmin ||
        saving ||
        channel['accessType']?.toString() != 'private') {
      return;
    }

    final oldPassword = TextEditingController();
    final newPassword = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Change channel password'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: oldPassword,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Current password'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: newPassword,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'New password'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Change'),
          ),
        ],
      ),
    );
    final oldValue = oldPassword.text;
    final newValue = newPassword.text;
    oldPassword.dispose();
    newPassword.dispose();
    if (confirmed != true || !mounted) return;
    if (newValue.length < 4) {
      _snack('New password must be at least 4 characters.');
      return;
    }

    setState(() => saving = true);
    try {
      await context.services.channels.updatePassword(
        channelId,
        oldPassword: oldValue,
        newPassword: newValue,
      );
      if (!mounted) return;
      setState(() => saving = false);
      _snack('Channel password updated.');
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => saving = false);
      _snack(_errorText(failure));
    }
  }

  Future<void> _copyInvite() async {
    final invite = context.services.config.channelInviteUrl(
      channel['link']?.toString(),
    );
    if (invite.isEmpty) {
      _snack('Invite link is unavailable.');
      return;
    }
    await Clipboard.setData(ClipboardData(text: invite));
    if (mounted) _snack('Channel invite link copied.');
  }

  Future<void> _addParticipants() async {
    if (!isAdmin || saving) return;
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
                      final existing = _ids(channel['participantsId']);
                      setDialogState(() {
                        results = rows
                            .where(
                              (item) => !existing.contains(
                                item['userId']?.toString() ??
                                    item['_id']?.toString() ??
                                    '',
                              ),
                            )
                            .toList(growable: false);
                        searching = false;
                      });
                    } on Object {
                      if (dialogContext.mounted) {
                        setDialogState(() => searching = false);
                      }
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
                            final profile = _profile(item);
                            final id =
                                item['userId']?.toString() ??
                                item['_id']?.toString() ??
                                '';
                            final name = _personName(profile);
                            return CheckboxListTile(
                              value: selected.contains(id),
                              secondary: SyncAvatar(
                                name: name,
                                imageUrl: profile['avatar']?.toString(),
                                radius: 20,
                              ),
                              title: Text(name),
                              subtitle:
                                  (profile['username']?.toString() ?? '').isEmpty
                                  ? null
                                  : Text('@${profile['username']}'),
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
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: selected.isEmpty
                  ? null
                  : () => Navigator.pop(dialogContext, selected.toList()),
              child: const Text('Add'),
            ),
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
    if (!isAdmin || saving) return;
    final id =
        participant['userId']?.toString() ??
        participant['_id']?.toString() ??
        '';
    if (id.isEmpty || id == currentUserId) return;
    final admin =
        _ids(channel['adminsId']).contains(id) ||
        channel['adminId']?.toString() == id;

    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: Icon(
                admin
                    ? Icons.person_remove_alt_1_outlined
                    : Icons.admin_panel_settings_outlined,
              ),
              title: Text(admin ? 'Remove admin' : 'Make admin'),
              onTap: () {
                Navigator.pop(sheetContext);
                _changeAdmin(id, !admin);
              },
            ),
            ListTile(
              leading: const Icon(
                Icons.person_remove_outlined,
                color: SyncColors.danger,
              ),
              title: const Text(
                'Remove subscriber',
                style: TextStyle(color: SyncColors.danger),
              ),
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
    if (saving) return;
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
        content: const Text(
          'They will lose access to this channel until they subscribe again.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Remove'),
          ),
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
      await context.services.api.post(
        '/channels/$channelId/reviews',
        body: {'rating': rating, 'review': review.text.trim()},
      );
      await _load();
      if (mounted) _snack('Channel review saved.');
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => saving = false);
      _snack(_errorText(failure));
    }
  }

  Future<void> _report() async {
    if (saving || roomId.isEmpty) return;
    final reason = TextEditingController();
    String? dialogError;
    final value = await showDialog<String>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (_, setDialogState) => AlertDialog(
          title: const Text('Report channel'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Tell us what is wrong with this channel. Your report is sent to SyncChat moderation.',
              ),
              const SizedBox(height: 12),
              TextField(
                controller: reason,
                maxLength: 500,
                minLines: 3,
                maxLines: 5,
                decoration: const InputDecoration(labelText: 'Reason'),
              ),
              if (dialogError != null)
                Text(
                  dialogError!,
                  style: const TextStyle(color: SyncColors.danger),
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
                final clean = reason.text.trim();
                if (clean.length < 3) {
                  setDialogState(
                    () => dialogError = 'Reason must be at least 3 characters.',
                  );
                  return;
                }
                Navigator.pop(dialogContext, clean);
              },
              child: const Text('Report'),
            ),
          ],
        ),
      ),
    );
    reason.dispose();
    if (value == null || !mounted) return;

    setState(() => saving = true);
    try {
      await context.services.api.post(
        '/reports/chat',
        body: {
          'roomId': roomId,
          'roomType': 'group',
          'targetId': channelId,
          'reason': value,
        },
      );
      if (!mounted) return;
      setState(() => saving = false);
      _snack('Channel reported successfully.');
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
          inbox: {...room, 'channel': channel, 'roomType': 'group'},
          currentUserId: currentUserId,
        ),
      ),
    );
    if (mounted) await _load();
  }

  Future<void> _leave() async {
    if (saving) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Leave channel?'),
        content: Text('Stop receiving updates from $displayName?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Leave'),
          ),
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
      return Scaffold(
        backgroundColor: context.page,
        appBar: AppBar(title: const Text('Channel info')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }
    if (error != null && channel.isEmpty) {
      return Scaffold(
        backgroundColor: context.page,
        appBar: AppBar(title: const Text('Channel info')),
        body: _ErrorState(message: error!, onRetry: _load),
      );
    }

    final memberCount = _ids(channel['participantsId']).length;
    final private = channel['accessType']?.toString() == 'private';
    final muted = _containsUser(room['mutedBy'], currentUserId);
    final favourite = _containsUser(room['favouriteBy'], currentUserId);
    final listed = _containsUser(room['listedBy'], currentUserId);
    final advancedPrivacy = _containsUser(
      room['privacyShieldBy'],
      currentUserId,
    );
    final notificationToneBy = _map(room['notificationToneBy']);
    final rawTone = notificationToneBy[currentUserId]?.toString() ?? '';
    final notificationTone = const {
      'default-ringtone',
      'classic-bell',
      'digital-pop',
      'soft-chime',
    }.contains(rawTone)
        ? rawTone
        : 'default-ringtone';

    final mediaItems = media
        .where(
          (item) => item['kind'] == 'photo' || item['kind'] == 'video',
        )
        .toList(growable: false);
    final links = media.where((item) => item['kind'] == 'link').length;
    final files = media.where((item) => item['kind'] == 'file').length;
    final growth = _map(analytics['subscriberGrowth']);
    final reach = _map(analytics['postReach']);
    final reactions = _map(analytics['reactions']);
    final reviewItems = _list(reviews['reviews']);
    final invite = context.services.config.channelInviteUrl(
      channel['link']?.toString(),
    );

    return Scaffold(
      backgroundColor: context.page,
      appBar: AppBar(
        title: const Text('Channel info'),
        backgroundColor: context.panel,
        surfaceTintColor: Colors.transparent,
        actions: [
          if (isAdmin)
            IconButton(
              tooltip: 'Edit info',
              onPressed: saving ? null : _editInfo,
              icon: const Icon(Icons.edit_outlined),
            ),
          IconButton(
            tooltip: 'Refresh',
            onPressed: saving ? null : _load,
            icon: const Icon(Icons.refresh_rounded),
          ),
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
              subtitle:
                  '${private ? 'Private' : 'Public'} channel · $memberCount subscriber${memberCount == 1 ? '' : 's'}',
              onAvatarTap: isAdmin && !saving ? _changeAvatar : null,
            ),
            if ((channel['desc']?.toString() ?? '').isNotEmpty) ...[
              const SizedBox(height: 14),
              SyncSoftCard(
                child: Text(
                  channel['desc'].toString(),
                  style: const TextStyle(height: 1.45),
                ),
              ),
            ],
            const SizedBox(height: 18),
            _sectionLabel(context, 'Channel settings'),
            SyncSoftCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: _withDividers(context, [
                  SwitchListTile.adaptive(
                    secondary: const Icon(
                      Icons.notifications_off_outlined,
                      color: SyncColors.sky,
                    ),
                    title: const Text('Mute notifications'),
                    value: muted,
                    onChanged: saving
                        ? null
                        : (value) => _setPreference('mute', value),
                  ),
                  ListTile(
                    leading: const Icon(
                      Icons.music_note_outlined,
                      color: SyncColors.sky,
                    ),
                    title: const Text('Notification tone'),
                    trailing: DropdownButton<String>(
                      value: notificationTone,
                      underline: const SizedBox.shrink(),
                      items: const [
                        DropdownMenuItem(
                          value: 'default-ringtone',
                          child: Text('Default'),
                        ),
                        DropdownMenuItem(
                          value: 'classic-bell',
                          child: Text('Classic'),
                        ),
                        DropdownMenuItem(
                          value: 'digital-pop',
                          child: Text('Digital'),
                        ),
                        DropdownMenuItem(
                          value: 'soft-chime',
                          child: Text('Soft'),
                        ),
                      ],
                      onChanged: saving
                          ? null
                          : (value) {
                              if (value != null) {
                                _setPreference('notificationTone', value);
                              }
                            },
                    ),
                  ),
                  SwitchListTile.adaptive(
                    secondary: const Icon(
                      Icons.star_border_rounded,
                      color: SyncColors.sky,
                    ),
                    title: const Text('Favourite'),
                    value: favourite,
                    onChanged: saving
                        ? null
                        : (value) => _setPreference('favourite', value),
                  ),
                  SwitchListTile.adaptive(
                    secondary: const Icon(
                      Icons.format_list_bulleted_rounded,
                      color: SyncColors.sky,
                    ),
                    title: const Text('Add to list'),
                    value: listed,
                    onChanged: saving
                        ? null
                        : (value) => _setPreference('list', value),
                  ),
                  SwitchListTile.adaptive(
                    secondary: const Icon(
                      Icons.shield_outlined,
                      color: SyncColors.sky,
                    ),
                    title: const Text('Advanced privacy'),
                    subtitle: const Text(
                      'Apply the room privacy shield to this channel.',
                    ),
                    value: advancedPrivacy,
                    onChanged: saving
                        ? null
                        : (value) => _setPreference(
                            'advancedPrivacy',
                            value,
                          ),
                  ),
                ]),
              ),
            ),
            if (canInvite && invite.isNotEmpty) ...[
              const SizedBox(height: 18),
              _sectionLabel(context, 'Invite link'),
              SyncSoftCard(
                padding: EdgeInsets.zero,
                child: ListTile(
                  leading: const Icon(
                    Icons.link_rounded,
                    color: SyncColors.sky,
                  ),
                  title: const Text(
                    'Channel invite',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                  subtitle: Text(
                    invite,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  trailing: IconButton(
                    tooltip: 'Copy invite link',
                    onPressed: _copyInvite,
                    icon: const Icon(Icons.copy_rounded),
                  ),
                  onTap: _copyInvite,
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
                    leading: const Icon(
                      Icons.photo_library_outlined,
                      color: SyncColors.sky,
                    ),
                    title: const Text(
                      'Media, links and files',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
                    subtitle: Text(
                      '${mediaItems.length} media · $links links · $files files',
                    ),
                  ),
                  if (mediaItems.isNotEmpty) ...[
                    Divider(height: 1, color: context.border),
                    SizedBox(
                      height: 88,
                      child: ListView.separated(
                        padding: const EdgeInsets.all(9),
                        scrollDirection: Axis.horizontal,
                        itemCount: mediaItems.take(20).length,
                        separatorBuilder: (_, __) => const SizedBox(width: 7),
                        itemBuilder: (_, index) {
                          final item = mediaItems[index];
                          final file = _map(item['file']);
                          final url = context.services.config.resolveMediaUrl(
                            file['url']?.toString(),
                          );
                          return ClipRRect(
                            borderRadius: BorderRadius.circular(10),
                            child: url.isEmpty
                                ? Container(
                                    width: 72,
                                    color: context.softPanel,
                                    child: const Icon(Icons.image_outlined),
                                  )
                                : Image.network(
                                    url,
                                    width: 72,
                                    height: 72,
                                    fit: BoxFit.cover,
                                    errorBuilder: (_, __, ___) => Container(
                                      width: 72,
                                      color: context.softPanel,
                                      child: const Icon(
                                        Icons.broken_image_outlined,
                                      ),
                                    ),
                                  ),
                          );
                        },
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (isAdmin) ...[
              const SizedBox(height: 18),
              _sectionLabel(context, 'Admin controls'),
              SyncSoftCard(
                padding: EdgeInsets.zero,
                child: Column(
                  children: _withDividers(context, [
                    ListTile(
                      leading: const Icon(
                        Icons.photo_camera_outlined,
                        color: SyncColors.sky,
                      ),
                      title: const Text('Change channel photo'),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: saving ? null : _changeAvatar,
                    ),
                    ListTile(
                      leading: const Icon(
                        Icons.lock_outline_rounded,
                        color: SyncColors.sky,
                      ),
                      title: const Text('Privacy & password'),
                      subtitle: Text(
                        private ? 'Private channel' : 'Public channel',
                      ),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: saving ? null : _changePrivacy,
                    ),
                    if (private)
                      ListTile(
                        leading: const Icon(
                          Icons.password_rounded,
                          color: SyncColors.sky,
                        ),
                        title: const Text('Change password'),
                        trailing: const Icon(Icons.chevron_right_rounded),
                        onTap: saving ? null : _changePassword,
                      ),
                    ListTile(
                      leading: const Icon(
                        Icons.admin_panel_settings_outlined,
                        color: SyncColors.sky,
                      ),
                      title: const Text('Permissions & moderation'),
                      subtitle: const Text(
                        'Slow mode, approvals, banned words and media rules',
                      ),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: _openAdmin,
                    ),
                  ]),
                ),
              ),
            ],
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(child: _sectionLabel(context, 'Subscribers')),
                if (isAdmin)
                  TextButton.icon(
                    onPressed: saving ? null : _addParticipants,
                    icon: const Icon(Icons.person_add_alt_1_rounded),
                    label: const Text('Add'),
                  ),
              ],
            ),
            SyncSoftCard(
              padding: EdgeInsets.zero,
              child: participants.isEmpty
                  ? const ListTile(
                      title: Text('No subscriber profiles available.'),
                    )
                  : Column(
                      children: _withDividers(
                        context,
                        participants.take(80).map((item) {
                          final profile = _profile(item);
                          final name = _personName(profile);
                          final id =
                              item['userId']?.toString() ??
                              item['_id']?.toString() ??
                              '';
                          final admin =
                              _ids(channel['adminsId']).contains(id) ||
                              channel['adminId']?.toString() == id;
                          return ListTile(
                            leading: SyncAvatar(
                              name: name,
                              imageUrl: profile['avatar']?.toString(),
                              radius: 21,
                            ),
                            title: Text(
                              name,
                              style: const TextStyle(fontWeight: FontWeight.w800),
                            ),
                            subtitle:
                                (profile['username']?.toString() ?? '').isEmpty
                                ? null
                                : Text('@${profile['username']}'),
                            trailing: admin
                                ? const Chip(label: Text('Admin'))
                                : isAdmin && id != currentUserId
                                ? const Icon(Icons.more_vert_rounded)
                                : null,
                            onTap: isAdmin && id != currentUserId
                                ? () => _participantActions(item)
                                : null,
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
                _metric(
                  context,
                  'Subscribers',
                  _num(growth['currentSubscribers']),
                  Icons.group_outlined,
                ),
                _metric(
                  context,
                  'Net growth',
                  _signed(growth['netLast30Days']),
                  Icons.trending_up_rounded,
                ),
                _metric(
                  context,
                  'View rate',
                  '${_decimal(reach['viewRate'])}%',
                  Icons.visibility_outlined,
                ),
                _metric(
                  context,
                  'Reactions',
                  _num(reactions['totalReactions']),
                  Icons.favorite_border_rounded,
                ),
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
                        onPressed: saving
                            ? null
                            : () => setState(() => rating = value),
                        icon: Icon(
                          value <= rating
                              ? Icons.star_rounded
                              : Icons.star_border_rounded,
                          color: Colors.amber,
                        ),
                      );
                    }),
                  ),
                  TextField(
                    controller: review,
                    enabled: !saving,
                    minLines: 2,
                    maxLines: 4,
                    maxLength: 500,
                    decoration: const InputDecoration(
                      labelText: 'Your review (optional)',
                    ),
                  ),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: saving ? null : _submitReview,
                      icon: const Icon(Icons.rate_review_outlined),
                      label: const Text('Save review'),
                    ),
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
                      final author = _profile(item);
                      final name = _personName(author);
                      final stars = ((item['rating'] as num?)?.toInt() ?? 0)
                          .clamp(0, 5);
                      return ListTile(
                        leading: SyncAvatar(
                          name: name,
                          imageUrl: author['avatar']?.toString(),
                          radius: 20,
                        ),
                        title: Text(
                          name,
                          style: const TextStyle(fontWeight: FontWeight.w800),
                        ),
                        subtitle: Text(
                          '${'★' * stars}${stars < 5 ? '☆' * (5 - stars) : ''}${(item['review']?.toString() ?? '').isEmpty ? '' : '\n${item['review']}'}',
                        ),
                      );
                    }).toList(growable: false),
                  ),
                ),
              ),
            ],
            const SizedBox(height: 18),
            _sectionLabel(context, 'Channel actions'),
            SyncSoftCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: _withDividers(context, [
                  ListTile(
                    leading: const Icon(
                      Icons.flag_outlined,
                      color: SyncColors.danger,
                    ),
                    title: const Text(
                      'Report channel',
                      style: TextStyle(color: SyncColors.danger),
                    ),
                    onTap: saving ? null : _report,
                  ),
                  ListTile(
                    leading: const Icon(
                      Icons.logout_rounded,
                      color: SyncColors.danger,
                    ),
                    title: const Text(
                      'Leave channel',
                      style: TextStyle(color: SyncColors.danger),
                    ),
                    onTap: saving ? null : _leave,
                  ),
                ]),
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
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(text), behavior: SnackBarBehavior.floating),
    );
  }
}

Widget _profileHero(
  BuildContext context, {
  required String name,
  String? avatar,
  required String subtitle,
  VoidCallback? onAvatarTap,
}) {
  final url = context.services.config.resolveMediaUrl(avatar);
  final avatarWidget = Container(
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
            errorBuilder: (_, __, ___) =>
                Center(child: SyncAvatar(name: name, radius: 54)),
          ),
  );

  return Column(
    children: [
      if (onAvatarTap == null)
        avatarWidget
      else
        InkWell(
          customBorder: const CircleBorder(),
          onTap: onAvatarTap,
          child: Stack(
            alignment: Alignment.bottomRight,
            children: [
              avatarWidget,
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: context.panel,
                  border: Border.all(color: context.border),
                ),
                child: const Icon(
                  Icons.photo_camera_outlined,
                  size: 18,
                  color: SyncColors.sky,
                ),
              ),
            ],
          ),
        ),
      const SizedBox(height: 12),
      Text(
        name,
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w900),
      ),
      const SizedBox(height: 4),
      Text(
        subtitle,
        textAlign: TextAlign.center,
        style: TextStyle(color: context.muted),
      ),
    ],
  );
}

Widget _sectionLabel(BuildContext context, String label) => Padding(
  padding: const EdgeInsets.fromLTRB(5, 0, 5, 7),
  child: Text(
    label.toUpperCase(),
    style: TextStyle(
      color: context.muted,
      fontSize: 11,
      fontWeight: FontWeight.w900,
      letterSpacing: .7,
    ),
  ),
);

Widget _metric(
  BuildContext context,
  String label,
  String value,
  IconData icon,
) => Container(
  padding: const EdgeInsets.all(13),
  decoration: BoxDecoration(
    color: context.panel,
    borderRadius: BorderRadius.circular(16),
    border: Border.all(color: context.border),
  ),
  child: Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    mainAxisAlignment: MainAxisAlignment.center,
    children: [
      Icon(icon, color: SyncColors.sky, size: 19),
      const Spacer(),
      Text(
        value,
        style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w900),
      ),
      Text(
        label,
        style: TextStyle(
          color: context.muted,
          fontSize: 10,
          fontWeight: FontWeight.w700,
        ),
      ),
    ],
  ),
);

List<Widget> _withDividers(BuildContext context, List<Widget> children) {
  final result = <Widget>[];
  for (var i = 0; i < children.length; i++) {
    if (i > 0) {
      result.add(Divider(height: 1, indent: 58, color: context.border));
    }
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
          const Icon(
            Icons.cloud_off_outlined,
            size: 48,
            color: SyncColors.sky,
          ),
          const SizedBox(height: 12),
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

Map<String, dynamic> _profile(Map<String, dynamic> item) {
  final nested = item['profile'];
  if (nested is Map) return Map<String, dynamic>.from(nested);
  return item;
}

String _personName(Map<String, dynamic> profile) =>
    (profile['fullname'] ?? profile['username'] ?? 'Subscriber').toString();

Map<String, dynamic> _map(dynamic value) =>
    value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

List<Map<String, dynamic>> _list(dynamic value) => value is List
    ? value
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList(growable: false)
    : const [];

Set<String> _ids(dynamic value) => value is List
    ? value
          .map((item) => item.toString())
          .where((item) => item.isNotEmpty)
          .toSet()
    : const <String>{};

bool _containsUser(dynamic value, String userId) =>
    userId.isNotEmpty && _ids(value).contains(userId);

bool _isAdmin(Map<String, dynamic> entity, String userId) {
  if (userId.isEmpty) return false;
  if (entity['adminId']?.toString() == userId) return true;
  return _ids(entity['adminsId']).contains(userId);
}

String _errorText(Object failure) {
  if (failure is ApiException) return failure.message;
  return failure.toString().replaceFirst('Exception: ', '');
}

String _imageMime(String filename) {
  final lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

String _num(dynamic value) => ((value as num?)?.toInt() ?? 0).toString();

String _signed(dynamic value) {
  final number = (value as num?)?.toInt() ?? 0;
  return number > 0 ? '+$number' : '$number';
}

String _decimal(dynamic value) {
  final number = (value as num?)?.toDouble() ?? 0;
  if (number == number.roundToDouble()) return number.toInt().toString();
  return number.toStringAsFixed(1);
}
