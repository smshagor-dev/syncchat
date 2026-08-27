import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../core/calling_repository.dart';
import '../core/permission_manager.dart';
import '../theme.dart';
import '../widgets.dart';
import 'live_call_screen.dart';
import 'live_chat_room_screen.dart';

class LiveCallsScreen extends StatefulWidget {
  const LiveCallsScreen({super.key});

  @override
  State<LiveCallsScreen> createState() => _LiveCallsScreenState();
}

class _LiveCallsScreenState extends State<LiveCallsScreen> {
  bool loading = true;
  String? error;
  String currentUserId = '';
  List<Map<String, dynamic>> calls = const [];

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
      final results = await Future.wait<dynamic>([
        context.services.calling.currentUser(refresh: true),
        context.services.calling.history(),
      ]);
      final user = Map<String, dynamic>.from(results[0] as Map);
      final history = (results[1] as List)
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .where((item) => _callMeta(item) != null)
          .toList(growable: false);
      if (!mounted) return;
      setState(() {
        currentUserId = user['_id']?.toString() ?? '';
        calls = history;
        loading = false;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        error = _messageFor(failure);
        loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return SyncDockPage(
      title: 'Calls',
      trailing: IconButton(
        tooltip: 'Start new call',
        onPressed: _showNewCall,
        icon: const Icon(Icons.add_call),
      ),
      child: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: EdgeInsets.fromLTRB(
            0,
            0,
            0,
            118 + MediaQuery.paddingOf(context).bottom,
          ),
          children: [
            _header(),
            if (loading)
              const Padding(
                padding: EdgeInsets.only(top: 72),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (error != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: _ErrorCard(message: error!, onRetry: _load),
              )
            else if (calls.isEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 72),
                child: Column(
                  children: [
                    Icon(Icons.call_outlined, size: 50, color: context.muted),
                    const SizedBox(height: 12),
                    Text(
                      'No call history yet.',
                      style: TextStyle(
                        color: context.muted,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              )
            else
              ...calls.map(_callTile),
          ],
        ),
      ),
    );
  }

  Widget _header() {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 11, 10, 11),
      decoration: BoxDecoration(
        color: context.panel,
        border: Border(bottom: BorderSide(color: context.border)),
      ),
      child: Row(
        children: [
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'All Calls',
                  style: TextStyle(fontWeight: FontWeight.w900),
                ),
                SizedBox(height: 2),
                Text(
                  'Incoming, outgoing, rejected and missed',
                  style: TextStyle(fontSize: 11.5),
                ),
              ],
            ),
          ),
          IconButton.filled(
            tooltip: 'Start new call',
            onPressed: _showNewCall,
            icon: const Icon(Icons.add_rounded),
          ),
        ],
      ),
    );
  }

  Widget _callTile(Map<String, dynamic> call) {
    final meta = _callMeta(call)!;
    final profile = _privateProfile(call);
    final name = _roomName(call, profile: profile);
    final avatar = _avatar(call, profile: profile);
    final online = call['roomType']?.toString() == 'private' &&
        profile['canSeeOnline'] != false &&
        profile['online'] == true;

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
      decoration: BoxDecoration(
        color: context.panel,
        border: Border(bottom: BorderSide(color: context.border)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SyncAvatar(
            name: name,
            imageUrl: avatar,
            radius: 24,
            online: online,
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      _relativeTime(call['createdAt']),
                      style: TextStyle(color: context.muted, fontSize: 11),
                    ),
                  ],
                ),
                const SizedBox(height: 5),
                Row(
                  children: [
                    Icon(
                      meta.video ? Icons.videocam_outlined : Icons.call_outlined,
                      size: 16,
                      color: meta.danger
                          ? SyncColors.danger
                          : meta.outgoing
                              ? SyncColors.sky
                              : SyncColors.success,
                    ),
                    const SizedBox(width: 5),
                    Text(
                      meta.label,
                      style: TextStyle(
                        color: meta.danger
                            ? SyncColors.danger
                            : meta.outgoing
                                ? SyncColors.sky
                                : SyncColors.success,
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    _actionButton(
                      tooltip: 'Audio call',
                      icon: Icons.call_outlined,
                      onPressed: () => _redial(call, name: name, video: false),
                    ),
                    const SizedBox(width: 7),
                    _actionButton(
                      tooltip: 'Video call',
                      icon: Icons.videocam_outlined,
                      onPressed: () => _redial(call, name: name, video: true),
                    ),
                    const SizedBox(width: 7),
                    _actionButton(
                      tooltip: 'Message',
                      icon: Icons.chat_bubble_outline_rounded,
                      neutral: true,
                      onPressed: () => _openMessage(call, name),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _actionButton({
    required String tooltip,
    required IconData icon,
    required VoidCallback onPressed,
    bool neutral = false,
  }) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onPressed,
        child: Container(
          width: 38,
          height: 34,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: neutral
                ? context.softPanel
                : SyncColors.sky.withValues(alpha: context.isDark ? .18 : .10),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: context.border),
          ),
          child: Icon(
            icon,
            size: 18,
            color: neutral ? context.ink : SyncColors.sky,
          ),
        ),
      ),
    );
  }

  Future<void> _redial(
    Map<String, dynamic> call, {
    required String name,
    required bool video,
  }) async {
    final roomId = call['roomId']?.toString().trim() ?? '';
    if (roomId.isEmpty) return;

    Map<String, dynamic> source = call;
    try {
      source = await context.services.inbox.findByRoom(roomId);
    } on Object {
      // Web falls back to the call-history row when the inbox is not present.
    }
    if (!mounted) return;
    await _startPermissionedCall(source, name: name, video: video);
    if (mounted) await _load();
  }

  Future<void> _openMessage(Map<String, dynamic> call, String name) async {
    final roomId = call['roomId']?.toString().trim() ?? '';
    if (roomId.isEmpty) return;
    try {
      final inbox = await context.services.inbox.findByRoom(roomId);
      if (!mounted) return;
      await Navigator.of(context).push<void>(
        MaterialPageRoute<void>(
          builder: (_) => LiveChatRoomScreen(inbox: inbox, name: name),
        ),
      );
    } on Object catch (failure) {
      if (mounted) _snack(_messageFor(failure));
    }
  }

  Future<void> _startPermissionedCall(
    Map<String, dynamic> inbox, {
    required String name,
    required bool video,
  }) async {
    final granted = await AppPermissionManager.ensureCallPermissions(
      context,
      video: video,
    );
    if (!granted || !mounted) return;
    await openOutgoingCall(
      context,
      inbox: inbox,
      name: name,
      video: video,
    );
  }

  Future<void> _showNewCall() async {
    final draft = await showModalBottomSheet<_CallDraft>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => const _NewCallSheet(),
    );
    if (draft == null || !mounted) return;
    await _startPermissionedCall(
      draft.inbox,
      name: draft.name,
      video: draft.video,
    );
    if (mounted) await _load();
  }

  _CallMeta? _callMeta(Map<String, dynamic> call) {
    final text = call['text']?.toString().trim() ?? '';
    final lower = text.toLowerCase();
    final mentionsCall = lower.contains('call') ||
        lower.contains('missed') ||
        lower.contains('reject') ||
        lower.contains('decline');
    if (!mentionsCall) return null;

    final video = lower.contains('video');
    final rejected = lower.contains('reject') || lower.contains('decline');
    final missed = lower.contains('missed');
    final outgoing = call['userId']?.toString() == currentUserId;
    final label = rejected
        ? 'Rejected'
        : missed
            ? 'Missed'
            : outgoing
                ? 'Outgoing'
                : 'Incoming';
    return _CallMeta(
      video: video,
      rejected: rejected,
      missed: missed,
      outgoing: outgoing,
      label: label,
    );
  }

  Map<String, dynamic> _privateProfile(Map<String, dynamic> call) {
    final owners = call['owners'];
    if (owners is! List) return const {};
    Map<String, dynamic>? fallback;
    for (final raw in owners.whereType<Map>()) {
      final profile = Map<String, dynamic>.from(raw);
      fallback ??= profile;
      if (profile['userId']?.toString() != currentUserId) return profile;
    }
    return fallback ?? const {};
  }

  String _roomName(
    Map<String, dynamic> call, {
    required Map<String, dynamic> profile,
  }) {
    final channel = call['channel'];
    if (channel is Map && (channel['name']?.toString().trim() ?? '').isNotEmpty) {
      return channel['name'].toString();
    }
    final group = call['group'];
    if (group is Map && (group['name']?.toString().trim() ?? '').isNotEmpty) {
      return group['name'].toString();
    }
    final fullname = profile['fullname']?.toString().trim() ?? '';
    if (fullname.isNotEmpty) return fullname;
    final username = profile['username']?.toString().trim() ?? '';
    if (username.isNotEmpty) return '@$username';
    return call['roomType']?.toString() == 'group' ? 'Group' : '[inactive]';
  }

  String? _avatar(
    Map<String, dynamic> call, {
    required Map<String, dynamic> profile,
  }) {
    if (call['roomType']?.toString() == 'private') {
      return profile['avatar']?.toString();
    }
    final channel = call['channel'];
    if (channel is Map && (channel['avatar']?.toString() ?? '').isNotEmpty) {
      return channel['avatar'].toString();
    }
    final group = call['group'];
    if (group is Map && (group['avatar']?.toString() ?? '').isNotEmpty) {
      return group['avatar'].toString();
    }
    return null;
  }

  String _relativeTime(dynamic raw) {
    final time = DateTime.tryParse(raw?.toString() ?? '')?.toLocal();
    if (time == null) return 'recently';
    final diff = DateTime.now().difference(time);
    if (diff.isNegative || diff.inSeconds < 45) return 'a few seconds ago';
    if (diff.inMinutes < 2) return 'a minute ago';
    if (diff.inMinutes < 60) return '${diff.inMinutes} minutes ago';
    if (diff.inHours < 2) return 'an hour ago';
    if (diff.inHours < 24) return '${diff.inHours} hours ago';
    if (diff.inDays < 2) return 'a day ago';
    if (diff.inDays < 30) return '${diff.inDays} days ago';
    if (diff.inDays < 60) return 'a month ago';
    if (diff.inDays < 365) return '${diff.inDays ~/ 30} months ago';
    if (diff.inDays < 730) return 'a year ago';
    return '${diff.inDays ~/ 365} years ago';
  }

  void _snack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  String _messageFor(Object failure) {
    if (failure is ApiException) return failure.message;
    return failure.toString().replaceFirst('Exception: ', '');
  }
}

