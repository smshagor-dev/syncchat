import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('profile QR uses runtime brand and configured public origin', () {
    final source = File('lib/screens/live_full_profile_web_parity_screen.dart')
        .readAsStringSync();

    expect(source, contains("../core/public_app_config.dart"));
    expect(source, contains('context.services.config.publicOrigin'));
    expect(source, contains('context.publicAppConfig.appName'));
    expect(source, isNot(contains("'https://syncchat.live/chat'")));
    expect(source, isNot(contains('Chat with me on SyncChat')));
    expect(source, isNot(contains('your SyncChat profile chat directly')));
  });
}
