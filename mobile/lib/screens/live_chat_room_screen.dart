import 'dart:async';

import 'package:flutter/material.dart';

import '../core/app_scope.dart';
import '../core/biometric_service.dart';
import '../core/screen_security_service.dart';
import '../theme.dart';
import 'live_chat_room_core_screen.dart' as core_room;
import 'live_entity_profile_screen.dart';
import 'live_room_context_tools.dart';

/// Production chat entry point.
///
/// The full realtime/message runtime remains in [core_room.LiveChatRoomScreen].
/// This wrapper adds contextual navigation, biometric chat unlock, and native
/// screen-capture protection around the active conversation.
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
  String currentUserId = '';
  bool resolvingUser = false;
  bool unlocking = true;
  bool unlocked = false;

  @override
  void initState() {
    super.initState();
    unawaited(ScreenSecurityService.pushSecure());
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_unlockChat());
    });
  }

  @override
  void dispose() {
    unawaited(ScreenSecurityService.popSecure());
    super.dispose();
  }

  Future<void> _unlockChat() async {
    if (!mounted || (unlocking && unlocked)) return;
    setState(() => unlocking = true);
    final success = await BiometricService.authenticate(
      reason: 'Unlock ${widget.name} chat',
    );
    if (!mounted) return;
    setState(() {
      unlocking = false;
      unlocked = success;
    });
    if (success) unawaited(_resolveUser());
  }

  Future<void> _resolveUser() async {
    if (resolvingUser || currentUserId.isNotEmpty || !unlocked) return;
    setState(() => resolvingUser = true);
    try {
      final user = await context.services.chat.currentUser();
      if (!mounted) return;
      setState(() {
        currentUserId = user['_id']?.toString() ?? '';
        resolvingUser = false;
      });
    } on Object {
      if (mounted) setState(() => resolvingUser = false);
    }
  }

  Future<void> _openInfo() async {
    if (currentUserId.isEmpty) await _resolveUser();
    if (!mounted) return;
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => LiveEntityProfileScreen(
          inbox: widget.inbox,
          currentUserId: currentUserId,
        ),
      ),
    );
  }

  Future<void> _openTools() async {
    await showLiveRoomContextTools(
      context,
      inbox: widget.inbox,
      roomName: widget.name,
      currentUserId: currentUserId,
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!unlocked) {
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

    return Stack(
      children: [
        Positioned.fill(
          child: core_room.LiveChatRoomScreen(
            inbox: widget.inbox,
            name: widget.name,
          ),
        ),
        Positioned(
          top: MediaQuery.paddingOf(context).top + 64,
          right: 8,
          child: Material(
            color: context.panel.withValues(alpha: .96),
            elevation: 5,
            borderRadius: BorderRadius.circular(22),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                IconButton(
                  tooltip: 'Room tools',
                  onPressed: _openTools,
                  icon: const Icon(
                    Icons.add_circle_outline_rounded,
                    color: SyncColors.sky,
                  ),
                ),
                Container(width: 1, height: 24, color: context.border),
                IconButton(
                  tooltip: widget.inbox['roomType']?.toString() == 'private'
                      ? 'Contact info'
                      : widget.inbox['channel'] is Map
                          ? 'Channel info'
                          : 'Group info',
                  onPressed: resolvingUser ? null : _openInfo,
                  icon: resolvingUser
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(
                          Icons.info_outline_rounded,
                          color: SyncColors.sky,
                        ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
