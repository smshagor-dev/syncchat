import 'dart:async';

import 'package:flutter/material.dart';

import '../core/app_scope.dart';
import '../core/calling_repository.dart';
import 'live_call_screen.dart';

class GlobalCallLayer extends StatefulWidget {
  const GlobalCallLayer({super.key, required this.child});

  final Widget child;

  @override
  State<GlobalCallLayer> createState() => _GlobalCallLayerState();
}

class _GlobalCallLayerState extends State<GlobalCallLayer> {
  CallingRepository? calling;
  StreamSubscription<Map<String, dynamic>>? nativeAcceptSubscription;
  bool bound = false;
  bool presenting = false;
  String? activeCallId;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _bind());
  }

  @override
  void dispose() {
    if (bound) calling?.off('call/incoming', _onIncoming);
    nativeAcceptSubscription?.cancel();
    super.dispose();
  }

  void _bind() {
    if (!mounted || bound) return;
    calling = context.services.calling;
    calling!.on('call/incoming', _onIncoming);
    nativeAcceptSubscription = context.services.nativeCallPush.acceptedCalls.listen(
      (call) => _presentIncoming(call, autoAccept: true),
    );
    bound = true;
  }

  Future<void> _onIncoming(dynamic raw) async {
    if (raw is! Map) return;
    await _presentIncoming(Map<String, dynamic>.from(raw));
  }

  Future<void> _presentIncoming(
    Map<String, dynamic> call, {
    bool autoAccept = false,
  }) async {
    if (!mounted) return;
    final callId = call['callId']?.toString() ?? '';
    final roomId = call['roomId']?.toString() ?? '';
    if (callId.isEmpty || roomId.isEmpty) return;
    if (presenting || activeCallId == callId) return;

    presenting = true;
    activeCallId = callId;

    Map<String, dynamic>? inbox;
    try {
      inbox = await context.services.inbox.findByRoom(roomId);
    } on Object {
      inbox = {
        'roomId': roomId,
        'roomType': call['roomType']?.toString() ?? 'private',
        'ownersId': call['recipientsId'] is List
            ? List<dynamic>.from(call['recipientsId'] as List)
            : const <dynamic>[],
      };
    }

    if (!mounted) {
      presenting = false;
      activeCallId = null;
      return;
    }

    final fromName = call['fromName']?.toString().trim() ?? '';
    final fromUsername = call['fromUsername']?.toString().trim() ?? '';
    final name = fromName.isNotEmpty
        ? fromName
        : fromUsername.isNotEmpty
        ? '@$fromUsername'
        : call['roomType']?.toString() == 'group'
        ? 'Group call'
        : 'Incoming call';

    try {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          fullscreenDialog: true,
          builder: (_) => LiveCallScreen(
            inbox: inbox,
            incomingCall: call,
            name: name,
            video: call['mediaType']?.toString() == 'video',
            autoAccept: autoAccept,
          ),
        ),
      );
    } finally {
      presenting = false;
      activeCallId = null;
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
