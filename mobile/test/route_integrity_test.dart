import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('primary shell destinations point at audited production entries', () {
    final shell = File('lib/screens/live_mobile_shell.dart').readAsStringSync();

    for (final contract in [
      'LiveHomeTab.chats => LiveProfessionalChatsScreen(',
      'LiveHomeTab.status => const LiveP0StatusScreen()',
      'LiveHomeTab.communities => const LiveP1CommunitiesScreen()',
      'LiveHomeTab.channels => const ChannelHubScreen()',
      'LiveHomeTab.calls => const LiveCallsScreen()',
      "'contacts' => const LiveP0ContactsScreen()",
      "'archive' => const LiveInboxCollectionScreen(",
      'kind: LiveInboxCollectionKind.archive',
      "'lists' => const LiveInboxCollectionScreen(",
      'kind: LiveInboxCollectionKind.lists',
      "'media' => const LiveMediaScreen()",
      "'feedback' => const LiveFeedbackScreen()",
      "'settings' => LiveSettingsHubScreen(",
      "'profile' => const LiveFullProfileScreen()",
    ]) {
      expect(shell, contains(contract), reason: 'Missing active route: $contract');
    }
  });

  test('audited entry files stay wired to their web-parity implementations', () {
    final expectedExports = <String, String>{
      'lib/screens/live_p0_contacts_screen.dart':
          "export 'live_p0_contacts_web_parity_screen.dart'",
      'lib/screens/live_p1_communities_screen.dart':
          "export 'live_p1_communities_web_parity_screen.dart'",
      'lib/screens/live_channels_screen.dart':
          "export 'live_channels_web_parity_screen.dart'",
      'lib/screens/live_collection_screens.dart':
          "export 'live_collection_web_parity_screens.dart'",
      'lib/screens/live_settings_hub_screen.dart':
          "export 'live_settings_hub_web_parity_screen.dart'",
      'lib/screens/live_full_profile_screen.dart':
          "export 'live_full_profile_web_parity_screen.dart'",
    };

    for (final entry in expectedExports.entries) {
      final source = File(entry.key).readAsStringSync();
      expect(source, contains(entry.value), reason: 'Parity entry drifted: ${entry.key}');
      expect(
        source,
        isNot(contains('_core_screen.dart')),
        reason: 'Rollback/core implementation became active: ${entry.key}',
      );
    }
  });

  test('status room calls and professional chat list use audited active surfaces', () {
    final status = File('lib/screens/live_p0_status_screen.dart').readAsStringSync();
    final room = File('lib/screens/live_chat_room_screen.dart').readAsStringSync();
    final calls = File('lib/screens/live_calls_screen.dart').readAsStringSync();
    final chats = File('lib/screens/live_messenger_chats_screen.dart').readAsStringSync();
    final presentation =
        File('lib/screens/live_professional_chats_screen.dart').readAsStringSync();

    expect(status, contains("import 'live_p0_status_web_parity_screen.dart'"));
    expect(status, contains('child: const WebParityStatusScreen()'));

    expect(room, contains("import 'live_chat_room_web_parity_screen.dart'"));
    expect(room, contains('return WebParityChatRoomScreen('));

    expect(calls, contains('context.services.calling.history()'));
    expect(calls, contains("import 'live_call_screen.dart'"));
    expect(calls, contains('openOutgoingCall('));
    expect(calls, isNot(contains("import 'live_calls_core_screen.dart'")));

    for (final contract in [
      'Search chats',
      "realtime.on('inbox/find'",
      "realtime.on('inbox/preferences'",
      'LiveChatRoomScreen(',
      'FloatingActionButton(',
      'onLongPress:',
    ]) {
      expect(chats, contains(contract));
    }

    for (final contract in [
      'LiveMessengerChatsScreen(',
      '_MessengerScrollBehavior',
      'inputDecorationTheme:',
      'chipTheme:',
      'floatingActionButtonTheme:',
    ]) {
      expect(presentation, contains(contract));
    }

    // The active mobile list must not regress to the old dashboard/web flow.
    expect(chats, isNot(contains('_buildStatusRail')));
    expect(chats, isNot(contains('_buildLabels')));
    expect(chats, isNot(contains('contactLabelsByRoom')));
  });

  test('contextual chat features stay implemented without cluttering navigation', () {
    final shell = File('lib/screens/live_mobile_shell.dart').readAsStringSync();
    final chats = File('lib/screens/live_messenger_chats_screen.dart').readAsStringSync();

    expect(chats, contains("value: 'starred'"));
    expect(chats, contains('LiveStarredMessagesScreen'));
    expect(chats, contains("value: 'new-group'"));
    expect(chats, contains('LiveCreateGroupScreen'));

    for (final appOnlyRoute in [
      "'starred' => const LiveStarredMessagesScreen()",
      "'requests' => const LiveMessageRequestsScreen()",
      "'chat-tools' => const LiveChatToolsScreen()",
      "'room-admin' => const LiveRoomAdminHubScreen()",
    ]) {
      expect(shell, isNot(contains(appOnlyRoute)));
    }
  });

  test('rollback references remain present without being routed directly', () {
    for (final path in [
      'lib/screens/live_chat_room_core_screen.dart',
      'lib/screens/live_calls_core_screen.dart',
      'lib/screens/live_p0_contacts_core_screen.dart',
      'lib/screens/live_p1_communities_core_screen.dart',
      'lib/screens/live_channels_core_screen.dart',
      'lib/screens/live_collection_core_screens.dart',
      'lib/screens/live_settings_hub_core_screen.dart',
      'lib/screens/live_full_profile_core_screen.dart',
      'lib/screens/live_full_profile_web_parity_core_screen.dart',
    ]) {
      expect(File(path).existsSync(), isTrue, reason: 'Missing rollback reference: $path');
    }
  });
}