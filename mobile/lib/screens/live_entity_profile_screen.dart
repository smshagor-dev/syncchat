import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../theme.dart';
import '../widgets.dart';
import 'live_channel_insights_screen.dart';
import 'live_groups_screen.dart';
import 'live_p1_room_admin_screen.dart';
import 'live_p1_room_security_screen.dart';

class LiveEntityProfileScreen extends StatelessWidget {
  const LiveEntityProfileScreen({
    super.key,
    required this.inbox,
    required this.currentUserId,
  });

  final Map<String, dynamic> inbox;
  final String currentUserId;

  @override
  Widget build(BuildContext context) {
    if (inbox['roomType']?.toString() == 'private') {
      return LiveFriendProfileScreen(
        inbox: inbox,
        currentUserId: currentUserId,
      );
    }
    if (inbox['channel'] is Map) {
      return LiveChannelProfileScreen(
        inbox: inbox,
        currentUserId: currentUserId,
      );
    }
    return LiveGroupInfoScreen(inbox: inbox);
  }
}

class LiveFriendProfileScreen extends StatefulWidget {
  const LiveFriendProfileScreen({
    super.key,
    required this.inbox,
    required this.currentUserId,
  });

  final Map<String, dynamic> inbox;
  final String currentUserId;

  @override
  State<LiveFriendProfileScreen> createState() => _LiveFriendProfileScreenState();
}

class _LiveFriendProfileScreenState extends State<LiveFriendProfileScreen> {
  Map<String, dynamic> profile = const {};
  Map<String, dynamic> room = const {};
  Map<String, dynamic> blockState = const {};
  List<Map<String, dynamic>> commonGroups = const [];
  List<Map<String, dynamic>> media = const [];
  bool loading = true;
  bool busy = false;
  String? error;

  String get roomId => widget.inbox['roomId']?.toString() ?? '';

  String get friendId {
    final owners = widget.inbox['owners'];
    if (owners is List) {
      for (final owner in owners.whereType<Map>()) {
        final id = owner['userId']?.toString() ?? '';
        if (id.isNotEmpty && id != widget.currentUserId) return id;
      }
    }
    final ids = widget.inbox['ownersId'];
    if (ids is List) {
      for (final value in ids) {
        final id = value.toString();
        if (id.isNotEmpty && id != widget.currentUserId) return id;
      }
    }
    return '';
  }

