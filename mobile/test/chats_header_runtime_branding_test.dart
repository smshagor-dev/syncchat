import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('production chats header consumes runtime brand logo and name', () {
    final source = File('lib/screens/live_p0_chats_screen.dart').readAsStringSync();

    expect(source, contains("import '../core/public_app_config.dart'"));
    expect(source, contains("import '../widgets/runtime_brand.dart'"));
    expect(source, contains('const RuntimeBrandLogo('));
    expect(source, contains('context.publicAppConfig.appName'));
    expect(
      source,
      isNot(contains("Image.asset(\n            'assets/syncchat_logo.png'")),
    );
  });

  test('web-equivalent chats overflow actions stay unchanged', () {
    final source = File('lib/screens/live_p0_chats_screen.dart').readAsStringSync();
    final items = [
      "value: 'new-group'",
      "value: 'starred'",
      "value: 'select-chats'",
      "value: 'mark-read'",
      "value: 'app-lock'",
      "value: 'logout'",
    ];

    var previous = -1;
    for (final item in items) {
      final index = source.indexOf(item);
      expect(index, greaterThan(previous), reason: 'Header action missing or moved: $item');
      previous = index;
    }

    expect(source, contains("case 'new-group':"));
    expect(source, contains('LiveCreateGroupScreen'));
    expect(source, contains("case 'starred':"));
    expect(source, contains('LiveStarredMessagesScreen'));
    expect(source, contains("case 'app-lock':"));
    expect(source, contains('LiveSettingsHubScreen'));
    expect(source, contains("case 'logout':"));
    expect(source, contains('await widget.onLogout(context)'));
  });
}
