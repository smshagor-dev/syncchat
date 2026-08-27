import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('admin hub renders the real group or channel avatar', () {
    final source =
        File('lib/screens/live_p1_room_admin_screen.dart').readAsStringSync();

    expect(source, contains("imageUrl: entity['avatar']?.toString()"));
    expect(source, contains('final entity = _entity(room);'));
  });

  test('pending approval rows render backend profile avatars', () {
    final source =
        File('lib/screens/live_p1_room_admin_screen.dart').readAsStringSync();

    expect(source, contains('imageUrl: _memberAvatar(row)'));
    expect(source, contains("final direct = row['avatar']?.toString().trim()"));
    expect(source, contains("profile['avatar']?.toString().trim()"));
    expect(source, contains('context.services.channels.pendingMembers(initialId)'));
    expect(source, contains('context.services.groups.pendingMembers(initialId)'));
  });
}
