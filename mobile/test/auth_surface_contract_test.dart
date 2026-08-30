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
}
