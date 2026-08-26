import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('production app gates the live shell behind account verification', () {
    final mainSource = File('lib/main.dart').readAsStringSync();
    final gateSource =
        File('lib/widgets/authenticated_account_gate.dart').readAsStringSync();

    expect(mainSource, contains('AuthenticatedAccountGate('));
    expect(gateSource, contains("account['verified'] != true"));
    expect(gateSource, contains('verifyAccount(code)'));
    expect(gateSource, contains('resendVerification()'));
    expect(gateSource, contains("'user/inactivate'"));
    expect(gateSource, contains('Account unavailable'));
  });

  test('verification gate uses live backend contracts instead of mock parity UI', () {
    final source = File('lib/widgets/authenticated_account_gate.dart').readAsStringSync();

    expect(source, contains('context.services.auth.verifyAccount'));
    expect(source, contains('context.services.auth.resendVerification'));
    expect(source, contains('context.services.chat.currentUser(refresh: true)'));
  });
}
