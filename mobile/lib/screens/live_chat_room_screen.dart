import 'package:flutter/material.dart';

import '../core/app_scope.dart';
import '../theme.dart';
import 'live_chat_room_core_screen.dart' as core_room;
import 'live_entity_profile_screen.dart';
import 'live_room_context_tools.dart';

/// Production chat entry point.
///
/// The full realtime/message runtime remains in [core_room.LiveChatRoomScreen].
/// This wrapper adds the web-parity contextual navigation layer so every room
/// can reach Friend / Group / Channel info and rich room tools directly from
/// the active conversation instead of forcing users through global hubs.
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

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _resolveUser());
  }

  Future<void> _resolveUser() async {
    if (resolvingUser || currentUserId.isNotEmpty) return;
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
                  icon: const Icon(Icons.add_circle_outline_rounded, color: SyncColors.sky),
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
                      : const Icon(Icons.info_outline_rounded, color: SyncColors.sky),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
