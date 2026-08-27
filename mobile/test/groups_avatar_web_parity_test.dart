import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('group list and group info use the real group avatar', () {
    final source = File('lib/screens/live_groups_screen.dart').readAsStringSync();

    expect(source, contains("imageUrl: group['avatar']?.toString()"));
    expect(source, contains("imageUrl: source['avatar']?.toString()"));
  });

  test('group people surfaces use backend profile avatars', () {
    final source = File('lib/screens/live_groups_screen.dart').readAsStringSync();
    final avatarUses = RegExp(
      RegExp.escape("imageUrl: person['avatar']?.toString()"),
    ).allMatches(source).length;

    // Create Group candidates, Add Members picker, participant rows and
    // pending join requests must all keep the real profile image.
    expect(avatarUses, greaterThanOrEqualTo(4));
    expect(source, contains('context.services.groups.participants(id)'));
    expect(source, contains('context.services.groups.pendingMembers(id)'));
    expect(source, contains('context.services.contacts.search(query)'));
  });
}
