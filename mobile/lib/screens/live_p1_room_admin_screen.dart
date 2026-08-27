import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../theme.dart';
import '../widgets.dart';

class LiveRoomAdminHubScreen extends StatefulWidget {
  const LiveRoomAdminHubScreen({super.key});

  @override
  State<LiveRoomAdminHubScreen> createState() => _LiveRoomAdminHubScreenState();
}

class _LiveRoomAdminHubScreenState extends State<LiveRoomAdminHubScreen> {
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
      final current = Map<String, dynamic>.from(result[0] as Map);
      final id = current['_id']?.toString() ?? '';
      final candidates = (result[1] as List)
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .where((item) {
            final entity = _entity(item);
            return entity.isNotEmpty && _isAdmin(entity, id);
          })
          .toList(growable: false);
      setState(() {
        currentUser = current;
        rooms = candidates;
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
      title: 'Group & channel admin',
      actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh_rounded))],
      child: loading && rooms.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : error != null && rooms.isEmpty
              ? _AdminError(message: error!, onRetry: _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  child: rooms.isEmpty
                      ? ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.only(top: 120),
                          children: const [
                            Icon(Icons.admin_panel_settings_outlined, size: 52, color: SyncColors.sky),
                            SizedBox(height: 12),
                            Center(child: Text('No groups or channels where you are an admin.')),
                          ],
                        )
                      : ListView.separated(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.fromLTRB(8, 8, 8, 30),
                          itemCount: rooms.length,
                          separatorBuilder: (_, __) => Divider(height: 1, indent: 70, color: context.border),
                          itemBuilder: (_, index) {
                            final room = rooms[index];
                            final entity = _entity(room);
                            final isChannel = room['channel'] is Map;
                            final name = entity['name']?.toString() ?? (isChannel ? 'Channel' : 'Group');
                            final pending = entity['pendingMembersId'] is List
                                ? (entity['pendingMembersId'] as List).length
                                : 0;
                            return ListTile(
                              leading: SyncAvatar(
                                name: name,
                                imageUrl: entity['avatar']?.toString(),
                                radius: 23,
                              ),
                              title: Text(name, style: const TextStyle(fontWeight: FontWeight.w900)),
                              subtitle: Text('${isChannel ? 'Channel' : 'Group'} · $pending pending'),
                              trailing: const Icon(Icons.chevron_right_rounded),
                              onTap: () => Navigator.of(context).push(
                                MaterialPageRoute<void>(
                                  builder: (_) => LiveRoomAdminScreen(
                                    inbox: room,
                                    currentUserId: userId,
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                ),
    );
  }
}

class LiveRoomAdminScreen extends StatefulWidget {
  const LiveRoomAdminScreen({
    super.key,
    required this.inbox,
    required this.currentUserId,
  });

  final Map<String, dynamic> inbox;
  final String currentUserId;

  @override
  State<LiveRoomAdminScreen> createState() => _LiveRoomAdminScreenState();
}

class _LiveRoomAdminScreenState extends State<LiveRoomAdminScreen> {
  Map<String, dynamic> entity = const {};
  List<Map<String, dynamic>> pending = const [];
  final bannedWords = TextEditingController();
  bool loading = true;
  bool saving = false;
  String? error;

  final Map<String, bool> permissions = {
    'memberCanEditInfo': false,
    'memberCanSendMessage': true,
    'memberCanAddMember': false,
    'memberCanInviteViaLink': false,
    'adminApprovalRequired': false,
  };
  int slowModeSeconds = 0;
  final Set<String> blockedMediaTypes = <String>{};
  bool autoReportViolations = true;

  bool get isChannel => widget.inbox['channel'] is Map;
  String get entityId => entity['_id']?.toString() ?? _entity(widget.inbox)['_id']?.toString() ?? '';
  String get name => entity['name']?.toString() ?? (isChannel ? 'Channel' : 'Group');

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    bannedWords.dispose();
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
      final initialId = _entity(widget.inbox)['_id']?.toString() ?? '';
      if (initialId.isEmpty) {
        throw const ApiException(statusCode: 400, message: 'Room identity is missing.');
      }
      final fresh = isChannel
          ? await context.services.channels.find(initialId)
          : await context.services.groups.find(initialId);
      final pendingRows = isChannel
          ? await context.services.channels.pendingMembers(initialId)
          : await context.services.groups.pendingMembers(initialId);
      if (!mounted) return;
      _applyEntity(fresh);
      setState(() {
        entity = fresh;
        pending = pendingRows;
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

  void _applyEntity(Map<String, dynamic> source) {
    final rawPermissions = source['permissions'];
    final p = rawPermissions is Map
        ? Map<String, dynamic>.from(rawPermissions)
        : const <String, dynamic>{};
    permissions['memberCanEditInfo'] = p['memberCanEditInfo'] == true;
    permissions['memberCanSendMessage'] = p['memberCanSendMessage'] == null
        ? !isChannel
        : p['memberCanSendMessage'] == true;
    permissions['memberCanAddMember'] = p['memberCanAddMember'] == true;
    permissions['memberCanInviteViaLink'] = p['memberCanInviteViaLink'] == true;
    permissions['adminApprovalRequired'] = p['adminApprovalRequired'] == true;

    final rawModeration = source['moderation'];
    final moderation = rawModeration is Map
        ? Map<String, dynamic>.from(rawModeration)
        : const <String, dynamic>{};
    slowModeSeconds = (moderation['slowModeSeconds'] as num?)?.toInt() ?? 0;
    bannedWords.text = moderation['bannedWords'] is List
        ? (moderation['bannedWords'] as List).map((item) => item.toString()).join(', ')
        : '';
    blockedMediaTypes
      ..clear()
      ..addAll(
        moderation['blockedMediaTypes'] is List
            ? (moderation['blockedMediaTypes'] as List).map((item) => item.toString())
            : const <String>[],
      );
    autoReportViolations = moderation['autoReportViolations'] != false;
  }

  Future<void> _savePermissions() async {
    if (saving || entityId.isEmpty) return;
    setState(() => saving = true);
    try {
      final payload = Map<String, dynamic>.from(permissions);
      final result = isChannel
          ? await context.services.channels.updatePermissions(entityId, payload)
          : await context.services.groups.updatePermissions(entityId, payload);
      if (!mounted) return;
      setState(() {
        if (result.isNotEmpty) entity = {...entity, ...result};
        saving = false;
      });
      _snack('Permissions updated.');
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => saving = false);
      _snack(_errorText(failure));
    }
  }

  Future<void> _saveModeration() async {
    if (saving || entityId.isEmpty) return;
    setState(() => saving = true);
    final words = bannedWords.text
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .where((item) => item.isNotEmpty)
        .toSet()
        .toList(growable: false);
    final moderation = <String, dynamic>{
      'slowModeSeconds': slowModeSeconds,
      'bannedWords': words,
      'blockedMediaTypes': blockedMediaTypes.toList(growable: false),
      'autoReportViolations': autoReportViolations,
    };
    try {
      final result = isChannel
          ? await context.services.channels.updateModeration(entityId, moderation)
          : await context.services.groups.updateModeration(entityId, moderation);
      if (!mounted) return;
      setState(() {
        if (result.isNotEmpty) entity = {...entity, ...result};
        saving = false;
      });
      _snack('Moderation updated.');
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => saving = false);
      _snack(_errorText(failure));
    }
  }

  Future<void> _resolvePending(Map<String, dynamic> row, bool approve) async {
    if (saving || entityId.isEmpty) return;
    final memberId = _memberId(row);
    if (memberId.isEmpty) return;
    setState(() => saving = true);
    try {
      if (isChannel) {
        if (approve) {
          await context.services.channels.approvePending(entityId, memberId);
        } else {
          await context.services.channels.rejectPending(entityId, memberId);
        }
      } else {
        if (approve) {
          await context.services.groups.approvePending(entityId, memberId);
        } else {
          await context.services.groups.rejectPending(entityId, memberId);
        }
      }
      final rows = isChannel
          ? await context.services.channels.pendingMembers(entityId)
          : await context.services.groups.pendingMembers(entityId);
      if (!mounted) return;
      setState(() {
        pending = rows;
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
    return SyncStandardPage(
      title: name,
      actions: [IconButton(onPressed: loading ? null : _load, icon: const Icon(Icons.refresh_rounded))],
      child: loading && entity.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : error != null && entity.isEmpty
              ? _AdminError(message: error!, onRetry: _load)
              : ListView(
                  padding: const EdgeInsets.fromLTRB(14, 14, 14, 34),
                  children: [
                    SyncFeatureCard(
                      icon: isChannel ? Icons.podcasts_rounded : Icons.groups_rounded,
                      title: '${isChannel ? 'Channel' : 'Group'} controls',
                      body: 'Permissions, join approvals and moderation are enforced by the server for every participant.',
                    ),
                    const SizedBox(height: 18),
                    _section(context, 'Member permissions'),
                    SyncSoftCard(
                      padding: EdgeInsets.zero,
                      child: Column(
                        children: [
                          _permissionSwitch('memberCanSendMessage', 'Members can send messages', Icons.chat_bubble_outline_rounded),
                          Divider(height: 1, color: context.border),
                          _permissionSwitch('memberCanEditInfo', 'Members can edit info', Icons.edit_outlined),
                          Divider(height: 1, color: context.border),
                          _permissionSwitch('memberCanAddMember', 'Members can add people', Icons.person_add_alt_1_rounded),
                          Divider(height: 1, color: context.border),
                          _permissionSwitch('memberCanInviteViaLink', 'Members can invite via link', Icons.link_rounded),
                          Divider(height: 1, color: context.border),
                          _permissionSwitch('adminApprovalRequired', 'Admin approval required', Icons.fact_check_outlined),
                        ],
                      ),
                    ),
                    const SizedBox(height: 10),
                    Align(
                      alignment: Alignment.centerRight,
                      child: FilledButton.icon(
                        onPressed: saving ? null : _savePermissions,
                        icon: const Icon(Icons.save_outlined),
                        label: const Text('Save permissions'),
                      ),
                    ),
                    const SizedBox(height: 22),
                    _section(context, 'Pending approval'),
                    SyncSoftCard(
                      padding: EdgeInsets.zero,
                      child: pending.isEmpty
                          ? const ListTile(
                              leading: Icon(Icons.check_circle_outline_rounded, color: SyncColors.success),
                              title: Text('No pending requests'),
                            )
                          : Column(
                              children: pending.map((row) {
                                final label = _memberName(row);
                                return ListTile(
                                  leading: SyncAvatar(
                                    name: label,
                                    imageUrl: _memberAvatar(row),
                                    radius: 20,
                                  ),
                                  title: Text(label, style: const TextStyle(fontWeight: FontWeight.w800)),
                                  subtitle: Text(_memberSubtitle(row)),
                                  trailing: Wrap(
                                    spacing: 2,
                                    children: [
                                      IconButton(
                                        tooltip: 'Approve',
                                        onPressed: saving ? null : () => _resolvePending(row, true),
                                        icon: const Icon(Icons.check_rounded, color: SyncColors.success),
                                      ),
                                      IconButton(
                                        tooltip: 'Reject',
                                        onPressed: saving ? null : () => _resolvePending(row, false),
                                        icon: const Icon(Icons.close_rounded, color: SyncColors.danger),
                                      ),
                                    ],
                                  ),
                                );
                              }).toList(),
                            ),
                    ),
                    const SizedBox(height: 22),
                    _section(context, 'Moderation'),
                    SyncSoftCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          DropdownButtonFormField<int>(
                            value: const [0, 10, 30, 60, 120, 300, 600, 3600].contains(slowModeSeconds)
                                ? slowModeSeconds
                                : 0,
                            decoration: const InputDecoration(
                              labelText: 'Slow mode',
                              prefixIcon: Icon(Icons.timer_outlined),
                            ),
                            items: const [
                              DropdownMenuItem(value: 0, child: Text('Off')),
                              DropdownMenuItem(value: 10, child: Text('10 seconds')),
                              DropdownMenuItem(value: 30, child: Text('30 seconds')),
                              DropdownMenuItem(value: 60, child: Text('1 minute')),
                              DropdownMenuItem(value: 120, child: Text('2 minutes')),
                              DropdownMenuItem(value: 300, child: Text('5 minutes')),
                              DropdownMenuItem(value: 600, child: Text('10 minutes')),
                              DropdownMenuItem(value: 3600, child: Text('1 hour')),
                            ],
                            onChanged: saving ? null : (value) => setState(() => slowModeSeconds = value ?? 0),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: bannedWords,
                            enabled: !saving,
                            minLines: 2,
                            maxLines: 4,
                            decoration: const InputDecoration(
                              labelText: 'Banned words',
                              hintText: 'word1, word2, word3',
                              prefixIcon: Icon(Icons.gpp_bad_outlined),
                              alignLabelWithHint: true,
                            ),
                          ),
                          const SizedBox(height: 12),
                          const Text('Blocked media types', style: TextStyle(fontWeight: FontWeight.w800)),
                          const SizedBox(height: 7),
                          Wrap(
                            spacing: 7,
                            runSpacing: 7,
                            children: ['image', 'video', 'audio', 'document'].map((type) {
                              final selected = blockedMediaTypes.contains(type);
                              return FilterChip(
                                label: Text(type),
                                selected: selected,
                                onSelected: saving
                                    ? null
                                    : (value) => setState(() {
                                          if (value) {
                                            blockedMediaTypes.add(type);
                                          } else {
                                            blockedMediaTypes.remove(type);
                                          }
                                        }),
                              );
                            }).toList(),
                          ),
                          const SizedBox(height: 8),
                          SwitchListTile(
                            contentPadding: EdgeInsets.zero,
                            value: autoReportViolations,
                            title: const Text('Auto-report violations'),
                            subtitle: const Text('Create moderation reports for blocked content.'),
                            onChanged: saving ? null : (value) => setState(() => autoReportViolations = value),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 10),
                    Align(
                      alignment: Alignment.centerRight,
                      child: FilledButton.icon(
                        onPressed: saving ? null : _saveModeration,
                        icon: const Icon(Icons.shield_outlined),
                        label: const Text('Save moderation'),
                      ),
                    ),
                    if (saving) ...[
                      const SizedBox(height: 16),
                      const Center(child: CircularProgressIndicator()),
                    ],
                  ],
                ),
    );
  }

  Widget _permissionSwitch(String key, String label, IconData icon) => SwitchListTile(
        secondary: Icon(icon, color: SyncColors.sky),
        title: Text(label),
        value: permissions[key] == true,
        onChanged: saving ? null : (value) => setState(() => permissions[key] = value),
      );

  void _snack(String text) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }
}

class _AdminError extends StatelessWidget {
  const _AdminError({required this.message, required this.onRetry});
  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.admin_panel_settings_outlined, size: 48, color: SyncColors.sky),
              const SizedBox(height: 12),
              Text(message, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              FilledButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh_rounded), label: const Text('Retry')),
            ],
          ),
        ),
      );
}

