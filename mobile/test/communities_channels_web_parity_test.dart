import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('communities destination preserves current web contracts', () {
    final entry = File('lib/screens/live_p1_communities_screen.dart').readAsStringSync();
    final source = File('lib/screens/live_p1_communities_web_parity_screen.dart').readAsStringSync();

    expect(entry, contains("export 'live_p1_communities_web_parity_screen.dart'"));
    for (final contract in [
      'Create New',
      "context.services.communities.chats(id)",
      'View all',
      'Show less',
      'New Group',
      "context.services.contacts.search(query)",
      'Search people by username, email, mobile',
      "'participantsId': users.map",
      "'identities': identities.toList",
      'LiveChatRoomScreen',
      "imageUrl: community['avatar']?.toString()",
      'avatarDataUri',
    ]) {
      expect(source, contains(contract));
    }
  });

  test('channels destination preserves joined discover and room navigation', () {
    final entry = File('lib/screens/live_channels_screen.dart').readAsStringSync();
    final source = File('lib/screens/live_channels_web_parity_screen.dart').readAsStringSync();

    expect(entry, contains("export 'live_channels_web_parity_screen.dart'"));
    for (final contract in [
      'Broadcast-style rooms with subscriber controls',
      "_sectionLabel('Joined')",
      "_sectionLabel('Discover')",
      'avatarDataUri: avatarDataUri',
      'Private channel password must be at least 4 characters',
      "context.services.channels.verifyPassword(",
      "context.services.channels.subscribe(",
      'LiveChatRoomScreen',
      'LiveEntityProfileScreen',
      "imageUrl: channel['avatar']?.toString()",
      "realtime.on('channel/create'",
      "realtime.on('channel/edit'",
    ]) {
      expect(source, contains(contract));
    }
  });

  test('pre-audit community and channel screens remain rollback references', () {
    expect(File('lib/screens/live_p1_communities_core_screen.dart').existsSync(), isTrue);
    expect(File('lib/screens/live_channels_core_screen.dart').existsSync(), isTrue);
  });
}
