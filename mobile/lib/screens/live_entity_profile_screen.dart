import 'package:flutter/material.dart';

import 'live_groups_screen.dart';
import 'live_room_profile_screen.dart' as room_profile;

/// Compatibility router for room/entity profile entry points outside the chat
/// room. The active profile UI lives in live_room_profile_screen.dart, so
/// Channels/Contacts opened from hubs and the chat-room header cannot drift
/// into separate implementations.
class LiveEntityProfileScreen extends StatelessWidget {
  const LiveEntityProfileScreen({
    super.key,
    required this.inbox,
    required this.currentUserId,
  });

  final Map<String, dynamic> inbox;
  final String currentUserId;

  @override
  Widget build(BuildContext context) {
    if (inbox['roomType']?.toString() == 'private') {
      return room_profile.LiveFriendProfileScreen(
        inbox: inbox,
        name: _privateName(inbox, currentUserId),
      );
    }

    if (inbox['channel'] is Map) {
      return room_profile.LiveChannelProfileScreen(
        inbox: inbox,
        name: _channelName(inbox),
      );
    }

    return LiveGroupInfoScreen(inbox: inbox);
  }
}

String _channelName(Map<String, dynamic> inbox) {
  final channel = inbox['channel'];
  if (channel is Map) {
    final value = channel['name']?.toString().trim() ?? '';
    if (value.isNotEmpty) return value;
  }
  return 'Channel';
}

String _privateName(Map<String, dynamic> inbox, String currentUserId) {
  final owners = inbox['owners'];
  if (owners is List) {
    for (final raw in owners.whereType<Map>()) {
      final userId = raw['userId']?.toString() ?? raw['_id']?.toString() ?? '';
      if (userId.isNotEmpty && userId == currentUserId) continue;
      final fullname = raw['fullname']?.toString().trim() ?? '';
      if (fullname.isNotEmpty) return fullname;
      final username = raw['username']?.toString().trim() ?? '';
      if (username.isNotEmpty) return username;
    }
  }

  final profile = inbox['profile'];
  if (profile is Map) {
    final fullname = profile['fullname']?.toString().trim() ?? '';
    if (fullname.isNotEmpty) return fullname;
    final username = profile['username']?.toString().trim() ?? '';
    if (username.isNotEmpty) return username;
  }

  return 'Contact';
}
