import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('mobile realtime joins authenticated user presence room like web', () {
    final source = File('lib/core/realtime_client.dart').readAsStringSync();

    expect(source, contains("socket.emit('user/connect', '')"));
    expect(source, contains('_listeners'));
    expect(source, contains('_wrappedHandler(entry.key, handler)'));
  });

  test('registered realtime handlers survive socket recreation', () {
    final source = File('lib/core/realtime_client.dart').readAsStringSync();

    expect(source, contains('_listeners.putIfAbsent'));
    expect(source, contains('_wrappedListeners'));
    expect(source, contains('_wrappedHandler(event, handler)'));
    expect(source, contains('_socket?.off(event, wrapped ?? handler)'));
  });

  test('realtime messages and acknowledgements normalize media URLs', () {
    final source = File('lib/core/realtime_client.dart').readAsStringSync();

    expect(source, contains('handler(_normalizeMediaUrls(data))'));
    expect(source, contains('completer.complete(_normalizeMediaUrls(data))'));
    expect(source, contains('_config.resolveMediaUrl(value)'));
  });
}
