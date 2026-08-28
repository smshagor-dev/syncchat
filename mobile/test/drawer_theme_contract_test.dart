import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('full-page drawer follows active day and night theme', () {
    final shell = File('lib/screens/live_mobile_shell.dart').readAsStringSync();

    for (final contract in [
      'backgroundColor: context.panel',
      'color: context.ink',
      'color: context.muted',
      'color: context.border.withValues(alpha: .82)',
      'hoverColor: context.softPanel',
      'surfaceTintColor: Colors.transparent',
    ]) {
      expect(shell, contains(contract), reason: 'Missing drawer theme contract: $contract');
    }

    expect(
      shell,
      isNot(contains('backgroundColor: SyncColors.spill950')),
      reason: 'The production drawer must not force dark mode in day theme.',
    );
    expect(shell, isNot(contains('color: Colors.white70')));
    expect(shell, isNot(contains('color: Colors.white38')));
  });
}
