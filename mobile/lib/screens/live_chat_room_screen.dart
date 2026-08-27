import 'dart:async';

import 'package:flutter/material.dart';

import '../core/app_scope.dart';
import '../core/biometric_service.dart';
import '../theme.dart';
import 'live_chat_room_core_screen.dart' as core_room;

class LiveChatRoomScreen extends StatefulWidget {
  const LiveChatRoomScreen({
    super.key,
    required this.inbox,
    required this.name,
  });

  final Map<String, dynamic> inbox;
  final String name;

  @override
  State<LiveChatRoomScreen> createState() => _LiveChatRoomScreenState();
}

class _LiveChatRoomScreenState extends State<LiveChatRoomScreen> {
  bool checkingLock = true;
  bool locked = false;
  bool unlocking = false;
  bool unlocked = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_resolveLockState());
    });
  }

  Future<void> _resolveLockState() async {
    try {
      final user = await context.services.chat.currentUser();
      final currentUserId = user['_id']?.toString() ?? '';
      final chatLockBy = widget.inbox['chatLockBy'];
      final isLocked = widget.inbox['roomType']?.toString() == 'private' &&
          chatLockBy is List &&
          chatLockBy.map((value) => value.toString()).contains(currentUserId);

      if (!mounted) return;
      setState(() {
        checkingLock = false;
        locked = isLocked;
        unlocked = !isLocked;
      });

      if (isLocked) {
        unawaited(_unlockChat());
      }
    } on Object {
      if (!mounted) return;
      setState(() {
        checkingLock = false;
        locked = false;
        unlocked = true;
      });
    }
  }

  Future<void> _unlockChat() async {
    if (!mounted || !locked || unlocking || unlocked) return;
    setState(() => unlocking = true);
    final success = await BiometricService.authenticate(
      reason: 'Unlock ${widget.name} chat',
    );
    if (!mounted) return;
    setState(() {
      unlocking = false;
      unlocked = success;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (checkingLock) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (locked && !unlocked) {
      return Scaffold(
        backgroundColor: context.page,
        appBar: AppBar(
          title: Text(widget.name),
          backgroundColor: context.panel,
          surfaceTintColor: Colors.transparent,
        ),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.fingerprint_rounded,
                  color: SyncColors.sky,
                  size: 58,
                ),
                const SizedBox(height: 16),
                const Text(
                  'Chat locked',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 8),
                Text(
                  'Authenticate to view messages in ${widget.name}.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: context.muted),
                ),
                const SizedBox(height: 20),
                FilledButton.icon(
                  onPressed: unlocking ? null : _unlockChat,
                  icon: unlocking
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.fingerprint_rounded),
                  label: Text(unlocking ? 'Checking…' : 'Unlock chat'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return core_room.LiveChatRoomScreen(
      inbox: widget.inbox,
      name: widget.name,
    );
  }
}
