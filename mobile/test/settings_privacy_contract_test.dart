import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('mobile privacy selectors use the backend canonical contacts value', () {
    final source = File('lib/screens/live_settings_screen.dart').readAsStringSync();

    expect(source, contains("'my_contacts': 'My contacts'"));
    expect(source, contains("'groupsVisibility'"));
    expect(source, isNot(contains("'contacts': 'Contacts'")));
  });

  test('mobile notification settings expose every web notification control', () {
    final source = File('lib/screens/live_settings_screen.dart').readAsStringSync();

    for (final key in [
      'mute',
      'notifyMessages',
      'notifyGroups',
      'notifyStatus',
      'notifyCalls',
      'showNotificationPreviews',
      'showPushNotification',
      'showNotificationBanner',
      'showPopupNotification',
      'outgoingMessageSoundEnabled',
    ]) {
      expect(source, contains("'$key'"), reason: 'missing $key');
    }
  });
}
