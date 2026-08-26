import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../theme.dart';
import '../widgets.dart';

Future<bool?> showForwardMessageSheet(
  BuildContext context, {
  required String fromRoomId,
  required List<String> chatIds,
}) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) =>
        _ForwardMessageSheet(fromRoomId: fromRoomId, chatIds: chatIds),
  );
}

class _ForwardMessageSheet extends StatefulWidget {
  const _ForwardMessageSheet({required this.fromRoomId, required this.chatIds});

  final String fromRoomId;
  final List<String> chatIds;

  @override
  State<_ForwardMessageSheet> createState() => _ForwardMessageSheetState();
}

class _ForwardMessageSheetState extends State<_ForwardMessageSheet> {
  final search = TextEditingController();
  final inboxes = <Map<String, dynamic>>[];

  Map<String, dynamic>? currentUser;
  bool loading = true;
  String? error;
  String? sendingRoomId;

  String get currentUserId => currentUser?['_id']?.toString() ?? '';

  @override
  void initState() {
    super.initState();
    search.addListener(_refresh);
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    search
      ..removeListener(_refresh)
      ..dispose();
    super.dispose();
  }

  void _refresh() {
    if (mounted) setState(() {});
  }

  Future<void> _load() async {
    try {
      final services = context.services;
      final results = await Future.wait<dynamic>([
        services.chat.currentUser(),
        services.inbox.list(),
      ]);
      if (!mounted) return;
      setState(() {
        currentUser = Map<String, dynamic>.from(results[0] as Map);
        inboxes
          ..clear()
          ..addAll(
            (results[1] as List).whereType<Map>().map(
              (item) => Map<String, dynamic>.from(item),
            ),
          );
        loading = false;
        error = null;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        loading = false;
        error = _messageFor(failure);
      });
    }
  }

  List<Map<String, dynamic>> get filtered {
    final query = search.text.trim().toLowerCase();
    return inboxes
        .where((inbox) {
          if (inbox['roomId']?.toString() == widget.fromRoomId) return false;
          if (_forwardBlocked(inbox)) return false;
          if (query.isEmpty) return true;
          final title = _title(inbox).toLowerCase();
          final subtitle = _subtitle(inbox).toLowerCase();
          return title.contains(query) || subtitle.contains(query);
        })
        .toList(growable: false);
  }

  bool _forwardBlocked(Map<String, dynamic> inbox) {
    if (inbox['e2eeEnabled'] == true) return true;
    return inbox['secretChatEnabled'] == true &&
        (inbox['secretForwardBlocked'] == null ||
            inbox['secretForwardBlocked'] == true);
  }

