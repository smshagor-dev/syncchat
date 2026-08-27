import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('resolved P0/P1 architecture keeps channel admin contracts', () {
    final source = File('lib/core/channel_repository.dart').readAsStringSync();

    expect(source, contains('Future<void> edit('));
    expect(source, contains('promoteAdmin('));
    expect(source, contains('demoteAdmin('));
    expect(source, contains('removeParticipant('));
    expect(source, contains('updatePermissions('));
    expect(source, contains('updateModeration('));
    expect(source, contains('approvePending('));
    expect(source, contains('rejectPending('));
  });

  test('chat entry keeps biometric locking separate from the core room', () {
    final source = File(
      'lib/screens/live_chat_room_screen.dart',
    ).readAsStringSync();

    expect(source, contains("live_chat_room_core_screen.dart"));
    expect(source, contains('chatLockBy'));
    expect(source, contains('BiometricService.authenticate'));
    expect(source, isNot(contains('showLiveRoomContextTools(')));
  });

  test('context tools cover the rich attachment actions from the old PR', () {
    final source = File(
      'lib/screens/live_room_context_tools.dart',
    ).readAsStringSync();

    for (final label in [
      'Location',
      'Contact',
      'Poll / Quiz',
      'Event',
      'Sticker',
    ]) {
      expect(
        source,
        contains(label),
        reason: '$label must remain reachable from an active room',
      );
    }
  });

  test('entity profile router reuses the active web-parity profile surfaces', () {
    final entityRouter = File(
      'lib/screens/live_entity_profile_screen.dart',
    ).readAsStringSync();
    final roomRouter = File(
      'lib/screens/live_room_profile_screen.dart',
    ).readAsStringSync();
    final profile = File(
      'lib/screens/live_channel_profile_web_parity_screen.dart',
    ).readAsStringSync();

    expect(entityRouter, contains("live_room_profile_screen.dart"));
    expect(entityRouter, contains('room_profile.LiveFriendProfileScreen'));
    expect(entityRouter, contains('room_profile.LiveChannelProfileScreen'));
    expect(entityRouter, contains('LiveGroupInfoScreen'));
    expect(entityRouter, isNot(contains('class LiveChannelProfileScreen')));

    expect(
      roomRouter,
      contains("live_room_profile_legacy_screen.dart' show LiveFriendProfileScreen"),
    );
    expect(
      roomRouter,
      contains("live_channel_profile_web_parity_screen.dart'"),
    );

    for (final contract in [
      "avatar: channel['avatar']?.toString()",
      "context.services.api.get('/channels/\$id/analytics')",
      "context.services.api.get('/channels/\$id/reviews')",
      '_changePrivacy',
      '_addParticipants',
      '_participantActions',
      '_openAdmin',
      "_setPreference('mute'",
      '30-day analytics',
      'Save review',
    ]) {
      expect(profile, contains(contract));
    }
  });
}
