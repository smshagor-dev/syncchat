import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('archive and lists use rich web inbox collection contracts', () {
    final entry = File('lib/screens/live_collection_screens.dart').readAsStringSync();
    final source = File('lib/screens/live_collection_web_parity_screens.dart').readAsStringSync();

    expect(entry, contains("export 'live_collection_web_parity_screens.dart'"));
    for (final contract in [
      'enum LiveInboxCollectionKind { archive, lists }',
      "_contains(inbox['archivedBy'], userId)",
      "_contains(inbox['listedBy'], userId)",
      'if (archived || !listed) return false',
      "('unread', 'Unread (",
      "('favourite', 'Favourite (",
      "('group', 'Group (",
      'labelsByRoom',
      "imageUrl: _avatar(inbox)",
      "online: inbox['roomType']?.toString() == 'private'",
      "'archive': ('archive'",
      "'mute': ('mute'",
      "'pin': ('pin'",
      "'unread': ('markUnread'",
      "'favourite': ('favourite'",
      "'list': ('list'",
      'verifyChatLock',
      'LiveChatRoomScreen',
      "realtime?.on('inbox/preferences'",
    ]) {
      expect(source, contains(contract));
    }
  });

  test('media matches web Media Links Docs grouping and secret save policy', () {
    final source = File('lib/screens/live_collection_web_parity_screens.dart').readAsStringSync();

    for (final contract in [
      "this.initialTab = 'media'",
      "_tab('media', 'Media')",
      "_tab('link', 'Links')",
      "_tab('file', 'Docs')",
      "kind == 'photo' || kind == 'video'",
      'context.services.chat.listMedia(roomId:',
      "inbox['secretChatEnabled'] == true",
      "inbox['secretSaveBlocked'] != false",
      'Saving is disabled for this secret chat.',
      '_monthLabel(_itemTime(item))',
      'GridView.builder(',
      '_openPhoto(url)',
      "_openWeb('Video', url)",
      "_openWeb('Link', raw)",
      'getApplicationDocumentsDirectory()',
      'resolveMediaUrl',
    ]) {
      expect(source, contains(contract));
    }
    expect(source, isNot(contains("_tab('audio'")));
  });

  test('pre-audit collection and media implementation remains available', () {
    expect(File('lib/screens/live_collection_core_screens.dart').existsSync(), isTrue);
  });
}
