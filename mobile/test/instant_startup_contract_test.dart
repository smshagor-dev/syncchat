import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('mobile launch keeps network work outside the first-frame gate', () {
    final main = File('lib/main.dart').readAsStringSync();

    expect(main, contains('PublicAppConfig _runtimeConfig = PublicAppConfig.fallback;'));
    expect(main, contains('unawaited(_refreshPublicAppConfig());'));
    expect(main, contains('unawaited(_refreshAuthenticatedSession());'));
    expect(main, contains('unawaited(_startAuthenticatedIntegrations());'));

    expect(main, isNot(contains('late final Future<PublicAppConfig> _publicConfigFuture;')));
    expect(main, isNot(contains('child: FutureBuilder<PublicAppConfig>(')));
    expect(main, isNot(contains('home: !configReady')));
  });

  test('chat list remains cache-first before network reconciliation', () {
    final chats = File(
      'lib/screens/live_messenger_chats_screen.dart',
    ).readAsStringSync();

    expect(chats, contains('services.chatCache.readCurrentUser()'));
    expect(chats, contains('services.chatCache.readInboxes()'));
    expect(chats, contains('if (cachedInboxes.isNotEmpty) loading = false;'));
    expect(chats, contains('unawaited(_load());'));
    expect(chats, contains('unawaited(_loadSettings());'));
  });

  test('cached repositories persist account inbox and message state', () {
    final repositories = File('lib/core/cached_repositories.dart').readAsStringSync();
    final cache = File('lib/core/chat_cache.dart').readAsStringSync();

    expect(repositories, contains('await _cache.writeInboxes(rows)'));
    expect(repositories, contains('await _cache.writeCurrentUser(user)'));
    expect(repositories, contains('await _cache.writeRoomMessages(roomId, messages)'));
    expect(cache, contains('syncchat_cache_v1.db'));
    expect(cache, contains('GCMBlockCipher(AESEngine())'));
  });
}
