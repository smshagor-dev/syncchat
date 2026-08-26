import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('offline media outbox keeps durable staged files and replays uploads', () {
    final source = File('lib/core/cached_repositories.dart').readAsStringSync();

    expect(source, contains("'kind': 'attachment'"));
    expect(source, contains('syncchat_outbox'));
    expect(source, contains('getApplicationDocumentsDirectory'));
    expect(source, contains('super.uploadAttachment'));
    expect(source, contains('super.sendAttachment'));
    expect(source, contains('clientMessageId: clientMessageId'));
    expect(source, contains('_deleteStagedFile'));
  });
}
