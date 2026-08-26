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

  test('chat entry keeps the refactored contextual parity layer', () {
    final source = File('lib/screens/live_chat_room_screen.dart').readAsStringSync();

    expect(source, contains("live_chat_room_core_screen.dart"));
    expect(source, contains("live_entity_profile_screen.dart"));
    expect(source, contains("live_room_context_tools.dart"));
    expect(source, contains('LiveEntityProfileScreen('));
    expect(source, contains('showLiveRoomContextTools('));
  });

  test('context tools cover the rich attachment actions from the old PR', () {
    final source = File('lib/screens/live_room_context_tools.dart').readAsStringSync();

    for (final label in ['Location', 'Contact', 'Poll / Quiz', 'Event', 'Sticker']) {
      expect(source, contains(label), reason: '$label must remain reachable from an active room');
    }
  });

  test('live entity profiles keep friend and channel parity surfaces', () {
    final source = File('lib/screens/live_entity_profile_screen.dart').readAsStringSync();

    expect(source, contains('class LiveFriendProfileScreen'));
    expect(source, contains('class LiveChannelProfileScreen'));
    expect(source, contains('Analytics & reviews'));
    expect(source, contains('Admin controls'));
  });
}
