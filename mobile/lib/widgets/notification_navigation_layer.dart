import 'dart:async';

import 'package:flutter/material.dart';

import '../core/app_scope.dart';
import '../core/device_integration_service.dart';
import '../screens/live_chat_room_screen.dart';

class NotificationNavigationLayer extends StatefulWidget {
  const NotificationNavigationLayer({super.key, required this.child});

  final Widget child;

  @override
  State<NotificationNavigationLayer> createState() =>
      _NotificationNavigationLayerState();
}

class _NotificationNavigationLayerState
    extends State<NotificationNavigationLayer> {
  StreamSubscription<String>? _subscription;
  final Set<String> _opening = <String>{};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _subscription = DeviceIntegrationService.notificationTaps.listen(
        (payload) => unawaited(_open(payload)),
      );
      for (final payload
          in DeviceIntegrationService.takePendingNotificationTaps()) {
        unawaited(_open(payload));
      }
    });
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }

  Future<void> _open(String payload) async {
    final roomId = payload.trim();
    if (!mounted || roomId.isEmpty || !_opening.add(roomId)) return;
    try {
      final inbox = await context.services.inbox.findByRoom(roomId);
      if (!mounted || inbox.isEmpty) return;
      final user = await context.services.chat.currentUser();
      if (!mounted) return;
      final name = _roomName(
        inbox,
        currentUserId: user['_id']?.toString() ?? '',
      );
      await Navigator.of(context).push<void>(
        MaterialPageRoute<void>(
          builder: (_) => LiveChatRoomScreen(inbox: inbox, name: name),
        ),
      );
    } on Object {
      // A request/notification can be stale or the app can still be offline.
      // The chat list remains available from cache and the next tap/reconnect
      // can retry without breaking the authenticated session.
    } finally {
      _opening.remove(roomId);
    }
  }

  String _roomName(
    Map<String, dynamic> inbox, {
    required String currentUserId,
  }) {
    if (inbox['channel'] is Map) {
      final channel = inbox['channel'] as Map;
      final name = channel['name']?.toString().trim() ?? '';
      if (name.isNotEmpty) return name;
    }
    if (inbox['group'] is Map) {
      final group = inbox['group'] as Map;
      final name = group['name']?.toString().trim() ?? '';
      if (name.isNotEmpty) return name;
    }
    final owners = inbox['owners'];
    if (owners is List) {
      for (final raw in owners.whereType<Map>()) {
        final id = raw['userId']?.toString() ?? '';
        if (id.isNotEmpty && id == currentUserId) continue;
        final fullname = raw['fullname']?.toString().trim() ?? '';
        if (fullname.isNotEmpty) return fullname;
        final username = raw['username']?.toString().trim() ?? '';
        if (username.isNotEmpty) return '@$username';
      }
    }
    return inbox['roomType']?.toString() == 'group' ? 'Group' : 'Contact';
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
