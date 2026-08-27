import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('status entry enforces admin policy and live updates', () {
    final source = File('lib/screens/live_p0_status_screen.dart').readAsStringSync();

    expect(source, contains("featureEnabled('status')"));
    expect(source, contains("_realtime?.on('status/new'"));
    expect(source, contains("_realtime?.on('status/update'"));
    expect(source, contains("_realtime?.off('status/new'"));
    expect(source, contains("_realtime?.off('status/update'"));
    expect(source, contains('Status is disabled'));
    expect(source, contains('This feature is currently turned off by the admin.'));
    expect(source, contains('core.LiveP0StatusScreen'));
  });

  test('existing status functionality remains preserved in core', () {
    final source =
        File('lib/screens/live_p0_status_core_screen.dart').readAsStringSync();

    for (final contract in [
      'Create status',
      'Post status',
      'markViewed',
      'statuses.react',
      'statuses.reply',
      'Status activity',
      'Delete status?',
    ]) {
      expect(source, contains(contract));
    }
  });
}