  String get displayName =>
      (profile['fullname'] ?? profile['username'] ?? 'Contact').toString();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    if (friendId.isEmpty) {
      setState(() {
        loading = false;
        error = 'Contact identity is missing.';
      });
      return;
    }
    if (mounted) {
      setState(() {
        loading = true;
        error = null;
      });
    }
    try {
      final responses = await Future.wait<dynamic>([
        context.services.profile.getProfile(friendId),
        roomId.isEmpty
            ? Future<Map<String, dynamic>>.value(const {})
            : context.services.inbox.findByRoom(roomId),
        context.services.contacts.blockState(friendId),
        context.services.api.get('/profiles/$friendId/common-groups'),
        roomId.isEmpty
            ? Future<ApiEnvelope>.value(
                const ApiEnvelope(
                  statusCode: 200,
                  success: true,
                  message: null,
                  payload: <dynamic>[],
                ),
              )
            : context.services.api.get('/chats/media', query: {'roomId': roomId}),
      ]);
      if (!mounted) return;
      setState(() {
        profile = Map<String, dynamic>.from(responses[0] as Map);
        room = Map<String, dynamic>.from(responses[1] as Map);
        blockState = Map<String, dynamic>.from(responses[2] as Map);
        commonGroups = _asList((responses[3] as ApiEnvelope).payload);
        media = _asList((responses[4] as ApiEnvelope).payload);
        loading = false;
        busy = false;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        loading = false;
        busy = false;
        error = _errorText(failure);
      });
    }
  }

  bool _containsMe(dynamic value) =>
      value is List && value.map((e) => e.toString()).contains(widget.currentUserId);

  Future<void> _pref(String action, dynamic value) async {
    if (roomId.isEmpty || busy) return;
    setState(() => busy = true);
    try {
      final updated = await context.services.inbox.setPreference(roomId, action, value);
      if (!mounted) return;
      setState(() {
        if (updated.isNotEmpty) room = updated;
        busy = false;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => busy = false);
      _snack(_errorText(failure));
    }
  }

  Future<void> _toggleBlock() async {
    if (busy || friendId.isEmpty) return;
    setState(() => busy = true);
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
        busy = false;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => busy = false);
      _snack(_errorText(failure));
    }
  }

  Future<void> _setSaved(bool saved) async {
    if (busy || friendId.isEmpty) return;
    setState(() => busy = true);
    try {
      if (saved) {
        await context.services.contacts.delete(friendId);
      } else {
        final identity = (profile['username'] ?? profile['email'] ?? profile['phone'] ?? '').toString();
        if (identity.isEmpty) throw const ApiException(statusCode: 400, message: 'No addable contact identity.');
        await context.services.contacts.add({'identity': identity});
      }
      if (!mounted) return;
      setState(() {
        profile = {...profile, 'saved': !saved};
        busy = false;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => busy = false);
      _snack(_errorText(failure));
    }
  }

  Future<void> _share() async {
    final text = <String>[
      displayName,
      if ((profile['username']?.toString() ?? '').isNotEmpty) '@${profile['username']}',
      if ((profile['phone']?.toString() ?? '').isNotEmpty) profile['phone'].toString(),
      if ((profile['email']?.toString() ?? '').isNotEmpty) profile['email'].toString(),
    ].join('\n');
    await Clipboard.setData(ClipboardData(text: text));
    if (mounted) _snack('Contact details copied.');
  }

  Future<void> _security() async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => LiveFriendRoomSecurityScreen(
          inbox: room.isEmpty ? widget.inbox : room,
          currentUserId: widget.currentUserId,
        ),
      ),
    );
    if (mounted) await _load();
  }

  @override
  Widget build(BuildContext context) {
    if (loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    if (error != null && profile.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Contact info')),
        body: _ErrorState(message: error!, onRetry: _load),
      );
    }

    final muted = _containsMe(room['mutedBy']);
    final favourite = _containsMe(room['favouriteBy']);
    final listed = _containsMe(room['listedBy']);
    final privacy = _containsMe(room['privacyShieldBy']);
    final social = _asList(profile['socialAccounts']);
    final mediaCount = media.where((e) => e['kind'] == 'photo' || e['kind'] == 'video').length;
    final linkCount = media.where((e) => e['kind'] == 'link').length;
    final fileCount = media.where((e) => e['kind'] == 'file').length;

    return Scaffold(
      backgroundColor: context.page,
      appBar: AppBar(
        title: const Text('Contact info'),
        backgroundColor: context.panel,
        surfaceTintColor: Colors.transparent,
        actions: [IconButton(onPressed: busy ? null : _load, icon: const Icon(Icons.refresh_rounded))],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(14, 20, 14, 36),
          children: [
            Center(child: SyncAvatar(name: displayName, online: profile['online'] == true, radius: 56)),
            const SizedBox(height: 12),
            Center(child: Text(displayName, style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w900))),
            if ((profile['username']?.toString() ?? '').isNotEmpty)
              Center(child: Text('@${profile['username']}', style: TextStyle(color: context.muted))),
            if ((profile['bio']?.toString() ?? '').isNotEmpty) ...[
              const SizedBox(height: 10),
              Center(child: Text(profile['bio'].toString(), textAlign: TextAlign.center)),
            ],
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(child: _smallAction(Icons.share_outlined, 'Share', _share)),
                const SizedBox(width: 8),
                Expanded(child: _smallAction(Icons.security_outlined, 'Security', _security)),
                const SizedBox(width: 8),
                Expanded(child: _smallAction(
                  blockState['youBlocked'] == true ? Icons.lock_open_rounded : Icons.block_rounded,
                  blockState['youBlocked'] == true ? 'Unblock' : 'Block',
                  _toggleBlock,
                  danger: blockState['youBlocked'] != true,
                )),
              ],
            ),
            const SizedBox(height: 18),
            _section(context, 'Profile', [
              if ((profile['phone']?.toString() ?? '').isNotEmpty)
                ListTile(leading: const Icon(Icons.phone_outlined), title: const Text('Phone'), subtitle: Text(profile['phone'].toString())),
              if ((profile['email']?.toString() ?? '').isNotEmpty)
                ListTile(leading: const Icon(Icons.email_outlined), title: const Text('Email'), subtitle: Text(profile['email'].toString())),
              ListTile(
                leading: Icon(profile['saved'] == true ? Icons.person_remove_outlined : Icons.person_add_alt_1_rounded),
                title: Text(profile['saved'] == true ? 'Delete contact' : 'Add to contacts'),
                onTap: busy ? null : () => _setSaved(profile['saved'] == true),
              ),
            ]),
            if (social.isNotEmpty) ...[
              const SizedBox(height: 16),
              _section(context, 'Social accounts', social.map((item) => ListTile(
                leading: const Icon(Icons.link_rounded),
                title: Text(item['platform']?.toString() ?? 'Social'),
                subtitle: Text(item['url']?.toString() ?? ''),
                onTap: () => Clipboard.setData(ClipboardData(text: item['url']?.toString() ?? '')),
              )).toList()),
            ],
            const SizedBox(height: 16),
            _section(context, 'Shared content', [
              ListTile(
                leading: const Icon(Icons.perm_media_outlined),
                title: const Text('Media, links and files'),
                subtitle: Text('$mediaCount media · $linkCount links · $fileCount files'),
              ),
            ]),
            if (commonGroups.isNotEmpty) ...[
              const SizedBox(height: 16),
              _section(context, 'Groups in common', commonGroups.map((item) {
                final group = item['group'] is Map ? Map<String, dynamic>.from(item['group'] as Map) : item;
                return ListTile(
                  leading: const Icon(Icons.groups_2_outlined),
                  title: Text(group['name']?.toString() ?? 'Group'),
                );
              }).toList()),
            ],
            const SizedBox(height: 16),
            _section(context, 'Chat preferences', [
              SwitchListTile.adaptive(
                secondary: const Icon(Icons.notifications_off_outlined),
                title: const Text('Mute notifications'),
                value: muted,
                onChanged: busy ? null : (value) => _pref('mute', value),
              ),
              SwitchListTile.adaptive(
                secondary: const Icon(Icons.star_outline_rounded),
                title: const Text('Favourite'),
                value: favourite,
                onChanged: busy ? null : (value) => _pref('favourite', value),
              ),
              SwitchListTile.adaptive(
                secondary: const Icon(Icons.format_list_bulleted_rounded),
                title: const Text('Add to list'),
                value: listed,
                onChanged: busy ? null : (value) => _pref('list', value),
              ),
              SwitchListTile.adaptive(
                secondary: const Icon(Icons.privacy_tip_outlined),
                title: const Text('Advanced privacy'),
                value: privacy,
                onChanged: busy ? null : (value) => _pref('privacyShield', value),
              ),
              ListTile(
                leading: const Icon(Icons.lock_outline_rounded),
                title: const Text('Secret chat & encryption'),
                subtitle: const Text('Disappearing messages, screenshot alerts and device E2EE'),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: _security,
              ),
            ]),
          ],
        ),
      ),
    );
  }

  Widget _smallAction(IconData icon, String label, VoidCallback action, {bool danger = false}) => OutlinedButton(
    onPressed: busy ? null : action,
    style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 4)),
    child: Column(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, color: danger ? SyncColors.danger : SyncColors.sky),
      const SizedBox(height: 4),
      Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: danger ? SyncColors.danger : null)),
    ]),
  );

  void _snack(String message) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
}

