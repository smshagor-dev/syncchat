import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('community group search uses the searched profile avatar from web payload', () {
    final source = File(
      'lib/screens/live_community_group_search_screen.dart',
    ).readAsStringSync();

    expect(source, contains("imageUrl: item['avatar']?.toString()"));
    expect(source, contains('context.services.contacts.search(q)'));
  });

  test('starred messages consume canonical room title and avatar from backend', () {
    final source =
        File('lib/screens/live_starred_messages_screen.dart').readAsStringSync();

    expect(source, contains("message['room']"));
    expect(source, contains("_roomPayload(message)['title']"));
    expect(source, contains("_roomPayload(message)['avatar']"));
    expect(source, contains('imageUrl: _roomAvatar(message)'));
    expect(source, contains('context.services.chat.listStarred()'));
  });
}
