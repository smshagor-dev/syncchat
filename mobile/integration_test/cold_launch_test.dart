import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:syncchat_mobile/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('fresh Android cold launch reaches Flutter sign-in UI', (tester) async {
    app.main();
    await tester.pump();

    var reachedSignIn = false;
    for (var attempt = 0; attempt < 40; attempt++) {
      await tester.pump(const Duration(milliseconds: 500));
      if (find.text('Sign in').evaluate().isNotEmpty) {
        reachedSignIn = true;
        break;
      }
    }

    expect(
      reachedSignIn,
      isTrue,
      reason:
          'SyncChat did not leave Android startup and reach the Flutter sign-in UI within 20 seconds.',
    );
    expect(find.text('SyncChat'), findsWidgets);
  });
}
