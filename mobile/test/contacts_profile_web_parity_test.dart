import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('contacts destination uses phone-first messenger contracts', () {
    final entry = File('lib/screens/live_p0_contacts_screen.dart').readAsStringSync();
    final source = File('lib/screens/live_device_contacts_screen.dart').readAsStringSync();

    expect(entry, contains("import 'live_device_contacts_screen.dart'"));
    expect(entry, contains('const LiveDeviceContactsScreen()'));
    for (final contract in [
      'DeviceIntegrationService.syncAddressBook(',
      '_loadSavedRegistered()',
      '_mergeRegistered(',
      "'On SyncChat · \${registered.length}'",
      "'Not on SyncChat · \${unregistered.length}'",
      "const Text('Chat now')",
      "label: const Text('Invite')",
      'context.services.contacts.add',
      'context.services.contacts.list()',
      'context.services.inbox.findByRoom(roomId)',
      'LiveChatRoomScreen(',
      "'Username, email, or phone number'",
      "'Also save to phone book'",
    ]) {
      expect(source, contains(contract));
    }
  });

  test('profile destination uses actual avatar and web editable fields', () {
    final entry = File('lib/screens/live_full_profile_screen.dart').readAsStringSync();
    final source = File('lib/screens/live_full_profile_web_parity_screen.dart').readAsStringSync();

    expect(entry, contains("import 'live_full_profile_web_parity_screen.dart' as parity"));
    expect(entry, contains('ProfessionalMobileSurface'));
    expect(entry, contains('child: parity.LiveFullProfileScreen()'));
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

  test('profile editing follows web inline pencil and check interaction', () {
    final source = File('lib/screens/live_full_profile_web_parity_screen.dart').readAsStringSync();
    for (final contract in [
      "editingKey == 'header:fullname'",
      "key: 'header:fullname'",
      "final key = 'field:\${field.field}'",
      'Icons.edit_outlined',
      'Icons.check_rounded',
      'TextField(',
      'FilteringTextInputFormatter.digitsOnly',
      "RegExp(r'^[a-z0-9_-]{3,24}\$')",
      'Username is invalid',
      'context.services.profile.update({field: value})',
    ]) {
      expect(source, contains(contract));
    }
  });

  test('profile social editor and qr share surface follow web contracts', () {
    final source = File('lib/screens/live_full_profile_web_parity_screen.dart').readAsStringSync();
    for (final contract in [
      'socialEditorOpen',
      'DropdownButtonFormField<String>',
      'socialOptions.entries',
      "'facebook': 'Facebook'",
      "'instagram': 'Instragram'",
      "'linkedin': 'Linkdln'",
      "'youtube': 'Youtube'",
      "value.replaceFirst(",
      "RegExp(r'^(https?)//'",
      'context.services.config.publicOrigin',
      'context.publicAppConfig.appName',
      'QrImageView(data: url, size: 220)',
      'Scan this QR to open your \$appName profile chat directly.',
      'https://wa.me/?text=',
      'https://t.me/share/url?url=',
      'https://www.facebook.com/sharer/sharer.php?u=',
      'https://twitter.com/intent/tweet?url=',
      "ClipboardData(text: url)",
    ]) {
      expect(source, contains(contract));
    }
    expect(source, isNot(contains("'https://syncchat.live/chat'")));
    expect(source, isNot(contains('Chat with me on SyncChat')));
  });

  test('pre-audit implementations remain available as rollback references', () {
    expect(File('lib/screens/live_p0_contacts_core_screen.dart').existsSync(), isTrue);
    expect(File('lib/screens/live_full_profile_core_screen.dart').existsSync(), isTrue);
    expect(File('lib/screens/live_full_profile_web_parity_core_screen.dart').existsSync(), isTrue);
  });
}
