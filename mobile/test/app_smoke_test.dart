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

  test('production full-page drawer follows the web sidebar order', () {
    final source = File('lib/screens/live_mobile_shell.dart').readAsStringSync();

    final drawerItems = [
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
    ];

    var previous = -1;
    for (final item in drawerItems) {
      final index = source.indexOf(item);
      expect(
        index,
        greaterThan(previous),
        reason: 'Drawer item missing or moved: $item',
      );
      previous = index;
    }

    expect(source, contains("section('More')"));
    expect(source, contains("section('Account')"));
    expect(source, contains("onTap: () => onSelected('logout')"));
    expect(source, contains("'feedback' => const LiveFeedbackScreen()"));
    expect(source, contains("import 'live_help_screens.dart'"));
    expect(source, contains('RuntimeBrandLogo('));
    expect(source, contains('context.publicAppConfig.appName'));
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
