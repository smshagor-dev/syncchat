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

  test('production live shell keeps old drawer and covers every web sidebar item', () {
    final source = File('lib/screens/live_mobile_shell.dart').readAsStringSync();

    for (final sidebarItem in [
      "('chats', 'Chats'",
      "('calls', 'Calls'",
      "('status', 'Status'",
      "('contacts', 'Contacts'",
      "('communities', 'Communities'",
      "('channels', 'Channels'",
      "('archive', 'Archive'",
      "('lists', 'Lists'",
      "('media', 'Media'",
      "('feedback', 'Feedback'",
      "('settings', 'Settings'",
      "('profile', 'Profile'",
    ]) {
      expect(source, contains(sidebarItem), reason: 'Missing web sidebar item: $sidebarItem');
    }

    expect(source, contains("(LiveHomeTab.chats, 'Chats'"));
    expect(source, contains("(LiveHomeTab.status, 'Status'"));
    expect(source, contains("(LiveHomeTab.communities, 'Communities'"));
    expect(source, contains("(LiveHomeTab.channels, 'Channels'"));
    expect(source, contains("(LiveHomeTab.calls, 'Calls'"));

    expect(source, contains("'contacts' => const LiveP0ContactsScreen()"));
    expect(source, contains("'archive' => const LiveInboxCollectionScreen("));
    expect(source, contains("kind: LiveInboxCollectionKind.archive"));
    expect(source, contains("'lists' => const LiveInboxCollectionScreen("));
    expect(source, contains("kind: LiveInboxCollectionKind.lists"));
    expect(source, contains("'media' => const LiveMediaScreen()"));
    expect(source, contains("'feedback' => const LiveFeedbackScreen()"));
    expect(source, contains("'settings' => LiveSettingsHubScreen("));
    expect(source, contains("'profile' || 'edit-profile' => const LiveFullProfileScreen()"));

    expect(source, contains("('starred', 'Starred messages'"));
    expect(source, contains("('edit-profile', 'Edit profile'"));
    expect(source, contains("section('Library')"));
    expect(source, contains("section('Account')"));
    expect(source, contains("onTap: () => onSelected('logout')"));
    expect(source, isNot(contains('requestInitialPermissions()')));
  });
}
