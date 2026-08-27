import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../theme.dart';
import '../widgets.dart';
import 'live_chat_room_screen.dart';

class LiveRoomSecurityHubScreen extends StatefulWidget {
  const LiveRoomSecurityHubScreen({super.key});

  @override
  State<LiveRoomSecurityHubScreen> createState() => _LiveRoomSecurityHubScreenState();
}

class _LiveRoomSecurityHubScreenState extends State<LiveRoomSecurityHubScreen> {
  List<Map<String, dynamic>> rooms = const [];
  Map<String, dynamic>? currentUser;
  bool loading = true;
  String? error;

  String get userId => currentUser?['_id']?.toString() ?? '';

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
      final result = await Future.wait<dynamic>([
        context.services.chat.currentUser(refresh: true),
        context.services.inbox.list(),
      ]);
      if (!mounted) return;
      setState(() {
        currentUser = Map<String, dynamic>.from(result[0] as Map);
        rooms = (result[1] as List)
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .where((item) => item['roomType']?.toString() == 'private')
            .toList(growable: false);
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

  @override
  Widget build(BuildContext context) {
    return SyncStandardPage(
      title: 'Friend & room security',
      actions: [
        IconButton(onPressed: _load, icon: const Icon(Icons.refresh_rounded)),
      ],
      child: loading && rooms.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : error != null && rooms.isEmpty
              ? _RoomSecurityError(message: error!, onRetry: _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.separated(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(8, 8, 8, 30),
                    itemCount: rooms.length,
                    separatorBuilder: (_, __) => Divider(
                      height: 1,
                      indent: 70,
                      color: context.border,
                    ),
                    itemBuilder: (_, index) {
                      final room = rooms[index];
                      final name = _friendName(room, userId);
                      final friendId = _friendId(room, userId);
                      final secret = room['secretChatEnabled'] == true;
                      final shield = _hasUser(room['privacyShieldBy'], userId);
                      return ListTile(
                        leading: SyncAvatar(name: name, radius: 23),
                        title: Text(
                          name,
                          style: const TextStyle(fontWeight: FontWeight.w900),
                        ),
                        subtitle: Text(
                          [
                            if (friendId.isNotEmpty) 'Private chat',
                            if (shield) 'Advanced privacy',
                            if (secret) 'Secret chat',
                          ].join(' · '),
                        ),
                        trailing: const Icon(Icons.chevron_right_rounded),
                        onTap: () async {
                          final changed = await Navigator.of(context).push<bool>(
                            MaterialPageRoute<bool>(
                              builder: (_) => LiveFriendRoomSecurityScreen(
                                inbox: room,
                                currentUserId: userId,
                              ),
                            ),
                          );
                          if (changed == true && mounted) await _load();
                        },
                      );
                    },
                  ),
                ),
    );
  }
}

class LiveFriendRoomSecurityScreen extends StatefulWidget {
  const LiveFriendRoomSecurityScreen({
    super.key,
    required this.inbox,
    required this.currentUserId,
  });

  final Map<String, dynamic> inbox;
  final String currentUserId;

  @override
  State<LiveFriendRoomSecurityScreen> createState() =>
      _LiveFriendRoomSecurityScreenState();
}

class _LiveFriendRoomSecurityScreenState
    extends State<LiveFriendRoomSecurityScreen> {
  Map<String, dynamic> room = const {};
  Map<String, dynamic> profile = const {};
  Map<String, dynamic> blockState = const {};
  bool e2eeEnabled = false;
  bool loading = true;
  bool saving = false;
  String? error;

  String get roomId => widget.inbox['roomId']?.toString() ?? '';
  String get friendId => _friendId(room.isEmpty ? widget.inbox : room, widget.currentUserId);
  String get name => _friendName(room.isEmpty ? widget.inbox : room, widget.currentUserId);

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
      final freshRoom = await context.services.inbox.findByRoom(roomId);
      final resolvedFriendId = _friendId(freshRoom, widget.currentUserId);
      final result = await Future.wait<dynamic>([
        resolvedFriendId.isEmpty
            ? Future<Map<String, dynamic>>.value(const {})
            : context.services.profile.getProfile(resolvedFriendId),
        resolvedFriendId.isEmpty
            ? Future<Map<String, dynamic>>.value(const {})
            : context.services.contacts.blockState(resolvedFriendId),
        context.services.chat.e2eeRoomState(roomId),
      ]);
      if (!mounted) return;
      setState(() {
        room = freshRoom;
        profile = Map<String, dynamic>.from(result[0] as Map);
        blockState = Map<String, dynamic>.from(result[1] as Map);
        e2eeEnabled = Map<String, dynamic>.from(result[2] as Map)['enabled'] == true;
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
    if (saving) return;
    setState(() => saving = true);
    try {
      final updated = await context.services.inbox.setPreference(roomId, action, value);
      if (!mounted) return;
      setState(() {
        room = updated.isEmpty ? room : updated;
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
      final blocked = blockState['youBlocked'] == true;
      if (blocked) {
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

  Future<void> _toggleE2ee(bool enabled) async {
    if (saving) return;
    setState(() => saving = true);
    try {
      final state = await context.services.chat.setE2eeRoomEnabled(
        roomId,
        enabled: enabled,
      );
      if (!mounted) return;
      setState(() {
        e2eeEnabled = state['enabled'] == true;
        saving = false;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => saving = false);
      _snack(_errorText(failure));
    }
  }

  @override
  Widget build(BuildContext context) {
    final shield = _hasUser(room['privacyShieldBy'], widget.currentUserId);
    final secret = room['secretChatEnabled'] == true;
    final timer = (room['secretDisappearSeconds'] as num?)?.toInt() ?? 0;
    final blocked = blockState['youBlocked'] == true;
    final blockedYou = blockState['blockedYou'] == true;

    return SyncStandardPage(
      title: name,
      actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh_rounded))],
      child: loading && room.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : error != null && room.isEmpty
              ? _RoomSecurityError(message: error!, onRetry: _load)
              : ListView(
                  padding: const EdgeInsets.fromLTRB(14, 18, 14, 36),
                  children: [
                    Center(child: SyncAvatar(name: name, radius: 52)),
                    const SizedBox(height: 12),
                    Center(
                      child: Text(
                        profile['fullname']?.toString() ?? name,
                        style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900),
                      ),
                    ),
                    if ((profile['username']?.toString() ?? '').isNotEmpty)
                      Center(
                        child: Text(
                          '@${profile['username']}',
                          style: TextStyle(color: context.muted),
                        ),
                      ),
                    const SizedBox(height: 18),
                    SyncSoftCard(
                      padding: EdgeInsets.zero,
                      child: Column(
                        children: [
                          _profileTile(Icons.info_outline_rounded, 'About', profile['bio']),
                          Divider(height: 1, color: context.border),
                          _profileTile(Icons.email_outlined, 'Email', profile['email']),
                          Divider(height: 1, color: context.border),
                          _profileTile(Icons.phone_outlined, 'Phone', profile['phone']),
                        ],
                      ),
                    ),
                    const SizedBox(height: 18),
                    _sectionTitle(context, 'Room privacy & security'),
                    SyncSoftCard(
                      padding: EdgeInsets.zero,
                      child: Column(
                        children: [
                          SwitchListTile(
                            secondary: const Icon(Icons.shield_outlined, color: SyncColors.sky),
                            title: const Text('Advanced chat privacy'),
                            subtitle: const Text('Apply the room privacy shield to both participants.'),
                            value: shield,
                            onChanged: saving
                                ? null
                                : (value) => _setPreference('advancedPrivacy', value),
                          ),
                          Divider(height: 1, color: context.border),
                          SwitchListTile(
                            secondary: const Icon(Icons.lock_person_outlined, color: SyncColors.sky),
                            title: const Text('Secret chat'),
                            subtitle: const Text(
                              'Uses a separate protected session with disappearing messages and blocked forward, save, and export actions.',
                            ),
                            value: secret,
                            onChanged: saving
                                ? null
                                : (value) => _setPreference('secretChat', {
                                      'enabled': value,
                                      'disappearSeconds': value ? (timer == 0 ? 30 : timer) : 0,
                                      'screenshotAlerts': true,
                                    }),
                          ),
                          if (secret) ...[
                            Divider(height: 1, color: context.border),
                            ListTile(
                              leading: const Icon(Icons.timer_outlined, color: SyncColors.sky),
                              title: const Text('Disappearing timer'),
                              subtitle: Text(_timerLabel(timer)),
                              trailing: DropdownButton<int>(
                                value: const [0, 10, 30, 60, 300, 3600, 86400].contains(timer) ? timer : 30,
                                items: const [
                                  DropdownMenuItem(value: 0, child: Text('Off')),
                                  DropdownMenuItem(value: 10, child: Text('10 sec')),
                                  DropdownMenuItem(value: 30, child: Text('30 sec')),
                                  DropdownMenuItem(value: 60, child: Text('1 min')),
                                  DropdownMenuItem(value: 300, child: Text('5 min')),
                                  DropdownMenuItem(value: 3600, child: Text('1 hour')),
                                  DropdownMenuItem(value: 86400, child: Text('1 day')),
                                ],
                                onChanged: saving
                                    ? null
                                    : (value) {
                                        if (value != null) {
                                          _setPreference('secretDisappearSeconds', value);
                                        }
                                      },
                              ),
                            ),
                          ],
                          Divider(height: 1, color: context.border),
                          SwitchListTile(
                            secondary: const Icon(Icons.enhanced_encryption_outlined, color: SyncColors.sky),
                            title: const Text('Device end-to-end encryption'),
                            subtitle: const Text('Encrypt new text messages with device keys.'),
                            value: e2eeEnabled,
                            onChanged: saving ? null : _toggleE2ee,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 18),
                    _sectionTitle(context, 'Friend controls'),
                    SyncSoftCard(
                      padding: EdgeInsets.zero,
                      child: Column(
                        children: [
                          ListTile(
                            leading: const Icon(Icons.chat_bubble_outline_rounded, color: SyncColors.sky),
                            title: const Text('Open chat'),
                            trailing: const Icon(Icons.chevron_right_rounded),
                            onTap: () => Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) => LiveChatRoomScreen(inbox: room, name: name),
                              ),
                            ),
                          ),
                          Divider(height: 1, color: context.border),
                          ListTile(
                            leading: Icon(
                              blocked ? Icons.person_add_alt_1_rounded : Icons.block_rounded,
                              color: blocked ? SyncColors.sky : SyncColors.danger,
                            ),
                            title: Text(blocked ? 'Unblock contact' : 'Block contact'),
                            subtitle: blockedYou ? const Text('This contact has blocked you.') : null,
                            onTap: saving ? null : _toggleBlock,
                          ),
                        ],
                      ),
                    ),
                    if (saving) ...[
                      const SizedBox(height: 18),
                      const Center(child: CircularProgressIndicator()),
                    ],
                  ],
                ),
    );
  }

  Widget _profileTile(IconData icon, String label, dynamic value) {
    final text = value?.toString().trim() ?? '';
    return ListTile(
      leading: Icon(icon, color: SyncColors.sky),
      title: Text(label, style: const TextStyle(fontWeight: FontWeight.w800)),
      subtitle: Text(text.isEmpty ? 'Not shared' : text),
    );
  }

  void _snack(String text) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }
}

class _RoomSecurityError extends StatelessWidget {
  const _RoomSecurityError({required this.message, required this.onRetry});

  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.shield_outlined, size: 48, color: SyncColors.sky),
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

Widget _sectionTitle(BuildContext context, String text) => Padding(
      padding: const EdgeInsets.fromLTRB(6, 0, 6, 8),
      child: Text(
        text.toUpperCase(),
        style: TextStyle(
          color: context.muted,
          fontSize: 11,
          fontWeight: FontWeight.w900,
          letterSpacing: .7,
        ),
      ),
    );

bool _hasUser(dynamic value, String userId) =>
    value is List && userId.isNotEmpty && value.map((item) => item.toString()).contains(userId);

String _friendId(Map<String, dynamic> inbox, String userId) {
  final profile = inbox['profile'];
  if (profile is Map) {
    final value = profile['userId']?.toString() ?? profile['_id']?.toString() ?? '';
    if (value.isNotEmpty && value != userId) return value;
  }
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

String _friendName(Map<String, dynamic> inbox, String userId) {
  final profile = inbox['profile'];
  if (profile is Map) {
    final value = profile['fullname'] ?? profile['username'];
    if (value != null && value.toString().trim().isNotEmpty) return value.toString();
  }
  final owners = inbox['owners'];
  if (owners is List) {
    for (final owner in owners.whereType<Map>()) {
      final id = owner['userId']?.toString() ?? owner['_id']?.toString() ?? '';
      if (id == userId) continue;
      final value = owner['fullname'] ?? owner['username'];
      if (value != null && value.toString().trim().isNotEmpty) return value.toString();
    }
  }
  return 'Friend';
}

String _timerLabel(int seconds) {
  if (seconds <= 0) return 'Off';
  if (seconds < 60) return '$seconds seconds';
  if (seconds < 3600) return '${seconds ~/ 60} minutes';
  if (seconds < 86400) return '${seconds ~/ 3600} hours';
  return '${seconds ~/ 86400} days';
}

String _errorText(Object failure) {
  if (failure is ApiException) return failure.message;
  return failure.toString().replaceFirst('Exception: ', '');
}
