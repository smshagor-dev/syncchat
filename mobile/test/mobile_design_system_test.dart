import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('mobile theme keeps messenger-oriented component geometry', () {
    final theme = File('lib/theme.dart').readAsStringSync();

    for (final contract in [
      'toolbarHeight: 58',
      'borderRadius: BorderRadius.circular(18)',
      'FloatingActionButtonThemeData(',
      'SnackBarBehavior.floating',
      'BottomSheetThemeData(',
      'PopupMenuThemeData(',
    ]) {
      expect(theme, contains(contract), reason: 'Missing design token: $contract');
    }
  });

  test('shared pages avoid desktop-style navigation chrome', () {
    final widgets = File('lib/widgets.dart').readAsStringSync();

    expect(widgets, contains('final canPop = Navigator.canPop(context);'));
    expect(widgets, contains('automaticallyImplyLeading: false'));
    expect(widgets, contains('height: 58'));
    expect(widgets, contains('FontWeight.w700'));
  });

  test('primary navigation stays flat and messenger-like', () {
    final shell = File('lib/screens/live_mobile_shell.dart').readAsStringSync();

    expect(shell, contains('left: 0'));
    expect(shell, contains('right: 0'));
    expect(shell, contains('bottom: 0'));
    expect(shell, contains('height: 64'));
    expect(shell, contains('Icons.chat_bubble_rounded'));
    expect(shell, contains('Icons.call_rounded'));

    // Avoid regressing to the previous oversized floating glass dock.
    expect(shell, isNot(contains('blurRadius: 44')));
    expect(shell, isNot(contains('width: 32,\n                height: 6')));
  });

  test('calls screen stays compact and action-light', () {
    final calls = File('lib/screens/live_calls_screen.dart').readAsStringSync();

    expect(calls, contains("title: 'Calls'"));
    expect(calls, contains("label: const Text('Start a call')"));
    expect(calls, contains("'${meta.video ? 'Video' : 'Audio'} · ${meta.label}'"));
    expect(calls, contains('onTap: () => _openMessage(call, name)'));
    expect(calls, contains('video: meta.video'));

    // Keep the list closer to WhatsApp/Telegram instead of a dashboard card.
    expect(calls, isNot(contains("'All Calls'")));
    expect(calls, isNot(contains('_actionButton(')));
  });
}