class _NewCallSheet extends StatefulWidget {
  const _NewCallSheet();

  @override
  State<_NewCallSheet> createState() => _NewCallSheetState();
}

class _NewCallSheetState extends State<_NewCallSheet> {
  final search = TextEditingController();
  List<Map<String, dynamic>> contacts = const [];
  Set<String> selected = const {};
  CallRuntimeConfig? config;
  String selfId = '';
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
    try {
      final results = await Future.wait<dynamic>([
        context.services.contacts.list(),
        context.services.calling.currentUser(),
        context.services.calling.runtimeConfig(refresh: true),
      ]);
      if (!mounted) return;
      setState(() {
        contacts = (results[0] as List)
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList(growable: false);
        selfId = (results[1] as Map)['_id']?.toString() ?? '';
        config = results[2] as CallRuntimeConfig;
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

  List<Map<String, dynamic>> get filtered {
    final q = search.text.trim().toLowerCase();
    if (q.isEmpty) return contacts;
    return contacts.where((contact) {
      final p = _profile(contact);
      final dialCode = p['dialCode']?.toString() ?? '';
      final phone = p['phone']?.toString() ?? '';
      final hay = [
        p['fullname'],
        p['username'],
        p['email'],
        phone,
        '$dialCode$phone',
      ].whereType<Object>().map((value) => value.toString()).join(' ').toLowerCase();
      return hay.contains(q);
    }).toList(growable: false);
  }

  int get maxSelectable =>
      ((config?.maxGroupParticipants ?? 4) - 1).clamp(1, 99);

  bool _allowed(bool video) {
    final runtime = config;
    if (runtime == null || selected.isEmpty) return false;
    return runtime.allows(
      video: video,
      group: selected.length > 1,
      participants: selected.length + 1,
    );
  }

  String? get _policyMessage {
    final runtime = config;
    if (runtime == null) return null;
    if (!runtime.enabled) return 'Calling is disabled by the administrator';
    if (selected.length > 1 && !runtime.groupEnabled) {
      return 'Group calling is disabled by the administrator';
    }
    if (selected.length + 1 > runtime.maxGroupParticipants) {
      return 'Group calls are limited to ${runtime.maxGroupParticipants} participants';
    }
    if (!runtime.audioEnabled && !runtime.videoEnabled) {
      return 'Audio and video calling are disabled by the administrator';
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: MediaQuery.sizeOf(context).height * .84,
      child: Column(
        children: [
          ListTile(
            title: const Text(
              'Start Call',
              style: TextStyle(fontWeight: FontWeight.w900, fontSize: 19),
            ),
            subtitle: const Text(
              'Select contacts for an admin-managed audio/video call',
            ),
            trailing: IconButton(
              tooltip: 'Close',
              onPressed: () => Navigator.pop(context),
              icon: const Icon(Icons.close_rounded),
            ),
          ),
          if (error != null)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.fromLTRB(14, 0, 14, 10),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: SyncColors.danger.withValues(alpha: .10),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                error!,
                style: const TextStyle(
                  color: SyncColors.danger,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          if (_policyMessage != null)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.fromLTRB(14, 0, 14, 10),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: SyncColors.danger.withValues(alpha: .08),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                _policyMessage!,
                style: const TextStyle(color: SyncColors.danger),
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 0, 14, 10),
            child: TextField(
              controller: search,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                hintText: 'Search by username, email, number',
                prefixIcon: Icon(Icons.search_rounded),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Max participants: ${config?.maxGroupParticipants ?? 4}',
                style: TextStyle(color: context.muted, fontSize: 11.5),
              ),
            ),
          ),
          Divider(height: 1, color: context.border),
          Expanded(
            child: loading
                ? const Center(child: CircularProgressIndicator())
                : filtered.isEmpty
                    ? const Center(child: Text('No contacts found.'))
                    : ListView.builder(
                        itemCount: filtered.length,
                        itemBuilder: (_, index) => _contactTile(filtered[index]),
                      ),
          ),
          Divider(height: 1, color: context.border),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
            child: Row(
              children: [
                Text('${selected.length} selected'),
                const Spacer(),
                FilledButton.icon(
                  onPressed: _allowed(false) ? () => _finish(false) : null,
                  style: FilledButton.styleFrom(backgroundColor: SyncColors.success),
                  icon: const Icon(Icons.call_rounded),
                  label: const Text('Audio'),
                ),
                const SizedBox(width: 8),
                FilledButton.icon(
                  onPressed: _allowed(true) ? () => _finish(true) : null,
                  icon: const Icon(Icons.videocam_rounded),
                  label: const Text('Video'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _contactTile(Map<String, dynamic> contact) {
    final id = contact['friendId']?.toString() ?? '';
    final profile = _profile(contact);
    final isSelected = selected.contains(id);
    final name = _profileName(profile);
    return InkWell(
      onTap: id.isEmpty ? null : () => _toggle(id),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(
          color: isSelected ? SyncColors.sky.withValues(alpha: .08) : null,
          border: Border(bottom: BorderSide(color: context.border)),
        ),
        child: Row(
          children: [
            SyncAvatar(
              name: name,
              imageUrl: profile['avatar']?.toString(),
              radius: 21,
              online: profile['canSeeOnline'] != false && profile['online'] == true,
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '@${profile['username'] ?? ''} · ${profile['email'] ?? '-'}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: context.muted, fontSize: 11.5),
                  ),
                ],
              ),
            ),
            Container(
              width: 22,
              height: 22,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: isSelected ? SyncColors.sky : Colors.transparent,
                border: Border.all(
                  color: isSelected ? SyncColors.sky : context.border,
                ),
              ),
              child: isSelected
                  ? const Icon(Icons.check_rounded, color: Colors.white, size: 15)
                  : null,
            ),
          ],
        ),
      ),
    );
  }

  void _toggle(String id) {
    setState(() {
      final next = {...selected};
      error = null;
      if (next.contains(id)) {
        next.remove(id);
      } else if (next.length >= maxSelectable) {
        error = 'This server allows up to ${config?.maxGroupParticipants ?? 4} participants per call';
      } else {
        next.add(id);
      }
      selected = next;
    });
  }

  void _finish(bool video) {
    final picked = contacts
        .where((contact) => selected.contains(contact['friendId']?.toString()))
        .toList(growable: false);
    if (picked.isEmpty || selfId.isEmpty || !_allowed(video)) return;

    if (picked.length == 1) {
      final contact = picked.first;
      final friendId = contact['friendId']?.toString() ?? '';
      final roomId = contact['roomId']?.toString().trim() ?? '';
      if (friendId.isEmpty || roomId.isEmpty) {
        setState(() => error = 'This contact does not have an available private call room.');
        return;
      }
      final profile = _profile(contact);
      Navigator.pop(
        context,
        _CallDraft(
          video: video,
          name: _profileName(profile),
          inbox: {
            'roomId': roomId,
            'roomType': 'private',
            'ownersId': [selfId, friendId],
            'owners': [profile],
            'profile': profile,
          },
        ),
      );
      return;
    }

    final friendIds = picked
        .map((contact) => contact['friendId']?.toString() ?? '')
        .where((id) => id.isNotEmpty)
        .toList(growable: false);
    final roomId = 'group-call-$selfId-${DateTime.now().millisecondsSinceEpoch}';
    Navigator.pop(
      context,
      _CallDraft(
        video: video,
        name: '${picked.length} participants',
        inbox: {
          'roomId': roomId,
          'roomType': 'group',
          'ownersId': [selfId, ...friendIds],
          'group': {'name': '${picked.length} participants'},
        },
      ),
    );
  }

  Map<String, dynamic> _profile(Map<String, dynamic> contact) {
    final raw = contact['profile'];
    return raw is Map ? Map<String, dynamic>.from(raw) : const {};
  }

  String _profileName(Map<String, dynamic> profile) {
    final fullname = profile['fullname']?.toString().trim() ?? '';
    if (fullname.isNotEmpty) return fullname;
    final username = profile['username']?.toString().trim() ?? '';
    return username.isEmpty ? '[inactive]' : '@$username';
  }

  String _errorText(Object failure) {
    if (failure is ApiException) return failure.message;
    return failure.toString().replaceFirst('Exception: ', '');
  }
}

class _CallDraft {
  const _CallDraft({
    required this.video,
    required this.name,
    required this.inbox,
  });

  final bool video;
  final String name;
  final Map<String, dynamic> inbox;
}

class _CallMeta {
  const _CallMeta({
    required this.video,
    required this.rejected,
    required this.missed,
    required this.outgoing,
    required this.label,
  });

  final bool video;
  final bool rejected;
  final bool missed;
  final bool outgoing;
  final String label;

  bool get danger => rejected || missed;
}

class _ErrorCard extends StatelessWidget {
  const _ErrorCard({required this.message, required this.onRetry});

  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 56),
      child: Column(
        children: [
          const Icon(Icons.cloud_off_outlined, size: 42, color: SyncColors.sky),
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
    );
  }
}
