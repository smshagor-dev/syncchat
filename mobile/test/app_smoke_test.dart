import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:syncchat_mobile/core/app_services.dart';
import 'package:syncchat_mobile/core/session_store.dart';
import 'package:syncchat_mobile/main.dart';
import 'package:syncchat_mobile/screens.dart';
import 'package:syncchat_mobile/theme.dart';

void main() {
  testWidgets('SyncChat mobile app renders auth shell', (tester) async {
    final services = AppServices.create(sessionStore: MemorySessionStore());
    await tester.pumpWidget(SyncChatMobileApp(services: services));
    await tester.pumpAndSettle();

    expect(find.text('SyncChat'), findsOneWidget);
    expect(find.text('Sign in'), findsWidgets);
  });

  testWidgets('mobile shell exposes five primary tabs', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: SyncChatTheme.light(),
        home: MobileShell(onThemeChanged: (_) {}),
      ),
    );
    await tester.pump();

    expect(find.text('Chats'), findsWidgets);
    expect(find.text('Status'), findsOneWidget);
    expect(find.text('Communities'), findsOneWidget);
    expect(find.text('Channels'), findsOneWidget);
    expect(find.text('Calls'), findsOneWidget);
  });
}