  Future<void> _forward(Map<String, dynamic> destination) async {
    final toRoomId = destination['roomId']?.toString() ?? '';
    if (toRoomId.isEmpty || sendingRoomId != null) return;

    setState(() {
      sendingRoomId = toRoomId;
      error = null;
    });

    try {
      final services = context.services;
      final liveRooms = await Future.wait<Map<String, dynamic>>([
        services.inbox.findByRoom(widget.fromRoomId),
        services.inbox.findByRoom(toRoomId),
      ]);
      final fromInbox = liveRooms[0];
      final toInbox = liveRooms[1];
      if (fromInbox['e2eeEnabled'] == true || toInbox['e2eeEnabled'] == true) {
        throw const ApiException(
          statusCode: 403,
          message:
              'Forwarding device-E2EE messages is disabled to prevent plaintext downgrade.',
          payload: {'code': 'E2EE_FORWARD_BLOCKED'},
        );
      }
      if (_forwardBlocked(fromInbox) || _forwardBlocked(toInbox)) {
        throw const ApiException(
          statusCode: 403,
          message: 'Forward is blocked in secret chat',
        );
      }

      await services.chat.openRoom(widget.fromRoomId);
      services.realtime.emit('chat/forward', {
        'userId': currentUserId,
        'fromRoomId': widget.fromRoomId,
        'chatsId': widget.chatIds,
        'toRoomId': toRoomId,
        'toRoomType':
            toInbox['roomType']?.toString() ??
            destination['roomType']?.toString() ??
            'private',
        'toOwnersId': toInbox['ownersId'] is List
            ? toInbox['ownersId']
            : destination['ownersId'] is List
            ? destination['ownersId']
            : const [],
      });

      if (mounted) Navigator.pop(context, true);
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        sendingRoomId = null;
        error = _messageFor(failure);
      });
    }
  }

  String _title(Map<String, dynamic> inbox) {
    if (inbox['roomType']?.toString() == 'group') {
      final channel = inbox['channel'];
      final group = inbox['group'];
      if (channel is Map &&
          channel['name']?.toString().trim().isNotEmpty == true) {
        return channel['name'].toString();
      }
      if (group is Map && group['name']?.toString().trim().isNotEmpty == true) {
        return group['name'].toString();
      }
      return 'Group';
    }

    final owners = inbox['owners'];
    if (owners is List) {
      for (final raw in owners.whereType<Map>()) {
        if (raw['userId']?.toString() == currentUserId) continue;
        final fullname = raw['fullname']?.toString().trim() ?? '';
        if (fullname.isNotEmpty) return fullname;
        final username = raw['username']?.toString().trim() ?? '';
        if (username.isNotEmpty) return '@$username';
      }
    }
    return 'Chat';
  }

  String _subtitle(Map<String, dynamic> inbox) {
    if (inbox['roomType']?.toString() == 'group') {
      final channel = inbox['channel'];
      if (channel is Map && channel['name'] != null) return 'Channel';
      final group = inbox['group'];
      if (group is Map && group['participantsId'] is List) {
        return '${(group['participantsId'] as List).length} members';
      }
      return 'Group conversation';
    }

    final owners = inbox['owners'];
    if (owners is List) {
      for (final raw in owners.whereType<Map>()) {
        if (raw['userId']?.toString() == currentUserId) continue;
        final username = raw['username']?.toString().trim() ?? '';
        if (username.isNotEmpty) return '@$username';
      }
    }
    return 'Private chat';
  }

  String _messageFor(Object failure) {
    if (failure is ApiException) return failure.message;
    return failure.toString().replaceFirst('Exception: ', '');
  }

  @override
  Widget build(BuildContext context) {
    final rows = filtered;
    return SafeArea(
      top: false,
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * .78,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 0, 18, 10),
              child: Row(
                children: [
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Forward Message',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        SizedBox(height: 2),
                        Text('Choose a conversation'),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close_rounded),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: TextField(
                controller: search,
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.search_rounded),
                  hintText: 'Search chat...',
                ),
              ),
            ),
            if (error != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 8, 18, 0),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    error!,
                    style: const TextStyle(
                      color: SyncColors.danger,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            const SizedBox(height: 8),
            Expanded(
              child: loading
                  ? const Center(child: CircularProgressIndicator())
                  : rows.isEmpty
                  ? Center(
                      child: Text(
                        search.text.trim().isEmpty
                            ? 'No conversation available for forwarding.'
                            : 'No chat found.',
                        style: TextStyle(color: context.muted),
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.separated(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.fromLTRB(10, 4, 10, 18),
                        itemCount: rows.length,
                        separatorBuilder: (_, __) => Divider(
                          height: 1,
                          indent: 64,
                          color: context.border,
                        ),
                        itemBuilder: (_, index) {
                          final inbox = rows[index];
                          final roomId = inbox['roomId']?.toString() ?? '';
                          final busy = sendingRoomId == roomId;
                          final title = _title(inbox);
                          return ListTile(
                            enabled: sendingRoomId == null,
                            leading: SyncAvatar(
                              name: title,
                              radius: 21,
                              online: false,
                            ),
                            title: Text(
                              title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            subtitle: Text(
                              _subtitle(inbox),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            trailing: busy
                                ? const SizedBox.square(
                                    dimension: 22,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : const Icon(
                                    Icons.send_rounded,
                                    color: SyncColors.sky,
                                    size: 20,
                                  ),
                            onTap: () => _forward(inbox),
                          );
                        },
                      ),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
