import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('settings hub routes to web-parity surface', () {
    final entry = File('lib/screens/live_settings_hub_screen.dart').readAsStringSync();
    expect(entry, contains("export 'live_settings_hub_web_parity_screen.dart'"));
    expect(File('lib/screens/live_settings_hub_core_screen.dart').existsSync(), isTrue);
  });

  test('settings hub preserves current web top-level structure and actions', () {
    final source = File('lib/screens/live_settings_hub_web_parity_screen.dart').readAsStringSync();

    final orderedContracts = [
      "title: 'Dark mode'",
      "_section('Account'",
      "'Account settings'",
      "'Devices'",
      "_section('Privacy'",
      "_section('Chat'",
      "_section('Notification'",
      "_section('Voice & Video'",
      "_section('Apps setting'",
      "'Google 2FA'",
      "'App lock'",
      "_section('Help'",
      "'Keyboard shortcuts'",
      "'Media'",
      "'Feedback'",
      "'Terms & privacy policy'",
      "'License'",
      "'Log out'",
    ];

    var previous = -1;
    for (final contract in orderedContracts) {
      final index = source.indexOf(contract);
      expect(index, greaterThan(previous), reason: 'Missing or out-of-order: $contract');
      previous = index;
    }

    for (final contract in [
      'context.services.settings.get()',
      "context.services.settings.update({'dark': value})",
      'context.services.settings.disableTwoFactor(',
      'context.services.settings.setAppLock(password)',
      'context.services.settings.removeAppLock(password)',
      "'/settings/app-lock/password'",
      "LiveBackupRecoveryScreen(initialSection: 'recovery')",
      'LiveDeviceSessionsScreen()',
      'LiveMediaScreen()',
      'LiveFeedbackScreen()',
      'LivePolicyScreen()',
      'LiveLicenseScreen()',
      'Open keyboard shortcuts',
      'Ctrl/Cmd + Shift + J',
      'Ctrl/Cmd + Shift + U',
    ]) {
      expect(source, contains(contract));
    }
  });

  test('settings hub excludes app-only top-level extras from web menu', () {
    final source = File('lib/screens/live_settings_hub_web_parity_screen.dart').readAsStringSync();
    for (final extra in [
      "'Full profile'",
      "'Link a device'",
      "'Backup & restore'",
      "'Google Drive backup'",
      "'Profile QR & links'",
      "'Social profiles'",
      "'App permissions'",
      "'Starred messages'",
      "'Large file upload'",
      "'System notification permission'",
      "'Biometric protection'",
      "'Analytics & reviews'",
    ]) {
      expect(source, isNot(contains(extra)), reason: 'App-only top-level entry leaked into parity hub: $extra');
    }
  });
}
