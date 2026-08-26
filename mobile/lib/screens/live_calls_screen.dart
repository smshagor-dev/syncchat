import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../theme.dart';
import '../widgets.dart';
import 'live_call_screen.dart';

class LiveCallsScreen extends StatefulWidget {
  const LiveCallsScreen({super.key});

  @override
  State<LiveCallsScreen> createState() => _LiveCallsScreenState();
}

class _LiveCallsScreenState extends State<LiveCallsScreen> {
  String filter = 'All';
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
        context.services.calling.currentUser(),
        context.services.calling.history(),
      ]);
      final user = Map<String, dynamic>.from(results[0] as Map);
      final history = (results[1] as List)
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
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
    final visible = filter == 'Missed'
        ? calls.where((item) => _isMissed(item)).toList(growable: false)
        : calls;
    return SyncDockPage(
      title: 'Calls',
      trailing: IconButton(
        tooltip: 'New call',
        onPressed: _showNewCall,
        icon: const Icon(Icons.add_call),
      ),
      child: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: EdgeInsets.fromLTRB(
            14,
            12,
            14,
            118 + MediaQuery.paddingOf(context).bottom,
          ),
          children: [
            Row(
              children: [
                Expanded(
                  child: SegmentedButton<String>(
                    segments: const [
                      ButtonSegment(value: 'All', label: Text('All')),
                      ButtonSegment(value: 'Missed', label: Text('Missed')),
                    ],
                    selected: {filter},
                    onSelectionChanged: (value) =>
                        setState(() => filter = value.first),
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton.icon(
                  onPressed: _showNewCall,
                  icon: const Icon(Icons.add_call),
                  label: const Text('New'),
                ),
              ],
            ),
            const SizedBox(height: 14),
            if (loading)
              const Padding(
                padding: EdgeInsets.only(top: 70),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (error != null)
              _ErrorCard(message: error!, onRetry: _load)
            else if (visible.isEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 70),
                child: Column(
                  children: [
                    Icon(
                      filter == 'Missed'
                          ? Icons.call_missed_outgoing_rounded
                          : Icons.call_outlined,
                      size: 48,
                      color: context.muted,
                    ),
                    const SizedBox(height: 12),
                    Text(
                      filter == 'Missed'
                          ? 'No missed calls.'
                          : 'No call history yet.',
                      style: TextStyle(
                        color: context.muted,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              )
            else
              ...visible.map(_callTile),
          ],
        ),
      ),
    );
  }

  Widget _callTile(Map<String, dynamic> call) {
    final name = _roomName(call);
    final missed = _isMissed(call);
    final outgoing = call['userId']?.toString() == currentUserId;
    final text = call['text']?.toString() ?? 'Call';
    final date = DateTime.tryParse(
      call['createdAt']?.toString() ?? '',
    )?.toLocal();
    final video = text.toLowerCase().contains('video');

    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 2, vertical: 3),
      leading: SyncAvatar(name: name, radius: 23),
      title: Text(
        name,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontWeight: FontWeight.w900,
          color: missed ? SyncColors.danger : null,
        ),
      ),
      subtitle: Row(
        children: [
          Icon(
            missed
                ? Icons.call_received_rounded
                : outgoing
                ? Icons.call_made_rounded
                : Icons.call_received_rounded,
            size: 15,
            color: missed ? SyncColors.danger : SyncColors.success,
          ),
          const SizedBox(width: 5),
          Expanded(
            child: Text(
              '${video ? 'Video' : 'Voice'} · ${_dateLabel(date)}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
      trailing: Wrap(
        spacing: 2,
        children: [
          IconButton(
            tooltip: 'Voice call',
            onPressed: () => _redial(call, name: name, video: false),
            icon: const Icon(Icons.call_outlined, color: SyncColors.sky),
          ),
          IconButton(
            tooltip: 'Video call',
            onPressed: () => _redial(call, name: name, video: true),
            icon: const Icon(Icons.videocam_outlined, color: SyncColors.sky),
          ),
        ],
      ),
    );
  }

  Future<void> _redial(
    Map<String, dynamic> call, {
    required String name,
    required bool video,
  }) async {
    final roomId = call['roomId']?.toString() ?? '';
    if (roomId.isEmpty) return;
    try {
      final inbox = await context.services.inbox.findByRoom(roomId);
      if (!mounted) return;
      await openOutgoingCall(context, inbox: inbox, name: name, video: video);
      if (mounted) await _load();
    } on Object catch (failure) {
      if (mounted) _snack(_messageFor(failure));
    }
  }

  Future<void> _showNewCall() async {
    try {
      final results = await Future.wait<dynamic>([
        context.services.inbox.list(),
        context.services.calling.currentUser(),
      ]);
      final inboxes = (results[0] as List)
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .where((item) => (item['roomId']?.toString() ?? '').isNotEmpty)
          .toList(growable: false);
      final user = Map<String, dynamic>.from(results[1] as Map);
      final self = user['_id']?.toString() ?? currentUserId;
      if (!mounted) return;

      await showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        isScrollControlled: true,
        builder: (sheetContext) => SafeArea(
          child: SizedBox(
            height: MediaQuery.sizeOf(sheetContext).height * .68,
            child: Column(
              children: [
                const ListTile(
                  title: Text(
                    'Start a call',
                    style: TextStyle(fontWeight: FontWeight.w900),
                  ),
                  subtitle: Text('Choose an existing conversation.'),
                ),
                const Divider(height: 1),
                Expanded(
                  child: inboxes.isEmpty
                      ? const Center(child: Text('No conversations available.'))
                      : ListView.builder(
                          itemCount: inboxes.length,
                          itemBuilder: (_, index) {
                            final inbox = inboxes[index];
                            final name = _inboxName(inbox, self);
                            final group =
                                inbox['roomType']?.toString() == 'group';
                            return ListTile(
                              leading: SyncAvatar(name: name, radius: 22),
                              title: Text(
                                name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              subtitle: Text(
                                group
                                    ? 'Group conversation'
                                    : 'Private conversation',
                              ),
                              trailing: Wrap(
                                children: [
                                  IconButton(
                                    tooltip: 'Voice call',
                                    onPressed: () {
                                      Navigator.pop(sheetContext);
                                      openOutgoingCall(
                                        context,
                                        inbox: inbox,
                                        name: name,
                                        video: false,
                                      );
                                    },
                                    icon: const Icon(Icons.call_outlined),
                                  ),
                                  IconButton(
                                    tooltip: 'Video call',
                                    onPressed: () {
                                      Navigator.pop(sheetContext);
                                      openOutgoingCall(
                                        context,
                                        inbox: inbox,
                                        name: name,
                                        video: true,
                                      );
                                    },
                                    icon: const Icon(Icons.videocam_outlined),
                                  ),
                                ],
                              ),
                            );
                          },
                        ),
                ),
              ],
            ),
          ),
        ),
      );
    } on Object catch (failure) {
      if (mounted) _snack(_messageFor(failure));
    }
  }

  bool _isMissed(Map<String, dynamic> call) {
    final text = call['text']?.toString().toLowerCase() ?? '';
    return text.contains('missed') ||
        text.contains('rejected') ||
        text.contains('declined');
  }

  String _roomName(Map<String, dynamic> call) {
    final group = call['group'];
    if (group is Map && (group['name']?.toString() ?? '').isNotEmpty) {
      return group['name'].toString();
    }
    final channel = call['channel'];
    if (channel is Map && (channel['name']?.toString() ?? '').isNotEmpty) {
      return channel['name'].toString();
    }
    final owners = call['owners'];
    if (owners is List) {
      Map? fallback;
      for (final raw in owners.whereType<Map>()) {
        fallback ??= raw;
        if (raw['userId']?.toString() != currentUserId) {
          return _profileName(raw);
        }
      }
      if (fallback != null) return _profileName(fallback);
    }
    return 'SyncChat call';
  }

  String _inboxName(Map<String, dynamic> inbox, String self) {
    final group = inbox['group'];
    if (group is Map && (group['name']?.toString() ?? '').isNotEmpty) {
      return group['name'].toString();
    }
    final channel = inbox['channel'];
    if (channel is Map && (channel['name']?.toString() ?? '').isNotEmpty) {
      return channel['name'].toString();
    }
    final owners = inbox['owners'];
    if (owners is List) {
      Map? fallback;
      for (final raw in owners.whereType<Map>()) {
        fallback ??= raw;
        if (raw['userId']?.toString() != self) return _profileName(raw);
      }
      if (fallback != null) return _profileName(fallback);
    }
    return 'Conversation';
  }

  String _profileName(Map profile) {
    final fullname = profile['fullname']?.toString().trim() ?? '';
    if (fullname.isNotEmpty) return fullname;
    final username = profile['username']?.toString().trim() ?? '';
    if (username.isNotEmpty) return '@$username';
    return 'SyncChat user';
  }

  String _dateLabel(DateTime? value) {
    if (value == null) return 'recently';
    final now = DateTime.now();
    final sameDay =
        value.year == now.year &&
        value.month == now.month &&
        value.day == now.day;
    final time =
        '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}';
    if (sameDay) return 'Today, $time';
    return '${value.day}/${value.month}/${value.year}, $time';
  }

  void _snack(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  String _messageFor(Object error) {
    if (error is ApiException) return error.message;
    return error.toString().replaceFirst('Exception: ', '');
  }
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
