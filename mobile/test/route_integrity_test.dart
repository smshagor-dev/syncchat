import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('primary shell destinations point at approved production entries', () {
    final shell = File('lib/screens/live_mobile_shell.dart').readAsStringSync();

    for (final contract in [
      'LiveHomeTab.chats => LiveProfessionalChatsScreen(',
      'LiveHomeTab.status => const LiveP0StatusScreen()',
      'LiveHomeTab.communities => const LiveP1CommunitiesScreen()',
      'LiveHomeTab.calls => const LiveCallsScreen()',
      'LiveHomeTab.settings => LiveSettingsHubScreen(',
      "'contacts' => const LiveP0ContactsScreen()",
      "'channels' => const ChannelHubScreen()",
      "'archive' => const LiveInboxCollectionScreen(",
      'kind: LiveInboxCollectionKind.archive',
      "'lists' => const LiveInboxCollectionScreen(",
      'kind: LiveInboxCollectionKind.lists',
      "'media' => const LiveMediaScreen()",
      "'feedback' => const LiveFeedbackScreen()",
      "'profile' => const LiveFullProfileScreen()",
    ]) {
      expect(shell, contains(contract), reason: 'Missing active route: $contract');
    }

    for (final tab in [
      'LiveHomeTab.chats',
      'LiveHomeTab.status',
      'LiveHomeTab.communities',
      'LiveHomeTab.calls',
      'LiveHomeTab.settings',
    ]) {
      expect(shell, contains(tab));
    }
    expect(shell, isNot(contains('LiveHomeTab.channels')));
  });

  test('feature-rich parity behavior stays active through mobile presentation wrappers', () {
    final contacts = File('lib/screens/live_p0_contacts_screen.dart').readAsStringSync();
    final channels = File('lib/screens/live_channels_screen.dart').readAsStringSync();
    final collections = File('lib/screens/live_collection_screens.dart').readAsStringSync();
    final settings = File('lib/screens/live_settings_hub_screen.dart').readAsStringSync();
    final profile = File('lib/screens/live_full_profile_screen.dart').readAsStringSync();

    expect(contacts, contains("export 'live_p0_contacts_web_parity_screen.dart'"));
    expect(collections, contains("export 'live_collection_web_parity_screens.dart'"));

    for (final source in [channels, settings, profile]) {
      expect(source, contains('ProfessionalMobileSurface'));
      expect(source, contains('as parity'));
    }
    expect(channels, contains('child: parity.ChannelHubScreen()'));
    expect(settings, contains('child: parity.LiveSettingsHubScreen('));
    expect(profile, contains('child: parity.LiveFullProfileScreen()'));
  });

  test('communities uses the cleaner production-capable mobile presentation', () {
    final source = File('lib/screens/live_p1_communities_screen.dart').readAsStringSync();
    final implementation =
        File('lib/screens/live_p1_communities_core_screen.dart').readAsStringSync();

    expect(source, contains("export 'live_p1_communities_core_screen.dart'"));
    for (final contract in [
      'LiveCreateCommunityScreen',
      'LiveCreateCommunityGroupScreen',
      'context.services.communities.chats(id)',
      'LiveChatRoomScreen(',
      'Create community',
      'New group',
      'View all',
    ]) {
      expect(implementation, contains(contract));
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
    expect(status, contains('ProfessionalMobileSurface('));
    expect(status, contains('child: const WebParityStatusScreen()'));

    expect(room, contains("import 'live_chat_room_web_parity_screen.dart'"));
    expect(room, contains('ProfessionalMobileSurface('));
    expect(room, contains('child: WebParityChatRoomScreen('));

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
    expect(shell, contains("('channels', 'Channels', Icons.podcasts_rounded)"));

    for (final appOnlyRoute in [
      "'starred' => const LiveStarredMessagesScreen()",
      "'requests' => const LiveMessageRequestsScreen()",
      "'chat-tools' => const LiveChatToolsScreen()",
      "'room-admin' => const LiveRoomAdminHubScreen()",
    ]) {
      expect(shell, isNot(contains(appOnlyRoute)));
    }
  });

  test('alternate implementations remain available as rollback references', () {
    for (final path in [
      'lib/screens/live_chat_room_core_screen.dart',
      'lib/screens/live_calls_core_screen.dart',
      'lib/screens/live_p0_contacts_core_screen.dart',
      'lib/screens/live_p1_communities_web_parity_screen.dart',
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
