import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('synced phone contacts render web-equivalent avatars and chat action', () {
    final source =
        File('lib/screens/live_device_contacts_screen.dart').readAsStringSync();

    expect(source, contains("imageUrl: profile['avatar']?.toString()"));
    expect(source, contains("const Text('Chat now')"));
    expect(source, contains("context.services.contacts.add({'identity': identity})"));
    expect(source, contains('context.services.inbox.findByRoom(roomId)'));
    expect(source, contains('LiveChatRoomScreen(inbox: inbox, name: name)'));
  });

  test('unregistered phone contacts are rendered with a working invite fallback', () {
    final source =
        File('lib/screens/live_device_contacts_screen.dart').readAsStringSync();

    expect(source, contains('...unregistered.map((item)'));
    expect(source, contains("label: const Text('Invite')"));
    expect(source, contains('Clipboard.setData(ClipboardData(text: inviteText))'));
    expect(source, contains('https://syncchat.live'));
  });
}
