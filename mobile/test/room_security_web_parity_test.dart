import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('secret chat settings match current web defaults and timer choices', () {
    final source =
        File('lib/screens/live_p1_room_security_screen.dart').readAsStringSync();

    expect(source, contains("'disappearSeconds': value ? (timer == 0 ? 30 : timer) : 0"));
    expect(source, contains("'screenshotAlerts': true"));
    expect(source, contains("DropdownMenuItem(value: 10, child: Text('10 sec'))"));
    expect(source, contains("DropdownMenuItem(value: 30, child: Text('30 sec'))"));
    expect(source, contains("DropdownMenuItem(value: 86400, child: Text('1 day'))"));
    expect(
      source,
      contains(
        'blocked forward, save, and export actions',
      ),
    );
  });

  test('secret chat security page does not expose a web-missing screenshot toggle', () {
    final source =
        File('lib/screens/live_p1_room_security_screen.dart').readAsStringSync();

    expect(source, isNot(contains("title: const Text('Screenshot alerts')")));
    expect(source, isNot(contains("_setPreference('secretScreenshotAlerts'")));
  });
}