Map<String, dynamic> _entity(Map<String, dynamic> inbox) {
  final channel = inbox['channel'];
  if (channel is Map) return Map<String, dynamic>.from(channel);
  final group = inbox['group'];
  if (group is Map) return Map<String, dynamic>.from(group);
  return const {};
}

bool _isAdmin(Map<String, dynamic> entity, String userId) {
  if (userId.isEmpty) return false;
  if (entity['adminId']?.toString() == userId) return true;
  final admins = entity['adminsId'];
  return admins is List && admins.map((item) => item.toString()).contains(userId);
}

String _memberId(Map<String, dynamic> row) {
  for (final key in ['userId', '_id', 'memberId']) {
    final value = row[key]?.toString() ?? '';
    if (value.isNotEmpty) return value;
  }
  final profile = row['profile'];
  if (profile is Map) {
    return profile['userId']?.toString() ?? profile['_id']?.toString() ?? '';
  }
  return '';
}

String _memberName(Map<String, dynamic> row) {
  for (final key in ['fullname', 'username']) {
    final value = row[key]?.toString() ?? '';
    if (value.isNotEmpty) return value;
  }
  final profile = row['profile'];
  if (profile is Map) {
    return profile['fullname']?.toString() ?? profile['username']?.toString() ?? 'Member';
  }
  return 'Member';
}

String? _memberAvatar(Map<String, dynamic> row) {
  final direct = row['avatar']?.toString().trim() ?? '';
  if (direct.isNotEmpty) return direct;
  final profile = row['profile'];
  if (profile is Map) {
    final nested = profile['avatar']?.toString().trim() ?? '';
    if (nested.isNotEmpty) return nested;
  }
  return null;
}

String _memberSubtitle(Map<String, dynamic> row) {
  final profile = row['profile'];
  final source = profile is Map ? profile : row;
  final username = source['username']?.toString() ?? '';
  final email = source['email']?.toString() ?? '';
  if (username.isNotEmpty) return '@$username';
  if (email.isNotEmpty) return email;
  return 'Join request';
}

Widget _section(BuildContext context, String text) => Padding(
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

String _errorText(Object failure) {
  if (failure is ApiException) return failure.message;
  return failure.toString().replaceFirst('Exception: ', '');
}
