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
    final roomType = inbox['roomType']?.toString() ?? 'private';
    if (roomType == 'private') {
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
  Map<String, dynamic> inbox = const {};
  Map<String, dynamic> profile = const {};
  Map<String, dynamic> blockState = const {};
  List<Map<String, dynamic>> commonGroups = const [];
  List<Map<String, dynamic>> roomMedia = const [];
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
    final ownerIds = widget.inbox['ownersId'];
    if (ownerIds is List) {
      for (final raw in ownerIds) {
        final id = raw.toString();
        if (id.isNotEmpty && id != widget.currentUserId) return id;
      }
    }
    return '';
  }

  String get name => profile['fullname']?.toString().trim().isNotEmpty == true
      ? profile['fullname'].toString().trim()
      : profile['username']?.toString().trim().isNotEmpty == true
          ? profile['username'].toString().trim()
          : 'Contact';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    if (friendId.isEmpty) {
      setState(() {
        loading = false;
        error = 'Contact identity is missing from this conversation.';
      });
      return;
    }
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final responses = await Future.wait<dynamic>([
        context.services.profile.getProfile(friendId),
        roomId.isEmpty
            ? Future<Map<String, dynamic>>.value(const {})
            : context.services.inbox.findByRoom(roomId),
        context.services.contacts.blockState(friendId),
        context.services.api.get('/profiles/$friendId/common-groups'),
        roomId.isEmpty
            ? Future<ApiResponse>.value(const ApiResponse(statusCode: 200, payload: []))
            : context.services.api.get('/chats/media', query: {'roomId': roomId}),
      ]);
      if (!mounted) return;
      final commonPayload = (responses[3] as ApiResponse).payload;
      final mediaPayload = (responses[4] as ApiResponse).payload;
      setState(() {
        profile = Map<String, dynamic>.from(responses[0] as Map);
        inbox = Map<String, dynamic>.from(responses[1] as Map);
        blockState = Map<String, dynamic>.from(responses[2] as Map);
        commonGroups = _list(commonPayload);
        roomMedia = _list(mediaPayload);
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

  bool _hasUser(dynamic value) => value is List &&
      value.map((item) => item.toString()).contains(widget.currentUserId);

  Future<void> _setPreference(String action, dynamic value) async {
    if (roomId.isEmpty || busy) return;
    setState(() => busy = true);
    try {
      final updated = await context.services.inbox.setPreference(roomId, action, value);
      if (!mounted) return;
      setState(() {
        inbox = updated.isNotEmpty ? updated : inbox;
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

  Future<void> _addContact() async {
    final identity = profile['username']?.toString().trim().isNotEmpty == true
        ? profile['username'].toString().trim()
        : profile['email']?.toString().trim().isNotEmpty == true
            ? profile['email'].toString().trim()
            : profile['phone']?.toString().trim() ?? '';
    if (identity.isEmpty || busy) return;
    setState(() => busy = true);
    try {
      await context.services.contacts.add({'identity': identity});
      if (!mounted) return;
      setState(() {
        profile = {...profile, 'saved': true};
        busy = false;
      });
      _snack('Contact added.');
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => busy = false);
      _snack(_errorText(failure));
    }
  }

  Future<void> _deleteContact() async {
    if (friendId.isEmpty || busy) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete contact?'),
        content: Text('Remove $name from your saved contacts?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Delete')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => busy = true);
    try {
      await context.services.contacts.delete(friendId);
      if (!mounted) return;
      setState(() {
        profile = {...profile, 'saved': false};
        busy = false;
      });
      _snack('Contact deleted.');
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => busy = false);
      _snack(_errorText(failure));
    }
  }

  Future<void> _shareContact() async {
    final parts = <String>[
      name,
      if ((profile['username']?.toString() ?? '').isNotEmpty) '@${profile['username']}',
      if ((profile['phone']?.toString() ?? '').isNotEmpty) profile['phone'].toString(),
      if ((profile['email']?.toString() ?? '').isNotEmpty) profile['email'].toString(),
    ];
    await Clipboard.setData(ClipboardData(text: parts.join('\n')));
    if (mounted) _snack('Contact details copied.');
  }

  Future<void> _openSecurity() async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => LiveFriendRoomSecurityScreen(
          inbox: widget.inbox,
          currentUserId: widget.currentUserId,
        ),
      ),
    );
    if (mounted) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final muted = _hasUser(inbox['mutedBy']);
    final favourite = _hasUser(inbox['favouriteBy']);
    final listed = _hasUser(inbox['listedBy']);
    final privacy = _hasUser(inbox['privacyShieldBy']);
    final mediaCount = roomMedia.where((item) => ['photo', 'video'].contains(item['kind']?.toString())).length;
    final linkCount = roomMedia.where((item) => item['kind']?.toString() == 'link').length;
    final fileCount = roomMedia.where((item) => item['kind']?.toString() == 'file').length;
    final social = _list(profile['socialAccounts']);

    return Scaffold(
      backgroundColor: context.page,
      appBar: AppBar(
        title: const Text('Contact info'),
        backgroundColor: context.panel,
        surfaceTintColor: Colors.transparent,
        actions: [
          IconButton(onPressed: loading || busy ? null : _load, icon: const Icon(Icons.refresh_rounded)),
        ],
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : error != null && profile.isEmpty
              ? _ErrorState(message: error!, onRetry: _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(14, 20, 14, 36),
                    children: [
                      Center(child: SyncAvatar(name: name, online: profile['online'] == true, radius: 56)),
                      const SizedBox(height: 12),
                      Center(child: Text(name, style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w900))),
                      if ((profile['username']?.toString() ?? '').isNotEmpty) ...[
                        const SizedBox(height: 3),
                        Center(child: Text('@${profile['username']}', style: TextStyle(color: context.muted))),
                      ],
                      if ((profile['bio']?.toString() ?? '').isNotEmpty) ...[
                        const SizedBox(height: 10),
                        Center(child: Text(profile['bio'].toString(), textAlign: TextAlign.center)),
                      ],
                      const SizedBox(height: 18),
                      Row(
                        children: [
                          Expanded(child: _quickAction(context, Icons.share_outlined, 'Share', _shareContact)),
                          const SizedBox(width: 8),
                          Expanded(child: _quickAction(context, Icons.shield_outlined, 'Security', _openSecurity)),
                          const SizedBox(width: 8),
                          Expanded(
                            child: _quickAction(
                              context,
                              blockState['youBlocked'] == true ? Icons.lock_open_rounded : Icons.block_rounded,
                              blockState['youBlocked'] == true ? 'Unblock' : 'Block',
                              _toggleBlock,
                              danger: blockState['youBlocked'] != true,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 18),
                      _section(context, 'Contact', [
                        if ((profile['phone']?.toString() ?? '').isNotEmpty)
                          ListTile(leading: const Icon(Icons.phone_outlined), title: const Text('Phone'), subtitle: Text(profile['phone'].toString())),
                        if ((profile['email']?.toString() ?? '').isNotEmpty)
                          ListTile(leading: const Icon(Icons.email_outlined), title: const Text('Email'), subtitle: Text(profile['email'].toString())),
                        ListTile(
                          leading: Icon(profile['saved'] == true ? Icons.person_remove_outlined : Icons.person_add_alt_1_rounded),
                          title: Text(profile['saved'] == true ? 'Delete contact' : 'Add to contacts'),
                          onTap: busy ? null : (profile['saved'] == true ? _deleteContact : _addContact),
                        ),
                      ]),
                      if (social.isNotEmpty) ...[
                        const SizedBox(height: 16),
                        _section(
                          context,
                          'Social accounts',
                          social.map((item) => ListTile(
                                leading: const Icon(Icons.link_rounded),
                                title: Text(item['platform']?.toString() ?? 'Social'),
                                subtitle: Text(item['url']?.toString() ?? ''),
                                onTap: () => Clipboard.setData(ClipboardData(text: item['url']?.toString() ?? '')),
                              )).toList(growable: false),
                        ),
                      ],
                      const SizedBox(height: 16),
                      _section(context, 'Shared content', [
                        ListTile(
                          leading: const Icon(Icons.photo_library_outlined),
                          title: const Text('Media, links and files'),
                          subtitle: Text('$mediaCount media · $linkCount links · $fileCount files'),
                        ),
                      ]),
                      if (commonGroups.isNotEmpty) ...[
                        const SizedBox(height: 16),
                        _section(
                          context,
                          'Groups in common',
                          commonGroups.map((item) {
                            final group = item['group'] is Map ? Map<String, dynamic>.from(item['group'] as Map) : item;
                            return ListTile(
                              leading: const Icon(Icons.groups_2_outlined),
                              title: Text(group['name']?.toString() ?? 'Group'),
                              subtitle: const Text('Group in common'),
                            );
                          }).toList(growable: false),
                        ),
                      ],
                      const SizedBox(height: 16),
                      _section(context, 'Chat preferences', [
                        SwitchListTile.adaptive(
                          secondary: const Icon(Icons.notifications_off_outlined),
                          title: const Text('Mute notifications'),
                          value: muted,
                          onChanged: busy ? null : (value) => _setPreference('mute', value),
                        ),
                        SwitchListTile.adaptive(
                          secondary: const Icon(Icons.star_outline_rounded),
                          title: const Text('Favourite'),
                          value: favourite,
                          onChanged: busy ? null : (value) => _setPreference('favourite', value),
                        ),
                        SwitchListTile.adaptive(
                          secondary: const Icon(Icons.format_list_bulleted_rounded),
                          title: const Text('Add to list'),
                          value: listed,
                          onChanged: busy ? null : (value) => _setPreference('list', value),
                        ),
                        SwitchListTile.adaptive(
                          secondary: const Icon(Icons.privacy_tip_outlined),
                          title: const Text('Advanced privacy'),
                          value: privacy,
                          onChanged: busy ? null : (value) => _setPreference('privacyShield', value),
                        ),
                        ListTile(
                          leading: const Icon(Icons.security_rounded),
                          title: const Text('Secret chat & encryption'),
                          subtitle: const Text('Disappearing messages, screenshot alerts and device E2EE'),
                          trailing: const Icon(Icons.chevron_right_rounded),
                          onTap: _openSecurity,
                        ),
                      ]),
                      if (blockState['blockedYou'] == true) ...[
                        const SizedBox(height: 14),
                        const SyncFeatureCard(
                          icon: Icons.info_outline_rounded,
                          title: 'Messaging limited',
                          body: 'This contact has blocked your account. Some interaction options may be unavailable.',
                        ),
                      ],
                    ],
                  ),
                ),
    );
  }

  Widget _quickAction(BuildContext context, IconData icon, String label, VoidCallback onTap, {bool danger = false}) {
    return OutlinedButton(
      onPressed: busy ? null : onTap,
      style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 13, horizontal: 6)),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: danger ? SyncColors.danger : SyncColors.sky),
          const SizedBox(height: 5),
          Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: danger ? SyncColors.danger : null)),
        ],
      ),
    );
  }

  void _snack(String text) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }
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

  bool get admin {
    final admins = channel['adminsId'];
    return admins is List && admins.map((item) => item.toString()).contains(widget.currentUserId);
  }

  String get name => channel['name']?.toString().trim().isNotEmpty == true ? channel['name'].toString().trim() : 'Channel';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    if (channelId.isEmpty) {
      setState(() {
        loading = false;
        error = 'Channel identity is missing from this conversation.';
      });
      return;
    }
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final result = await Future.wait<dynamic>([
        context.services.channels.find(channelId),
        context.services.channels.participants(channelId),
      ]);
      if (!mounted) return;
      setState(() {
        channel = Map<String, dynamic>.from(result[0] as Map);
        participants = (result[1] as List).whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList(growable: false);
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

  Future<void> _leave() async {
    if (busy || channelId.isEmpty) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Leave channel?'),
        content: Text('You will stop receiving updates from $name.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Leave')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
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

  Future<void> _openAdmin() async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => LiveRoomAdminScreen(
          inbox: widget.inbox,
          currentUserId: widget.currentUserId,
        ),
      ),
    );
    if (mounted) await _load();
  }

  Future<void> _openInsights() async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(builder: (_) => const LiveChannelInsightsScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final private = channel['accessType']?.toString() == 'private';
    final desc = channel['desc']?.toString().trim() ?? '';
    return Scaffold(
      backgroundColor: context.page,
      appBar: AppBar(
        title: const Text('Channel info'),
        backgroundColor: context.panel,
        surfaceTintColor: Colors.transparent,
        actions: [IconButton(onPressed: loading || busy ? null : _load, icon: const Icon(Icons.refresh_rounded))],
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : error != null && channel.isEmpty
              ? _ErrorState(message: error!, onRetry: _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(14, 20, 14, 36),
                    children: [
                      Center(child: SyncAvatar(name: name, radius: 58)),
                      const SizedBox(height: 12),
                      Center(child: Text(name, style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w900))),
                      const SizedBox(height: 4),
                      Center(
                        child: Text(
                          '${private ? 'Private' : 'Public'} · ${participants.length} subscriber${participants.length == 1 ? '' : 's'}${admin ? ' · Admin' : ''}',
                          style: TextStyle(color: context.muted),
                        ),
                      ),
                      if (desc.isNotEmpty) ...[
                        const SizedBox(height: 14),
                        Text(desc, textAlign: TextAlign.center),
                      ],
                      const SizedBox(height: 18),
                      _section(context, 'Channel', [
                        ListTile(
                          leading: const Icon(Icons.insights_outlined, color: SyncColors.sky),
                          title: const Text('Analytics & reviews'),
                          subtitle: const Text('Subscriber growth, reach, reactions and reviews'),
                          trailing: const Icon(Icons.chevron_right_rounded),
                          onTap: _openInsights,
                        ),
                        if (admin)
                          ListTile(
                            leading: const Icon(Icons.admin_panel_settings_outlined, color: SyncColors.sky),
                            title: const Text('Admin controls'),
                            subtitle: const Text('Permissions, moderation and pending members'),
                            trailing: const Icon(Icons.chevron_right_rounded),
                            onTap: _openAdmin,
                          ),
                        ListTile(
                          leading: const Icon(Icons.logout_rounded, color: SyncColors.danger),
                          title: const Text('Leave channel', style: TextStyle(color: SyncColors.danger)),
                          onTap: busy ? null : _leave,
                        ),
                      ]),
                      const SizedBox(height: 16),
                      _section(
                        context,
                        'Subscribers',
                        participants.take(30).map((item) {
                          final profile = item['profile'] is Map ? Map<String, dynamic>.from(item['profile'] as Map) : item;
                          final label = profile['fullname']?.toString() ?? profile['username']?.toString() ?? 'Subscriber';
                          return ListTile(
                            leading: SyncAvatar(name: label, radius: 21),
                            title: Text(label),
                            subtitle: (profile['username']?.toString() ?? '').isEmpty ? null : Text('@${profile['username']}'),
                          );
                        }).toList(growable: false),
                      ),
                    ],
                  ),
                ),
    );
  }
}

Widget _section(BuildContext context, String title, List<Widget> children) {
  final withDividers = <Widget>[];
  for (var index = 0; index < children.length; index++) {
    if (index > 0) withDividers.add(Divider(height: 1, indent: 56, color: context.border));
    withDividers.add(children[index]);
  }
  return Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(8, 0, 8, 7),
        child: Text(title.toUpperCase(), style: TextStyle(color: context.muted, fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: .7)),
      ),
      Card(
        color: context.panel,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(17), side: BorderSide(color: context.border)),
        child: Column(children: withDividers),
      ),
    ],
  );
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
              const Icon(Icons.cloud_off_outlined, size: 46, color: SyncColors.sky),
              const SizedBox(height: 10),
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

String _errorText(Object failure) {
  if (failure is ApiException) return failure.message;
  return failure.toString().replaceFirst('Exception: ', '');
}