class LiveChannelProfileScreen extends StatefulWidget {
  const LiveChannelProfileScreen({
    super.key,
    required this.inbox,
    required this.currentUserId,
  });

  final Map<String, dynamic> inbox;
  final String currentUserId;

  @override
  State<LiveChannelProfileScreen> createState() => _LiveChannelProfileScreenState();
}

class _LiveChannelProfileScreenState extends State<LiveChannelProfileScreen> {
  Map<String, dynamic> channel = const {};
  List<Map<String, dynamic>> participants = const [];
  bool loading = true;
  bool busy = false;
  String? error;

  String get channelId {
    final raw = widget.inbox['channel'];
    return raw is Map ? raw['_id']?.toString() ?? '' : '';
  }

  String get name => (channel['name'] ?? 'Channel').toString();
  bool get isAdmin {
    final admins = channel['adminsId'];
    return admins is List && admins.map((e) => e.toString()).contains(widget.currentUserId);
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    if (channelId.isEmpty) {
      setState(() {
        loading = false;
        error = 'Channel identity is missing.';
      });
      return;
    }
    if (mounted) setState(() => loading = true);
    try {
      final values = await Future.wait<dynamic>([
        context.services.channels.find(channelId),
        context.services.channels.participants(channelId),
      ]);
      if (!mounted) return;
      setState(() {
        channel = Map<String, dynamic>.from(values[0] as Map);
        participants = (values[1] as List).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
        loading = false;
        busy = false;
        error = null;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        loading = false;
        busy = false;
        error = _errorText(failure);
      });
    }
  }

