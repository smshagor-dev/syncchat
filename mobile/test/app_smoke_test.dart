import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:syncchat_mobile/core/app_services.dart';
import 'package:syncchat_mobile/core/session_store.dart';
import 'package:syncchat_mobile/main.dart';

void main() {
  testWidgets('SyncChat mobile app renders auth shell', (tester) async {
    final services = AppServices.create(sessionStore: MemorySessionStore());
    await tester.pumpWidget(SyncChatMobileApp(services: services));
    await tester.pumpAndSettle();

    expect(find.text('SyncChat'), findsOneWidget);
    expect(find.text('Sign in'), findsWidgets);

    services.dispose();
  });

  test('production live shell preserves the approved app drawer unchanged', () {
    final source = File('lib/screens/live_mobile_shell.dart').readAsStringSync();

    final drawerItems = [
      "('chats', 'Chats'",
      "('requests', 'Message requests'",
      "('chat-tools', 'Chat tools'",
      "('rich-attachments', 'Rich attachments'",
      "('room-security', 'Friend & room security'",
      "('calls', 'Calls'",
      "('status', 'Status'",
      "('contacts', 'Contacts'",
      "('device-contacts', 'People on SyncChat'",
      "('groups', 'Groups'",
      "('community-group', 'New community group'",
      "('room-admin', 'Group & channel admin'",
      "('communities', 'Communities'",
      "('channels', 'Channels'",
      "('archive', 'Archive'",
      "('lists', 'Lists'",
      "('starred', 'Starred messages'",
      "('media', 'Media'",
      "('profile', 'Profile'",
      "('edit-profile', 'Edit profile'",
      "('settings', 'Settings'",
    ];

    var previous = -1;
    for (final item in drawerItems) {
      final index = source.indexOf(item);
      expect(index, greaterThan(previous), reason: 'Drawer item missing or moved: $item');
      previous = index;
    }

    expect(source, contains("section('Library')"));
    expect(source, contains("section('Account')"));
    expect(source, contains("onTap: () => onSelected('logout')"));
    expect(source, isNot(contains("('feedback', 'Feedback'")));
    expect(source, isNot(contains("'feedback' => const LiveFeedbackScreen()")));
    expect(source, isNot(contains("import 'live_help_screens.dart'")));
    expect(source, isNot(contains('requestInitialPermissions()')));
  });

  test('approved five-item bottom dock remains unchanged', () {
    final source = File('lib/screens/live_mobile_shell.dart').readAsStringSync();
    final dockItems = [
      "(LiveHomeTab.chats, 'Chats'",
      "(LiveHomeTab.status, 'Status'",
      "(LiveHomeTab.communities, 'Communities'",
      "(LiveHomeTab.channels, 'Channels'",
      "(LiveHomeTab.calls, 'Calls'",
    ];
    var previous = -1;
    for (final item in dockItems) {
      final index = source.indexOf(item);
      expect(index, greaterThan(previous), reason: 'Dock item missing or moved: $item');
      previous = index;
    }
  });
}
