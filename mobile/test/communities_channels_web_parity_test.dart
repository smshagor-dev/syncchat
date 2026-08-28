import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('communities destination uses the cleaner mobile-first surface', () {
    final entry = File('lib/screens/live_p1_communities_screen.dart').readAsStringSync();
    final source = File('lib/screens/live_p1_communities_core_screen.dart').readAsStringSync();

    expect(entry, contains("export 'live_p1_communities_core_screen.dart'"));
    for (final contract in [
      'Create community',
      'LiveCreateCommunityScreen',
      'LiveCreateCommunityGroupScreen',
      "context.services.communities.chats(id)",
      'View all',
      'Show less',
      'New group',
      'LiveChatRoomScreen',
      'unreadTotal',
      'previewChats',
    ]) {
      expect(source, contains(contract));
    }

    expect(source, isNot(contains("Text('Community actions'")));
    expect(source, isNot(contains("child: Text(creating ? 'Close' : 'Create New')")));
  });

  test('channels preserves rich behavior behind the approved mobile surface', () {
    final entry = File('lib/screens/live_channels_screen.dart').readAsStringSync();
    final source = File('lib/screens/live_channels_web_parity_screen.dart').readAsStringSync();

    expect(entry, contains("import 'live_channels_web_parity_screen.dart' as parity"));
    expect(entry, contains('ProfessionalMobileSurface'));
    expect(entry, contains('child: parity.ChannelHubScreen()'));
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
      'realtime = context.services.realtime',
      "realtime?.on('channel/create'",
      "realtime?.on('channel/edit'",
      "realtime?.off('channel/create'",
      "realtime?.off('channel/edit'",
    ]) {
      expect(source, contains(contract));
    }
  });

  test('alternate community and channel screens remain rollback references', () {
    expect(File('lib/screens/live_p1_communities_web_parity_screen.dart').existsSync(), isTrue);
    expect(File('lib/screens/live_channels_core_screen.dart').existsSync(), isTrue);
  });
}
