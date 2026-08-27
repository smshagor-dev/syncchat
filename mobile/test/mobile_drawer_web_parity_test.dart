import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('full-page drawer mirrors the current Web sidebar information architecture', () {
    final source = File('lib/screens/live_mobile_shell.dart').readAsStringSync();

    for (final label in [
      'Chats',
      'Calls',
      'Status',
      'Contacts',
      'Communities',
      'Channels',
      'Archive',
      'Lists',
      'Media',
      'Feedback',
      'Settings',
      'Profile',
      'Log out',
    ]) {
      expect(source, contains("'$label'"), reason: '$label must stay visible');
    }

    for (final appOnlyLabel in [
      'Message requests',
      'Chat tools',
      'Rich attachments',
      'Friend & room security',
      'People on SyncChat',
      'Groups',
      'New community group',
      'Group & channel admin',
      'Starred messages',
      'Edit profile',
    ]) {
      expect(
        source,
        isNot(contains("'$appOnlyLabel'")),
        reason: '$appOnlyLabel is not a Web sidebar entry',
      );
    }
  });

  test('drawer remains full-page and consumes runtime branding', () {
    final source = File('lib/screens/live_mobile_shell.dart').readAsStringSync();

    expect(source, contains('width: MediaQuery.sizeOf(context).width'));
    expect(source, contains('RuntimeBrandLogo('));
    expect(source, contains('context.publicAppConfig.appName'));
    expect(source, contains("'feedback' => const LiveFeedbackScreen()"));
  });

  test('approved five-item mobile bottom dock remains unchanged', () {
    final source = File('lib/screens/live_mobile_shell.dart').readAsStringSync();

    final expected = [
      "(LiveHomeTab.chats, 'Chats'",
      "(LiveHomeTab.status, 'Status'",
      "(LiveHomeTab.communities, 'Communities'",
      "(LiveHomeTab.channels, 'Channels'",
      "(LiveHomeTab.calls, 'Calls'",
    ];

    for (final contract in expected) {
      expect(source, contains(contract));
    }
  });
}