  Future<void> _leave() async {
    if (busy) return;
    setState(() => busy = true);
    try {
      await context.services.channels.exit(channelId);
      if (!mounted) return;
      Navigator.pop(context, true);
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => busy = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(_errorText(failure))));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    if (error != null && channel.isEmpty) {
      return Scaffold(appBar: AppBar(title: const Text('Channel info')), body: _ErrorState(message: error!, onRetry: _load));
    }
    final private = channel['accessType']?.toString() == 'private';
    return Scaffold(
      backgroundColor: context.page,
      appBar: AppBar(title: const Text('Channel info'), backgroundColor: context.panel, surfaceTintColor: Colors.transparent),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(14, 20, 14, 36),
          children: [
            Center(child: SyncAvatar(name: name, radius: 56)),
            const SizedBox(height: 12),
            Center(child: Text(name, style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w900))),
            Center(child: Text('${private ? 'Private' : 'Public'} · ${participants.length} subscribers${isAdmin ? ' · Admin' : ''}', style: TextStyle(color: context.muted))),
            if ((channel['desc']?.toString() ?? '').isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(channel['desc'].toString(), textAlign: TextAlign.center),
            ],
            const SizedBox(height: 18),
            _section(context, 'Channel controls', [
              ListTile(
                leading: const Icon(Icons.insights_outlined, color: SyncColors.sky),
                title: const Text('Analytics & reviews'),
                subtitle: const Text('Subscriber growth, reach, reactions and reviews'),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const LiveChannelInsightsScreen())),
              ),
              if (isAdmin)
                ListTile(
                  leading: const Icon(Icons.admin_panel_settings_outlined, color: SyncColors.sky),
                  title: const Text('Admin controls'),
                  subtitle: const Text('Permissions, moderation and pending members'),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => LiveRoomAdminScreen(inbox: widget.inbox, currentUserId: widget.currentUserId))),
                ),
              ListTile(
                leading: const Icon(Icons.logout_rounded, color: SyncColors.danger),
                title: const Text('Leave channel', style: TextStyle(color: SyncColors.danger)),
                onTap: busy ? null : _leave,
              ),
            ]),
            const SizedBox(height: 16),
            _section(context, 'Subscribers', participants.take(30).map((item) {
              final p = item['profile'] is Map ? Map<String, dynamic>.from(item['profile'] as Map) : item;
              final label = (p['fullname'] ?? p['username'] ?? 'Subscriber').toString();
              return ListTile(
                leading: SyncAvatar(name: label, radius: 20),
                title: Text(label),
                subtitle: (p['username']?.toString() ?? '').isEmpty ? null : Text('@${p['username']}'),
              );
            }).toList()),
          ],
        ),
      ),
    );
  }
}

Widget _section(BuildContext context, String title, List<Widget> children) {
  final items = <Widget>[];
  for (var i = 0; i < children.length; i++) {
    if (i > 0) items.add(Divider(height: 1, indent: 56, color: context.border));
    items.add(children[i]);
  }
  return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    Padding(
      padding: const EdgeInsets.fromLTRB(8, 0, 8, 7),
      child: Text(title.toUpperCase(), style: TextStyle(color: context.muted, fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: .7)),
    ),
    Card(
      color: context.panel,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(17), side: BorderSide(color: context.border)),
      child: Column(children: items),
    ),
  ]);
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});
  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.cloud_off_outlined, size: 46, color: SyncColors.sky),
        const SizedBox(height: 10),
        Text(message, textAlign: TextAlign.center),
        const SizedBox(height: 12),
        FilledButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh_rounded), label: const Text('Retry')),
      ]),
    ),
  );
}

List<Map<String, dynamic>> _asList(dynamic value) => value is List
    ? value.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList(growable: false)
    : const [];

String _errorText(Object failure) {
  if (failure is ApiException) return failure.message;
  return failure.toString().replaceFirst('Exception: ', '');
}
