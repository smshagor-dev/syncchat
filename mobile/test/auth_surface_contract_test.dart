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
    expect(repository, contains("'token': token!.trim()"));
    expect(repository, contains("'shortCode': shortCode!.trim()"));

    expect(deviceLink, contains('MobileScanner('));
    expect(deviceLink, contains('QR token or link'));
    expect(deviceLink, contains('Continue with QR token'));
    expect(deviceLink, contains('6-digit device link code'));
    expect(deviceLink, contains('Continue with short code'));
    expect(
      deviceLink,
      contains('deviceLinkInfo(token: nextToken)'),
      reason: 'Web supports scanning or pasting the QR device-link token.',
    );
    expect(
      deviceLink,
      contains('deviceLinkInfo(shortCode: code)'),
      reason: 'Web supports linking a device with a 6-digit short code.',
    );
  });

  test('Google sign-in preserves native callback flow and explains code 10', () {
    final social =
        File('lib/screens/mobile_social_auth_screen.dart').readAsStringSync();

    expect(social, contains("import 'package:flutter/services.dart';"));
    expect(social, contains('on PlatformException catch'));
    expect(social, contains("failure.code == 'sign_in_failed'"));
    expect(social, contains("RegExp(r'(^|\\D)10(\\D|\$)')"));
    expect(social, contains('com.syncchat.live'));
    expect(social, contains('SHA-1 and SHA-256'));
    expect(social, isNot(contains('await signIn.signOut()')));
  });

  test('Android Google signing fingerprints stay documented', () {
    final source = File('android/GOOGLE_SIGN_IN.md').readAsStringSync();
    expect(source, contains('com.syncchat.live'));
    expect(
      source,
      contains('E7:40:54:93:52:9D:42:72:A7:7D:18:27:D2:0B:6B:59:8A:FD:0E:C1'),
    );
    expect(
      source,
      contains('16:8C:8F:5C:D8:4C:C6:22:EF:B5:57:E8:B9:01:F8:FF:5D:F5:8F:09:98:68:A7:74:E0:36:95:DF:CF:FB:B1:7E'),
    );
  });
}
