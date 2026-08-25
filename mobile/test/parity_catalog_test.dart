import 'package:flutter_test/flutter_test.dart';
import 'package:syncchat_mobile/parity_catalog.dart';
import 'package:syncchat_mobile/screens/parity_surface_screen.dart';

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

  test('every registered web surface has an exact mobile design route', () {
    final registered = parityCatalog.map((surface) => surface.name).toSet();

    expect(
      registered.difference(exactParityTitles),
      isEmpty,
      reason: 'A web surface was added without an exact Flutter mobile design.',
    );
    expect(
      exactParityTitles.difference(registered),
      isEmpty,
      reason: 'The exact-design router contains a stale surface name.',
    );
  });
}
