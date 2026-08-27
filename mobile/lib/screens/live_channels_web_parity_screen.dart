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
import 'live_entity_profile_screen.dart';

class ChannelHubScreen extends StatefulWidget {
  const ChannelHubScreen({super.key});

  @override
  State<ChannelHubScreen> createState() => _ChannelHubScreenState();
}

class _ChannelHubScreenState extends State<ChannelHubScreen> {
  final picker = ImagePicker();
  final name = TextEditingController();
  final desc = TextEditingController();
  final password = TextEditingController();

  List<Map<String, dynamic>> channels = const [];
  String accessType = 'public';
  String? avatarDataUri;
  String? error;
  bool loading = true;
  bool creating = false;
  String? busyChannelId;
  bool bound = false;
  Timer? reloadTimer;

  List<Map<String, dynamic>> get joined =>
      channels.where((item) => item['subscribed'] == true).toList(growable: false);
  List<Map<String, dynamic>> get discover =>
      channels.where((item) => item['subscribed'] != true).toList(growable: false);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (bound) return;
    bound = true;
    context.services.realtime.on('channel/create', _onChannelEvent);
    context.services.realtime.on('channel/edit', _onChannelEvent);
  }

  @override
  void dispose() {
    reloadTimer?.cancel();
    if (bound) {
      context.services.realtime.off('channel/create', _onChannelEvent);
      context.services.realtime.off('channel/edit', _onChannelEvent);
    }
    name.dispose();
    desc.dispose();
    password.dispose();
    super.dispose();
  }

  void _onChannelEvent(dynamic _) {
    if (!mounted) return;
    reloadTimer?.cancel();
    reloadTimer = Timer(const Duration(milliseconds: 180), () {
      if (mounted) unawaited(_load(showSpinner: false));
    });
  }

  Future<void> _load({bool showSpinner = true}) async {
    if (!mounted) return;
    if (showSpinner) {
      setState(() {
        loading = true;
        error = null;
      });
    }
    try {
      final rows = await context.services.channels.list();
      if (!mounted) return;
      setState(() {
        channels = rows;
        loading = false;
        error = null;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        loading = false;
        error = _errorText(failure);
      });
    }
  }

  Future<void> _pickAvatar() async {
    final allowed = await AppPermissionManager.ensurePhotos(
      context,
      reason: 'Photo permission is needed to choose a channel image.',
    );
    if (!allowed || !mounted) return;
    final file = await picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 90,
      maxWidth: 1400,
      maxHeight: 1400,
    );
    if (file == null || !mounted) return;
    try {
      final bytes = await file.readAsBytes();
      final max = context.services.config.avatarUploadLimitMb * 1024 * 1024;
      if (bytes.length >= max) {
        setState(() => error = 'Image too large (max ${context.services.config.avatarUploadLimitMb} MB)');
        return;
      }
      setState(() {
        avatarDataUri = 'data:${_imageMime(file.name)};base64,${base64Encode(bytes)}';
        error = null;
      });
    } on Object catch (failure) {
      if (mounted) setState(() => error = _errorText(failure));
    }
  }

  Future<void> _create() async {
    final cleanName = name.text.trim();
    final cleanDesc = desc.text.trim();
    if (cleanName.length < 3 || cleanName.length > 32) {
      setState(() => error = 'Channel name must be between 3 and 32 characters');
      return;
    }
    if (cleanDesc.length > 300) {
      setState(() => error = 'Channel description is too long');
      return;
    }
    if (accessType == 'private' && password.text.length < 4) {
      setState(() => error = 'Private channel password must be at least 4 characters');
      return;
    }
    setState(() {
      creating = true;
      error = null;
    });
    try {
      await context.services.channels.create(
        name: cleanName,
        desc: cleanDesc,
        accessType: accessType,
        password: accessType == 'private' ? password.text : '',
        avatarDataUri: avatarDataUri,
      );
      if (!mounted) return;
      name.clear();
      desc.clear();
      password.clear();
      setState(() {
        accessType = 'public';
        avatarDataUri = null;
      });
      await _load(showSpinner: false);
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => error = _errorText(failure));
    } finally {
      if (mounted) setState(() => creating = false);
    }
  }

  Future<String?> _askPassword(Map<String, dynamic> channel, {required String mode}) async {
    final controller = TextEditingController();
    String? dialogError;
    final value = await showDialog<String>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(mode == 'join' ? 'Join private channel' : 'Open private channel'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Enter the password for ${channel['name'] ?? 'this channel'}.'),
              const SizedBox(height: 12),
              TextField(
                controller: controller,
                autofocus: true,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Channel password'),
                onSubmitted: (_) {
                  if (controller.text.isEmpty) {
                    setDialogState(() => dialogError = 'Password is required');
                  } else {
                    Navigator.pop(dialogContext, controller.text);
                  }
                },
              ),
              if (dialogError != null) ...[
                const SizedBox(height: 8),
                Text(dialogError!, style: const TextStyle(color: SyncColors.danger)),
              ],
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
            FilledButton(
              onPressed: () {
                if (controller.text.isEmpty) {
                  setDialogState(() => dialogError = 'Password is required');
                  return;
                }
                Navigator.pop(dialogContext, controller.text);
              },
              child: const Text('Continue'),
            ),
          ],
        ),
      ),
    );
    controller.dispose();
    return value;
  }

  bool _private(Map<String, dynamic> channel) =>
      channel['accessType']?.toString() == 'private' || channel['requiresPassword'] == true;

  Future<bool> _verifyOpen(Map<String, dynamic> channel) async {
    if (!_private(channel)) return true;
    final value = await _askPassword(channel, mode: 'open');
    if (value == null || !mounted) return false;
    try {
      await context.services.channels.verifyPassword(
        channel['_id']?.toString() ?? '',
        value,
      );
      return true;
    } on Object catch (failure) {
      if (mounted) setState(() => error = _errorText(failure));
      return false;
    }
  }

  Map<String, dynamic> _channelInbox(Map<String, dynamic> channel) => {
        'roomId': channel['roomId']?.toString() ?? '',
        'roomType': 'group',
        'ownersId': channel['participantsId'] is List ? channel['participantsId'] : <dynamic>[],
        'group': channel,
        'channel': channel,
      };

  Future<void> _openChannelRoom(Map<String, dynamic> channel) async {
    final roomId = channel['roomId']?.toString() ?? '';
    if (roomId.isEmpty) return;
    final unlocked = await _verifyOpen(channel);
    if (!unlocked || !mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => LiveChatRoomScreen(
          inbox: _channelInbox(channel),
          name: channel['name']?.toString() ?? 'Channel',
        ),
      ),
    );
  }

  Future<void> _openChannelInfo(Map<String, dynamic> channel) async {
    final unlocked = await _verifyOpen(channel);
    if (!unlocked || !mounted) return;
    try {
      final user = await context.services.channels.currentUser();
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => LiveEntityProfileScreen(
            inbox: _channelInbox(channel),
            currentUserId: user['_id']?.toString() ?? '',
          ),
        ),
      );
    } on Object catch (failure) {
      if (mounted) setState(() => error = _errorText(failure));
    }
  }

  Future<void> _subscribe(Map<String, dynamic> channel) async {
    final id = channel['_id']?.toString() ?? '';
    if (id.isEmpty || busyChannelId != null) return;
    var channelPassword = '';
    if (_private(channel)) {
      final value = await _askPassword(channel, mode: 'join');
      if (value == null) return;
      channelPassword = value;
    }
    setState(() {
      busyChannelId = id;
      error = null;
    });
    try {
      final payload = await context.services.channels.subscribe(
        id,
        password: channelPassword,
      );
      if (!mounted) return;
      final inbox = _map(payload['inbox']);
      await _load(showSpinner: false);
      if (!mounted) return;
      if (inbox.isNotEmpty && (inbox['roomId']?.toString() ?? '').isNotEmpty) {
        final channelData = _map(inbox['channel']).isNotEmpty ? _map(inbox['channel']) : channel;
        await Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) => LiveChatRoomScreen(
              inbox: {
                ...inbox,
                'roomType': 'group',
                'group': channelData,
                'channel': channelData,
              },
              name: channelData['name']?.toString() ?? 'Channel',
            ),
          ),
        );
      } else {
        final fresh = channels.cast<Map<String, dynamic>>().where((item) => item['_id']?.toString() == id).toList();
        if (fresh.isNotEmpty) await _openChannelRoom(fresh.first);
      }
    } on Object catch (failure) {
      if (mounted) setState(() => error = _errorText(failure));
    } finally {
      if (mounted) setState(() => busyChannelId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SyncStandardPage(
      title: 'Channels',
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
            Text(
              'Broadcast-style rooms with subscriber controls',
              style: TextStyle(fontSize: 12, color: context.muted),
            ),
            const SizedBox(height: 12),
            _createPanel(),
            if (error != null) ...[
              const SizedBox(height: 10),
              Text(error!, style: const TextStyle(color: SyncColors.danger)),
            ],
            const SizedBox(height: 16),
            _sectionLabel('Joined'),
            if (loading && channels.isEmpty)
              const Padding(
                padding: EdgeInsets.all(30),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (joined.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 10),
                child: Text('No subscribed channels yet', style: TextStyle(color: context.muted)),
              )
            else
              ...joined.map(_joinedTile),
            const SizedBox(height: 18),
            _sectionLabel('Discover'),
            if (!loading && discover.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 10),
                child: Text('No discoverable channels available', style: TextStyle(color: context.muted)),
              )
            else
              ...discover.map(_discoverTile),
          ],
        ),
      ),
    );
  }

  Widget _createPanel() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.softPanel,
        border: Border.symmetric(
          horizontal: BorderSide(color: context.border),
        ),
      ),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              InkWell(
                onTap: creating ? null : _pickAvatar,
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
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  children: [
                    TextField(
                      controller: name,
                      enabled: !creating,
                      maxLength: 32,
                      decoration: const InputDecoration(
                        counterText: '',
                        hintText: 'Channel name',
                      ),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: desc,
                      enabled: !creating,
                      maxLength: 300,
                      minLines: 2,
                      maxLines: 2,
                      decoration: const InputDecoration(
                        counterText: '',
                        hintText: 'Description',
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: accessType,
                  decoration: const InputDecoration(),
                  items: const [
                    DropdownMenuItem(value: 'public', child: Text('Public channel')),
                    DropdownMenuItem(value: 'private', child: Text('Private channel')),
                  ],
                  onChanged: creating
                      ? null
                      : (value) => setState(() {
                            accessType = value ?? 'public';
                            if (accessType == 'public') password.clear();
                          }),
                ),
              ),
              const SizedBox(width: 8),
              FilledButton(
                onPressed: creating ? null : _create,
                child: Text(creating ? 'Creating...' : 'Create'),
              ),
            ],
          ),
          if (accessType == 'private') ...[
            const SizedBox(height: 10),
            TextField(
              controller: password,
              enabled: !creating,
              obscureText: true,
              decoration: const InputDecoration(hintText: 'Channel password'),
            ),
          ],
        ],
      ),
    );
  }

  Widget _sectionLabel(String label) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        label.toUpperCase(),
        style: TextStyle(
          color: context.muted,
          fontSize: 11,
          fontWeight: FontWeight.w900,
          letterSpacing: 1.5,
        ),
      ),
    );
  }

  Widget _joinedTile(Map<String, dynamic> channel) {
    final privateChannel = _private(channel);
    return Card(
      color: context.panel,
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(color: context.border),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        leading: SyncAvatar(
          name: channel['name']?.toString() ?? 'Channel',
          imageUrl: channel['avatar']?.toString(),
          radius: 24,
        ),
        title: Row(
          children: [
            if (privateChannel) ...[
              const Icon(Icons.lock_outline_rounded, size: 15),
              const SizedBox(width: 4),
            ],
            Expanded(
              child: Text(
                channel['name']?.toString() ?? 'Channel',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w900),
              ),
            ),
          ],
        ),
        subtitle: Text(
          (channel['desc']?.toString() ?? '').trim().isEmpty
              ? 'No description yet'
              : channel['desc'].toString(),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: IconButton(
          tooltip: 'Channel info',
          onPressed: () => _openChannelInfo(channel),
          icon: const Icon(Icons.info_outline_rounded),
        ),
        onTap: () => _openChannelRoom(channel),
      ),
    );
  }

  Widget _discoverTile(Map<String, dynamic> channel) {
    final id = channel['_id']?.toString() ?? '';
    final busy = busyChannelId == id;
    final privateChannel = _private(channel);
    final total = (channel['totalSubscribers'] as num?)?.toInt() ??
        (channel['participantsId'] is List ? (channel['participantsId'] as List).length : 0);
    return Card(
      color: context.panel,
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(color: context.border),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        leading: SyncAvatar(
          name: channel['name']?.toString() ?? 'Channel',
          imageUrl: channel['avatar']?.toString(),
          radius: 24,
        ),
        title: Row(
          children: [
            if (privateChannel) ...[
              const Icon(Icons.lock_outline_rounded, size: 15),
              const SizedBox(width: 4),
            ],
            Expanded(
              child: Text(
                channel['name']?.toString() ?? 'Channel',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w900),
              ),
            ),
          ],
        ),
        subtitle: Text('$total subscribers'),
        trailing: busy
            ? const SizedBox.square(
                dimension: 28,
                child: Padding(
                  padding: EdgeInsets.all(5),
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              )
            : FilledButton(
                onPressed: () => _subscribe(channel),
                child: const Text('Join'),
              ),
      ),
    );
  }
}

Map<String, dynamic> _map(dynamic value) =>
    value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

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
