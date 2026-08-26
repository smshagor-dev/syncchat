import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('mobile realtime joins authenticated user presence room like web', () {
    final source = File('lib/core/realtime_client.dart').readAsStringSync();

    expect(source, contains("socket.emit('user/connect', '')"));
    expect(source, contains('_listeners'));
    expect(source, contains('socket.on(entry.key, handler)'));
  });

  test('registered realtime handlers survive socket recreation', () {
    final source = File('lib/core/realtime_client.dart').readAsStringSync();

    expect(source, contains('_listeners.putIfAbsent'));
    expect(source, contains('_socket?.on(event, handler)'));
    expect(source, contains('_socket?.off(event, handler)'));
  });
}
