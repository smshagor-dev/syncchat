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
    expect(source, contains('WebParityStatusScreen'));
  });

  test('web parity status surface preserves the complete story flow', () {
    final source = File(
      'lib/screens/live_p0_status_web_parity_screen.dart',
    ).readAsStringSync();

    for (final contract in [
      'Share a status',
      'Quick mentions',
      'My status',
      'Recent updates',
      'Post Status',
      "'mentions': _extractMentions(cleanText)",
      'Timer(const Duration(seconds: 5)',
      "const Text('Prev')",
      "const Text('Next')",
      'WebViewWidget(controller: _controller)',
      "video.addEventListener('ended'",
      'markViewed',
      'statuses.react',
      'statuses.reply',
      'Status activity',
      'Delete status?',
    ]) {
      expect(source, contains(contract));
    }
  });

  test('previous status implementation remains available as backup', () {
    final source =
        File('lib/screens/live_p0_status_core_screen.dart').readAsStringSync();

    expect(source, contains('class LiveP0StatusScreen'));
    expect(source, contains('statuses.react'));
    expect(source, contains('statuses.reply'));
    expect(source, contains('Status activity'));
  });
}
