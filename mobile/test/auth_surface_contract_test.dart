import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('mobile auth covers the web authentication entry flows', () {
    final auth = File('lib/screens/final_auth_screen.dart').readAsStringSync();
    final social =
        File('lib/screens/mobile_social_auth_screen.dart').readAsStringSync();
    final deviceLink =
        File('lib/screens/device_link_qr_screen.dart').readAsStringSync();
    final repository =
        File('lib/core/auth_repository.dart').readAsStringSync();

    expect(auth, contains('_Mode.signIn'));
    expect(auth, contains('_Mode.signUp'));
    expect(auth, contains('_Mode.forgot'));
    expect(auth, contains('requestPasswordReset'));
    expect(auth, contains('verifyPasswordResetCode'));
    expect(auth, contains('resetPassword'));
    expect(auth, contains('verifyTwoFactor'));
    expect(auth, contains('Use a recovery code'));
    expect(auth, contains('DeviceLinkQrScreen'));

    expect(social, contains("provider: 'google'"));
    expect(social, contains("provider: 'facebook'"));
    expect(social, contains('verifySocialTwoFactor'));

    expect(repository, contains("'/users/device-link/info'"));
    expect(repository, contains("'shortCode': shortCode!.trim()"));
    expect(deviceLink, contains('Device link short code'));
    expect(deviceLink, contains('Continue with short code'));
    expect(
      deviceLink,
      contains('deviceLinkInfo(shortCode: code)'),
      reason: 'Web supports linking a device by QR or short code.',
    );
  });
}
