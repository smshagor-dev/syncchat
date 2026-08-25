import 'package:flutter_test/flutter_test.dart';
import 'package:syncchat_mobile/parity_catalog.dart';

void main() {
  test('web parity catalog keeps broad product coverage', () {
    expect(parityCatalog.length, greaterThanOrEqualTo(100));

    final groups = parityCatalog.map((surface) => surface.group).toSet();
    expect(
      groups,
      containsAll(<String>[
        'Routes',
        'Foreground',
        'Pages',
        'Room',
        'Chat tools',
        'Settings',
        'Status',
        'Calls',
        'Modals',
      ]),
    );
  });

  test('important mobile parity surfaces are registered', () {
    final names = parityCatalog.map((surface) => surface.name).toSet();

    expect(
      names,
      containsAll(<String>[
        'Chats',
        'Calls',
        'Contacts',
        'Communities',
        'Channels',
        'Status',
        'Profile',
        'Settings',
        'Friend profile',
        'Group profile',
        'Channel profile',
        'Composer',
        'Room appearance',
        'Message requests',
        'Security / E2EE',
        'Outbox / retry',
        'Group call / LiveKit',
        'Attach menu',
        'QR profile / device',
      ]),
    );
  });

  test('catalog entries have source references', () {
    for (final surface in parityCatalog) {
      expect(surface.group.trim(), isNotEmpty);
      expect(surface.name.trim(), isNotEmpty);
      expect(surface.webSource.trim(), isNotEmpty);
      expect(<String>{'page', 'sheet'}, contains(surface.kind));
    }
  });
}
