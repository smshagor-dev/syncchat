import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('contacts destination preserves current web contracts', () {
    final entry = File('lib/screens/live_p0_contacts_screen.dart').readAsStringSync();
    final source = File('lib/screens/live_p0_contacts_web_parity_screen.dart').readAsStringSync();

    expect(entry, contains("export 'live_p0_contacts_web_parity_screen.dart'"));
    for (final contract in [
      "context.services.api.get('/settings')",
      "'sortContactByName': !sortByName",
      'Sync Mobile Contacts',
      'DeviceIntegrationService.syncAddressBook',
      'Chat now',
      'LiveChatRoomScreen',
      'Create a new Group',
      'New Contact',
      "'/contacts/labels'",
      "'color': result.\$2",
      'imageUrl:',
    ]) {
      expect(source, contains(contract));
    }
  });

  test('profile destination uses actual avatar and web editable fields', () {
    final entry = File('lib/screens/live_full_profile_screen.dart').readAsStringSync();
    final source = File('lib/screens/live_full_profile_web_parity_screen.dart').readAsStringSync();

    expect(entry, contains("export 'live_full_profile_web_parity_screen.dart'"));
    expect(source, contains("imageUrl: profile['avatar']?.toString()"));
    expect(source, contains("field: 'username'"));
    expect(source, contains("field: 'fullname'"));
    expect(source, contains("field: 'bio'"));
    expect(source, contains("field: 'phone'"));
    expect(source, contains("field: 'email'"));
    expect(source, contains('editable: false'));
    expect(source, contains("if (field == 'email') return"));
    expect(source, contains("'socialAccounts': current"));
    expect(source, contains('QrImageView'));
    expect(source, contains('WebViewWidget'));
  });

  test('pre-audit implementations remain available as rollback references', () {
    expect(File('lib/screens/live_p0_contacts_core_screen.dart').existsSync(), isTrue);
    expect(File('lib/screens/live_full_profile_core_screen.dart').existsSync(), isTrue);
  });
}
