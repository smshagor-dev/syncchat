import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('calls surface mirrors web history actions and statuses', () {
    final source = File('lib/screens/live_calls_screen.dart').readAsStringSync();

    for (final contract in [
      'All Calls',
      'Incoming, outgoing, rejected and missed',
      "tooltip: 'Audio call'",
      "tooltip: 'Video call'",
      "tooltip: 'Message'",
      "'Rejected'",
      "'Missed'",
      "'Outgoing'",
      "'Incoming'",
      'LiveChatRoomScreen',
      'SyncAvatar(',
      'online: online',
    ]) {
      expect(source, contains(contract));
    }
  });

  test('new-call flow uses contacts, search, multi-select and runtime policy', () {
    final source = File('lib/screens/live_calls_screen.dart').readAsStringSync();

    for (final contract in [
      'Start Call',
      'Select contacts for an admin-managed audio/video call',
      'Search by username, email, number',
      'context.services.contacts.list()',
      'runtimeConfig(refresh: true)',
      'maxGroupParticipants',
      'groupEnabled',
      "'group-call-",
      "'ownersId': [selfId, ...friendIds]",
      "label: const Text('Audio')",
      "label: const Text('Video')",
      'ensureCallPermissions',
    ]) {
      expect(source, contains(contract));
    }
  });

  test('previous calls implementation remains available as backup', () {
    final source = File('lib/screens/live_calls_core_screen.dart').readAsStringSync();

    expect(source, contains('class LiveCallsScreen'));
    expect(source, contains('context.services.calling.history()'));
    expect(source, contains('openOutgoingCall'));
  });
}
