import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('channel profile keeps the complete web parity contract', () {
    final router = File(
      'lib/screens/live_room_profile_screen.dart',
    ).readAsStringSync();
    final source = File(
      'lib/screens/live_channel_profile_web_parity_screen.dart',
    ).readAsStringSync();

    expect(
      router,
      contains("live_room_profile_legacy_screen.dart' show LiveFriendProfileScreen"),
    );
    expect(
      router,
      contains("show LiveChannelProfileScreen"),
    );
    expect(
      File('lib/screens/live_room_profile_legacy_screen.dart').existsSync(),
      isTrue,
    );

    // Assert stable backend/action contracts rather than formatter-dependent
    // call layout. Flutter format can legitimately place the method and route
    // on separate lines without changing behavior.
    for (final contract in [
      "'/avatars'",
      "'isChannel': true",
      "'/chats/media'",
      "'/channels/\$id/analytics'",
      "'/channels/\$id/reviews'",
      "'notificationTone'",
      "'favourite'",
      "'list'",
      "'advancedPrivacy'",
      'channelInviteUrl(',
      "'/reports/chat'",
      'updatePassword(',
      '_addParticipants',
      '_participantActions',
      'Permissions & moderation',
      "imageUrl: profile['avatar']?.toString()",
      'Media, links and files',
      '30-day analytics',
      'Save review',
      'Report channel',
      'Leave channel',
    ]) {
      expect(
        source,
        contains(contract),
        reason: 'Missing channel contract: $contract',
      );
    }
  });

  test('public origin builds the same web invite route without hard-coding it', () {
    final config = File('lib/core/app_config.dart').readAsStringSync();

    expect(config, contains("'SYNCCHAT_PUBLIC_ORIGIN'"));
    expect(config, contains('String channelInviteUrl(String? value)'));
    expect(config, contains("final marker = '/channel/+';"));
    expect(config, contains("path: '/chat'"));
    expect(config, contains("queryParameters: {'c': token}"));
    expect(config, isNot(contains('https://syncchat.live/chat?c=')));
  });
}
