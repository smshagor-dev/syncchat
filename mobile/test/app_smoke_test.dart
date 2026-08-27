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

  test('production live shell owns the five primary tabs and web sidebar collections', () {
    final source = File('lib/screens/live_mobile_shell.dart').readAsStringSync();

    expect(source, contains("(LiveHomeTab.chats, 'Chats'"));
    expect(source, contains("(LiveHomeTab.status, 'Status'"));
    expect(source, contains("(LiveHomeTab.communities, 'Communities'"));
    expect(source, contains("(LiveHomeTab.channels, 'Channels'"));
    expect(source, contains("(LiveHomeTab.calls, 'Calls'"));

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
      expect(source, contains(sidebarItem));
    }

    expect(source, isNot(contains('requestInitialPermissions()')));
  });
}
