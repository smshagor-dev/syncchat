import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('verification gate uses runtime brand logo and app name', () {
    final source = File(
      'lib/widgets/authenticated_account_gate.dart',
    ).readAsStringSync();

    expect(source, contains("import '../core/public_app_config.dart'"));
    expect(source, contains("import 'runtime_brand.dart'"));
    expect(source, contains('RuntimeBrandLogo(size: 72, borderRadius: 18)'));
    expect(source, contains('final appName = context.publicAppConfig.appName'));
    expect(source, contains("'Welcome to \$appName'"));
    expect(source, isNot(contains("'assets/syncchat_logo.png'")));
  });

  test('inactive and unavailable account copy follows runtime brand name', () {
    final source = File(
      'lib/widgets/authenticated_account_gate.dart',
    ).readAsStringSync();

    for (final contract in [
      "'Unable to load this \$appName account.'",
      "'This \$appName account is blocked.'",
      "'This \$appName account is banned.'",
      "'This \$appName account is no longer available.'",
      "'This \$appName account is inactive.'",
      "'\$appName is active in another session. Tap \"Use Here\" to use \$appName on this device.'",
      "primaryLabel: 'Use Here'",
    ]) {
      expect(source, contains(contract), reason: 'Missing account-gate contract: $contract');
    }

    expect(source, isNot(contains('This SyncChat session was superseded')));
    expect(source, isNot(contains('This SyncChat account is blocked.')));
  });
}
